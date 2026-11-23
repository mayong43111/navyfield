"""Validate CSV truth and regenerate deterministic offline balance artifacts."""
import argparse
import csv
import json
import math
import platform
import statistics
import tempfile
from pathlib import Path

from model import ROOT, closing_time, damage, load_data, max_range, sample_hit, scenario_rng, trajectory, traveled
from automatic import aa_dps, automatic_trials, banks_for
from model import control_for, mode_for
from manual_aa import manual_air_trials


def rounded(value):
    return round(value, 4) if isinstance(value, float) else value


def write_csv(path, rows):
    with path.open('w', encoding='utf-8', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows({key: rounded(value) for key, value in row.items()} for row in rows)


def gun_trial(data, scenario):
    attacker = data['ships'][scenario['attacker_id']]
    target = data['ships'][scenario['target_id']]
    gun = data['weapons'][attacker['main_weapon_id']]
    shell = data['shells'][scenario['shell_id']]
    hit_damage, zone, outcome = damage(gun, shell, data['armor'][target['armor_id']], scenario['range_u'], scenario['impact_obliquity_deg'], data['rules'])
    barrels = attacker['main_mounts'] * attacker['main_barrels']
    shots = scenario['salvos'] * barrels
    rng = scenario_rng(data, scenario['id'])
    hits = sum(sample_hit(rng, gun, target, scenario['range_u'], scenario['target_heading_deg']) for _ in range(shots))
    probability = hits / shots
    # Wilson interval remains meaningful even at zero/all hits.
    z = 1.96
    center = (probability + z * z / (2 * shots)) / (1 + z * z / shots)
    half = z * math.sqrt(probability * (1 - probability) / shots + z * z / (4 * shots * shots)) / (1 + z * z / shots)
    expected = barrels * probability * hit_damage
    flight = trajectory(gun, scenario['range_u'], data['rules'])[1]
    return {
        'id': scenario['id'], 'attacker': attacker['id'], 'target': target['id'],
        'shell': shell['id'], 'range_u': scenario['range_u'], 'shots': shots,
        'hits': hits, 'hit_rate': probability, 'hit_ci95_low': center - half,
        'hit_ci95_high': center + half, 'zone': zone, 'outcome': outcome,
        'damage_per_hit': hit_damage, 'expected_salvo_damage': expected,
        'expected_dps': expected / gun['reload_s'],
        'mean_energy_ttk_s': target['hp'] / (expected / gun['reload_s']) if expected else None,
        'flight_s': flight,
        'magazine_duration_s': (gun['ammo_per_barrel'] - 1) * gun['reload_s'],
    }


def duel_trial(data, scenario):
    attacker = data['ships'][scenario['attacker_id']]
    target = data['ships'][scenario['target_id']]
    sides = [attacker, target]
    guns = [data['weapons'][s['main_weapon_id']] for s in sides]
    distance = scenario['range_u']
    if any(distance > max_range(g, data['rules']) for g in guns):
        return None
    shell = data['shells'][scenario['shell_id']]
    damages = [damage(guns[i], shell, data['armor'][sides[1-i]['armor_id']], distance, scenario['impact_obliquity_deg'], data['rules'])[0] for i in (0, 1)]
    flights = [trajectory(g, distance, data['rules'])[1] for g in guns]
    rng = scenario_rng(data, 'duel:' + scenario['id'])
    runs = data['settings']['duel_runs']
    limit = data['settings']['duel_limit_s']
    initial = data['rooms']['skirmish']['initial_reload_s']
    wins = [0, 0]
    mutual = timeouts = 0
    resolutions = []
    for _ in range(runs):
        hp = [s['hp'] for s in sides]
        ammo = [g['ammo_per_barrel'] for g in guns]
        next_fire = [initial, initial]
        pending = []
        time = 0.0
        while time <= limit:
            next_impact = min((event[0] for event in pending), default=math.inf)
            time = min(*next_fire, next_impact)
            if time > limit:
                break
            # Arriving shots resolve simultaneously before firing at the same time.
            arrivals = [event for event in pending if abs(event[0] - time) < 1e-8]
            pending = [event for event in pending if abs(event[0] - time) >= 1e-8]
            losses = [0, 0]
            for _, victim, amount in arrivals:
                losses[victim] += amount
            hp = [max(0, hp[i] - losses[i]) for i in (0, 1)]
            if not all(hp):
                break
            for i in (0, 1):
                if abs(next_fire[i] - time) < 1e-8:
                    hits = sum(sample_hit(rng, guns[i], sides[1-i], distance, scenario['target_heading_deg']) for _ in range(sides[i]['main_mounts'] * sides[i]['main_barrels']))
                    pending.append((time + flights[i], 1-i, hits * damages[i]))
                    ammo[i] -= 1
                    next_fire[i] = time + guns[i]['reload_s'] if ammo[i] else math.inf
        if hp[0] and hp[1]:
            timeouts += 1
        else:
            resolutions.append(time)
            if not hp[0] and not hp[1]:
                mutual += 1
            else:
                wins[0 if hp[0] else 1] += 1
    ordered = sorted(resolutions)
    return {
        'id': scenario['id'], 'runs': runs, 'attacker_wins': wins[0],
        'target_wins': wins[1], 'mutual_sink': mutual, 'timeouts': timeouts,
        'resolved_median_s': statistics.median(ordered) if ordered else None,
        'resolved_p90_s': ordered[math.ceil(0.9 * len(ordered)) - 1] if ordered else None,
        'time_limit_s': limit,
    }


def room_trials(data):
    results = []
    active = [s for s in data['ships'].values() if s['phase'] == 1]
    pairs = [('scout_dd', 'scout_dd'), ('scout_dd', 'yamato'), ('california', 'california'), ('bismarck', 'bismarck'), ('yamato', 'yamato')]
    for room in data['rooms'].values():
        if room['phase'] != 1:
            continue
        for aid, bid in pairs:
            a, b = data['ships'][aid], data['ships'][bid]
            ranges = [max_range(data['weapons'][s['main_weapon_id']], data['rules']) for s in (a, b)]
            for placement, gap in [('center', room['center_gap_u']), ('nearest_legal', room['center_gap_u'] - room['spawn_width_u'] + 2 * data['rules']['spawn_edge_margin'])]:
                fire = max(room['initial_reload_s'], closing_time(a, b, gap, min(max(ranges), data['rules']['detection_range'])))
                firing_ship = a if ranges[0] >= ranges[1] else b
                gun = data['weapons'][firing_ship['main_weapon_id']]
                remaining = max(0, gap - traveled(a, fire) - traveled(b, fire))
                flight = trajectory(gun, min(remaining, max(ranges)), data['rules'])[1]
                mutual = max(room['initial_reload_s'], closing_time(a, b, gap, min(ranges)))
                results.append({
                    'room': room['id'], 'a': aid, 'b': bid, 'placement': placement,
                    'gap_u': gap, 'first_fire_after_start_s': fire,
                    'first_salvo_arrival_after_start_s': fire + flight,
                    'mutual_range_after_start_s': mutual,
                    'planned_enter_to_first_fire_s': room['ready_budget_s'] + room['countdown_s'] + fire,
                })
        gap = room['center_gap_u'] - room['spawn_width_u'] + 2 * data['rules']['spawn_edge_margin']
        candidates = []
        for i, a in enumerate(active):
            for b in active[i:]:
                reach = max(max_range(data['weapons'][s['main_weapon_id']], data['rules']) for s in (a, b))
                time = max(room['initial_reload_s'], closing_time(a, b, gap, min(reach, data['rules']['detection_range'])))
                candidates.append((time, a['id'], b['id']))
        fastest = min(candidates)
        a, b = data['ships'][fastest[1]], data['ships'][fastest[2]]
        ranges = [max_range(data['weapons'][s['main_weapon_id']], data['rules']) for s in (a, b)]
        firing_ship = a if ranges[0] >= ranges[1] else b
        remaining = max(0, gap - traveled(a, fastest[0]) - traveled(b, fastest[0]))
        flight = trajectory(data['weapons'][firing_ship['main_weapon_id']], min(remaining, max(ranges)), data['rules'])[1]
        results.append({'room': room['id'], 'a': a['id'], 'b': b['id'], 'placement': 'fastest_of_all_36_pairs', 'gap_u': gap, 'first_fire_after_start_s': fastest[0], 'first_salvo_arrival_after_start_s': fastest[0] + flight, 'mutual_range_after_start_s': max(room['initial_reload_s'], closing_time(a, b, gap, min(ranges))), 'planned_enter_to_first_fire_s': room['ready_budget_s'] + room['countdown_s'] + fastest[0]})
    longest = max(max_range(data['weapons'][s['main_weapon_id']], data['rules']) for s in active)
    for sid in ('scout_dd', 'california', 'bismarck', 'yamato'):
        s = data['ships'][sid]
        own_range = max_range(data['weapons'][s['main_weapon_id']], data['rules'])
        # Current global 14 u/s has no documented per-ship acceleration: full speed is a lower bound.
        lower = (10 * longest - own_range) / 28
        results.append({'room': 'legacy_10R_lower_bound', 'a': sid, 'b': sid, 'placement': 'edge_no_margin', 'gap_u': 10 * longest, 'first_fire_after_start_s': lower, 'first_salvo_arrival_after_start_s': None, 'mutual_range_after_start_s': lower, 'planned_enter_to_first_fire_s': None})
    return results


def extra_trials(data):
    rules = data['rules']
    results = []
    for ship in data['ships'].values():
        fire = ship['hp'] * rules['fire_dps_hp_fraction'] * rules['fire_duration']
        repair = ship['hp'] * rules['repair_hp_fraction']
        results.append({'id': 'utility:' + ship['id'], 'kind': 'utility', 'value_1': fire, 'value_2': repair, 'value_3': math.pi * ship['turn_radius_u'] / ship['speed_u_s'], 'meaning': 'one_fire_hp;one_repair_hp;full_speed_180_turn_s'})
    for room in data['rooms'].values():
        if room['phase'] != 1:
            continue
        ship = data['ships']['scout_dd']
        travel = closing_time(ship, dict(ship, initial_speed_u_s=0, speed_u_s=0), room['center_gap_u'] / 2, rules['capture_radius'])
        results.append({'id': 'capture:' + room['id'], 'kind': 'capture', 'value_1': travel, 'value_2': travel + rules['capture_time'], 'value_3': room['combat_limit_s'], 'meaning': 'center_spawn_scout_arrival_s;uncontested_capture_finish_s;combat_limit_s'})
    for wid in ('torpedo_fast', 'torpedo_long'):
        weapon = data['weapons'][wid]
        target = data['ships']['yamato']
        armor = data['armor'][target['armor_id']]
        reduced = weapon['damage'] * (1 - armor['torpedo_reduction'])
        bulge = target['bulge_hp']
        hull = 0.0
        for _ in range(2):
            absorbed = min(bulge, reduced)
            bulge -= absorbed
            hull += reduced - absorbed
        results.append({'id': wid, 'kind': 'future_torpedo', 'value_1': weapon['range_u'] / weapon['travel_u_s'], 'value_2': hull, 'value_3': 8 * rules['torpedo_hit_probability'] * reduced, 'meaning': 'max_range_travel_s;two_hits_hull_damage;8_torpedo_expected_prebulge_damage'})
    for sid in ('yorktown', 'light_cv'):
        ship = data['ships'][sid]
        weapon = data['weapons'][ship['main_weapon_id']]
        planes = ship['main_mounts'] * ship['main_barrels']
        survival = max(0, 1 - aa_dps(data, 'yamato') * rules['aircraft_aa_exposure'] / (planes * rules['aircraft_hp']))
        damage_value = planes * survival * rules['aircraft_attack_hit_probability'] * weapon['damage']
        results.append({'id': sid, 'kind': 'future_aircraft', 'value_1': survival, 'value_2': damage_value, 'value_3': weapon['reload_s'] + 2 * 4000 / weapon['travel_u_s'], 'meaning': 'expected_survival_fraction;expected_raid_damage;4000u_prepare_roundtrip_cycle_s'})
    return results


def ship_traits(data):
    rows = []
    settings = data['settings']
    for ship in data['ships'].values():
        weapon = data['weapons'][ship['main_weapon_id']]
        profile = data['profiles'][ship['id']]
        count = ship['main_mounts'] * ship['main_barrels']
        trial = None
        if weapon['kind'] == 'gun':
            trial = gun_trial(data, {'id': 'trait:' + ship['id'], 'attacker_id': ship['id'], 'target_id': settings['trait_target_id'], 'shell_id': 'HE', 'range_u': settings['trait_range_u'], 'target_heading_deg': 90, 'impact_obliquity_deg': 0, 'salvos': settings['trait_salvos']})
        rows.append({
            'id': ship['id'], 'name': ship['name'], 'phase': ship['phase'],
            'role': profile['role'], 'strength': profile['strength'],
            'weakness': profile['weakness'], 'tactics': profile['tactics'],
            'preferred_min_u': profile['preferred_min_u'], 'preferred_max_u': profile['preferred_max_u'],
            'speed_u_s': ship['speed_u_s'], 'hp': ship['hp'],
            'turn_180_s': math.pi * ship['turn_radius_u'] / ship['speed_u_s'],
            'main_kind': weapon['kind'], 'main_range_u': max_range(weapon, data['rules']),
            'main_reload_s': weapon['reload_s'], 'main_projectiles': count,
            'main_single_energy': weapon['damage'], 'main_salvo_energy': count * weapon['damage'],
            'main_cycle_raw_rate': count * weapon['damage'] / weapon['reload_s'],
            'main_penetration_mm': weapon['penetration_mm'] if trial else None,
            'reference_target': settings['trait_target_id'] if trial else None,
            'reference_range_u': settings['trait_range_u'] if trial else None,
            'reference_he_hit_rate': trial['hit_rate'] if trial else None,
            'reference_he_ci95_low': trial['hit_ci95_low'] if trial else None,
            'reference_he_ci95_high': trial['hit_ci95_high'] if trial else None,
            'reference_he_dps': trial['expected_dps'] if trial else None,
            'secondary_kind': data['weapons'][ship['secondary_weapon_id']]['kind'] if ship['secondary_weapon_id'] else None,
            'secondary_range_u': (max(b['max_range_u'] for b in banks_for(data, ship['id'], 'surface')) if banks_for(data, ship['id'], 'surface') else max_range(data['weapons'][ship['secondary_weapon_id']], data['rules']) if ship['secondary_weapon_id'] else None),
            'main_control': control_for(data, ship['id'], 'main')['control'],
            'main_modes': control_for(data, ship['id'], 'main')['available_modes'],
            'main_manual_aa_range_u': mode_for(data, weapon['id'], 'air')['range_u'] if mode_for(data, weapon['id'], 'air') else None,
            'secondary_control': control_for(data, ship['id'], 'secondary')['control'] if ship['secondary_weapon_id'] else 'none',
            'secondary_modes': control_for(data, ship['id'], 'secondary')['available_modes'] if ship['secondary_weapon_id'] else 'none',
            'light_aa_control': control_for(data, ship['id'], 'light_aa')['control'],
            'aa_mid_range_u': max(b['max_range_u'] for b in banks_for(data, ship['id'], 'aa')),
            'aa_dps_600u': aa_dps(data, ship['id'], 600),
            'aa_dps_1200u': aa_dps(data, ship['id'], 1200),
        })
    return rows


def report(data, gunnery, duels, rooms, extra, traits, surface, air, manual_air):
    lines = [
        '# 目标数值试算报告（自动生成）', '',
        f'- 规则：`{data["rules"]["rule_version"]}`；种子：`{data["settings"]["seed"]}`。',
        f'- 输入 SHA-256：`{data["input_sha256"]}`。',
        '- 全部数值为自研目标，不是史实或原版公式；目标数值现已接入单机1对1，离线任务/修理/占点报告不代表运行功能已实现。',
        '- 运行环境与完整精度见 [summary.json](summary.json)；编辑入口见 [设计说明](../../../docs/game-design/balance-target.md)。', '',
        '## 舰船规模与火力', '',
        '首版 8 艘：2 DD、2 CL、1 CA、3 BB；二期增加2艘雷击舰；三期增加2艘CV，总计12艘。全部已指定真实舰名与精确模型来源；4种本地外形、8个未下载候选，许可与炮口适配见模型清单。现有可战斗外形仍只有3种BB。只保留AP/HE炮弹，鱼雷为独立武器。炮位、目标能力、控制方式分别配置；当前近防副炮与20/40级防空采用自动控制，弗莱彻现有4管主炮新增手动两用模式。副炮不是自动炮的同义词，防空炮也不全是自动炮。', '',
        '| 舰型 | 期 | HP | 初速/满速 u/s | 主武器配置 | 第二武器配置 | 主武器射程 u |',
        '|---|---:|---:|---:|---|---|---:|',
    ]
    for ship in data['ships'].values():
        gun = data['weapons'][ship['main_weapon_id']]
        second = f'{ship["secondary_weapon_id"]} {ship["secondary_mounts"]}×{ship["secondary_barrels"]}' if ship['secondary_weapon_id'] else '无'
        lines.append(f'| {ship["name"]} | {ship["phase"]} | {ship["hp"]:.0f} | {ship["initial_speed_u_s"]}/{ship["speed_u_s"]} | {gun["name"]} {ship["main_mounts"]}×{ship["main_barrels"]} | {second} | {max_range(gun, data["rules"]):.1f} |')
    lines += ['', '### 炮位、能力与控制：全部12舰', '',
              '这里列的是目标配装已建模能力，不是史实全部炮组；航母主武器manual表示玩家指挥航空攻击，不是手动防空舰炮。BB大口径两用/重防空炮组尚未设计，本次不虚构补装。', '',
              '| 舰名 | 主武器控制/目标模式 | 第二武器控制/目标模式 | 小口径防空控制 |',
              '|---|---|---|---|']
    for row in traits:
        lines.append(f'| {row["name"]} | {row["main_control"]}/{row["main_modes"].replace("|", "+")} | {row["secondary_control"]}/{row["secondary_modes"].replace("|", "+")} | {row["light_aa_control"]} |')
    lines += ['', '## 每舰差异化：优势必须伴随代价', '',
              '| 舰型/定位 | 优势 | 代价 | 推荐打法/距离u |',
              '|---|---|---|---|']
    for row in traits:
        lines.append(f'| {row["name"]}/{row["role"]} | {row["strength"]} | {row["weakness"]} | {row["tactics"]}；{row["preferred_min_u"]:.0f}–{row["preferred_max_u"]:.0f} |')
    lines += ['', '### 火力指标对照', '',
              '单轮能量=主武器数量×单发基础伤害（HE炮弹或航空炸弹），不计命中/装甲/副炮；理论循环率=单轮能量/装填或准备时间。飞机该率没有往返时间，不可直接与舰炮实战DPS比较。', '',
              '| 舰型 | 类别 | 射程u | 装填/准备s | 单发能量 | 单轮数量 | 单轮能量 | 理论循环率 |',
              '|---|---|---:|---:|---:|---:|---:|---:|']
    for row in traits:
        lines.append(f'| {row["name"]} | {row["main_kind"]} | {row["main_range_u"]:.1f} | {row["main_reload_s"]} | {row["main_single_energy"]:.0f} | {row["main_projectiles"]} | {row["main_salvo_energy"]:.0f} | {row["main_cycle_raw_rate"]:.1f} |')
    lines += ['', '### 统一靶标比较', '',
              f'同为{data["settings"]["trait_range_u"]:.0f}u、HE、正横、{data["ships"][data["settings"]["trait_target_id"]]["name"]}靶标，每舰{data["settings"]["trait_salvos"]}次齐射。隔离目标大小/装甲差异；只比较主炮，后续鱼雷/航空不混入。', '',
              '| 舰型 | 命中率（95%区间） | 期望主炮HE DPS |', '|---|---|---:|']
    for row in traits:
        if row['main_kind'] == 'gun':
            lines.append(f'| {row["name"]} | {row["reference_he_hit_rate"]:.2%} ({row["reference_he_ci95_low"]:.2%}–{row["reference_he_ci95_high"]:.2%}) | {row["reference_he_dps"]:.1f} |')
    lines += ['', '该比较不代表AP穿深收益或舰队胜率。支援CL精度优势可能抵消慢装填；大和单轮与射程领先不等于持续DPS领先；差异化验收采用同类舰优势/代价顺序测试而非人为综合评分。', '']
    lines += ['', '## 主炮蒙特卡洛：静态预瞄、每管独立散布', '',
              '不含副炮/火灾/修理/导航/射界；命中是椭圆落点与旋转舰体矩形相交。期望DPS不是实际扣血曲线，能量TTK=HP/期望DPS，不含初装填与飞行。95%区间仅覆盖独立采样误差，不覆盖模型误差。', '',
              '| 场景 | 弹种 | 距离 | 命中率（95%区间） | 每命中伤害/结果 | 期望DPS | 能量TTK s |', '|---|---|---:|---|---|---:|---:|']
    for row in gunnery:
        ttk = f'{row["mean_energy_ttk_s"]:.1f}' if row['mean_energy_ttk_s'] is not None else '∞'
        lines.append(f'| {row["id"]} | {row["shell"]} | {row["range_u"]:.0f} | {row["hit_rate"]:.2%} ({row["hit_ci95_low"]:.2%}–{row["hit_ci95_high"]:.2%}) | {row["damage_per_hit"]}/{row["zone"]}/{row["outcome"]} | {row["expected_dps"]:.1f} | {ttk} |')
    lines += ['', '## 离散主炮对射', '',
              '双方固定距离、同弹种与几何参数，7秒首次开火；逐齐射扣弹、飞行后同时结算。先到的致死弹阻止后续开火，已在途弹仍在未结束时结算。只统计首个击沉/同时击沉，未结算后续追击。900秒或耗尽弹药仍存活计超时；不将超时样本当成900秒击沉。', '',
              '| 场景 | 次数 | 攻方胜/守方胜/同沉/超时 | 已决中位 s | 已决P90 s |', '|---|---:|---|---:|---:|']
    for row in duels:
        median = f'{row["resolved_median_s"]:.1f}' if row['resolved_median_s'] is not None else '未决'
        p90 = f'{row["resolved_p90_s"]:.1f}' if row['resolved_p90_s'] is not None else '未决'
        lines.append(f'| {row["id"]} | {row["runs"]} | {row["attacker_wins"]}/{row["target_wins"]}/{row["mutual_sink"]}/{row["timeouts"]} | {median} | {p90} |')
    lines += ['', '## 房间接敌时序', '',
              '两舰正对同一直线、满动力加速、无障碍/转向；首次可射=max(初装填,驶入可见射程时间)，不保证首发命中。最近合法点含两侧各200u边界余量；不同初速与加速度均参与。入房到可射预算包含完整准备时长，全部READY可提前开始。', '',
              '| 房间 | 对阵 | 位置 | 间距u | 开战至首射s | 首轮抵达s | 双方入射程s | 入房至首射预算s |', '|---|---|---|---:|---:|---:|---:|---:|']
    for row in rooms:
        cells = [row['room'], row['a'] + '/' + row['b'], row['placement'], f'{row["gap_u"]:.0f}']
        cells += ['—' if row[key] is None else f'{row[key]:.1f}' for key in ('first_fire_after_start_s', 'first_salvo_arrival_after_start_s', 'mutual_range_after_start_s', 'planned_enter_to_first_fire_s')]
        lines.append('| ' + ' | '.join(cells) + ' |')
    lines += ['', '**10R对照只是布局政策试验**：R取本目标版本最长主炮射程，速度取当前原型统一上限14u/s，忽略加速、舰体边距及初始整备，故为接敌时间下界；不冒充当前配装的实际时间。当前原型自身R取决于出战配装与炮口高度，需运行时另测。', '',
              '## 其他机制的解析试算（非集成战斗）', '', '航空解析值仅作固定12秒近程总HP损耗预算，不是逐机击落结果；分层防空和存活机数以后一节试算为准。', '', '| 项目 | 值1 | 值2 | 值3 | 含义 |', '|---|---:|---:|---:|---|']
    for row in extra:
        lines.append(f'| {row["id"]} | {row["value_1"]:.2f} | {row["value_2"]:.2f} | {row["value_3"]:.2f} | {row["meaning"]} |')
    lines += ['', '## 自动副炮：近身绕行对照', '',
              'BB固定且关闭主炮，DD以满速沿圆周绕行并用HE攻击；自动副炮有分舷射界、有限转速、1秒锁定、常速提前量、曲线运动误差、散布、弹药与在途弹。开关对照不表示真人胜率，未击沉不等于安全；180秒截断。DD命中BB使用正横靶标近似，未模拟炮座遮挡/手动瞄准难度。', '',
              '| 场景 | 自动副炮 | DD击沉/BB击沉/未决 | DD击沉中位s | 平均DD损失HP | 平均BB损失HP |',
              '|---|---|---|---:|---:|---:|']
    for row in surface:
        median = '未决' if row['dd_sink_median_s'] is None else f'{row["dd_sink_median_s"]:.1f}'
        lines.append(f'| {row["id"]} | {row["automatic_enabled"]} | {row["dd_sunk"]}/{row["bb_sunk"]}/{row["unresolved"]} | {median} | {row["mean_dd_damage"]:.1f} | {row["mean_bb_damage"]:.1f} |')
    lines += ['', '## 自动防空炮：分层射程与逐机击落', '',
              '同一波飞机直线从中程防空边界接近至350u投弹；中近程炮组独立索敌、装填与弹仓，延迟到达、集中射击及过量伤害均计入。固定单弹命中概率是自研标定值而非航空物理；没有机动、返航和多舰叠加。同波只计投弹前生存飞机，投弹后到达的炮弹不阻止本次投弹。', '',
              '| 防御舰/来袭舰 | 飞机数 | 进场s | 平均击落 | 平均存活 | 期望投弹伤害/无AA基线 |',
              '|---|---:|---:|---:|---:|---:|']
    for row in air:
        lines.append(f'| {data["ships"][row["defender"]]["name"]}/{data["ships"][row["carrier"]]["name"]} | {row["planes"]} | {row["approach_s"]:.1f} | {row["mean_kills"]:.2f} | {row["mean_survivors"]:.2f} | {row["expected_raid_damage"]:.1f}/{row["no_aa_raid_damage"]:.1f} |')
    lines += ['', '详见 [自动火炮规则](../../../docs/game-design/automatic-weapons.md)；对应真实舰名与模型核实见 [模型清单](../../../docs/game-design/ship-models.md)。舰名是外形绑定，不表示目标炮座数量还原史实。', '']
    lines += ['', '## 弗莱彻手动两用主炮防空：独立编队对照', '',
              '4管主炮共用140发/管、3.5秒装填与2.5秒模式切换等待，7秒初始整备；手动防空期间不叠加同组对舰火力。HE定时爆炸半径30u、对飞机伤害337.5HP/命中、对空水平射程1600u、最大仰角75°。自动小口径炮是另一组，可与主炮并行。', '',
              '飞机高度120u，横向间隔80u，同一投弹线x=350u；主炮采用低弧截击、原有散布、每轮共同预瞄误差、每弹引信误差和球形爆炸。ideal/practiced/rough为人为误差输入，不是真人水平测量或胜率；爆炸仅在投弹前结算，过量与在途伤害不算额外击落。自动对照也使用相同展开编队与1600u起点，因此不得拿本表直接减去上节1200u、同坐标简化基线。', '',
              '| 来袭舰 | 误差档 | 防御组合 | 飞机数 | 平均击落 | 平均存活 | 期望投弹伤害/无AA |',
              '|---|---|---|---:|---:|---:|---:|']
    for row in manual_air:
        lines.append(f'| {data["ships"][row["carrier"]]["name"]} | {row["accuracy"]} | {row["defense"]} | {row["planes"]} | {row["mean_kills"]:.2f} | {row["mean_survivors"]:.2f} | {row["expected_raid_damage"]:.1f}/{row["no_aa_raid_damage"]:.1f} |')
    lines += ['', '误差定义、共享状态和BB边界详见 [炮组分类与手动防空](../../../docs/game-design/weapon-controls.md)。未模拟真人输入、炮座遮挡与转速、引信研发或BB重防空；不能据此声称已经解决全舰队防空平衡。', '']
    lines += ['', '## 结论与验收边界', '',
              '- 大口径AP适合正横装甲目标；对驱逐舰会过穿，HE更稳定；迎角增加与远射会改变穿透结果，不能只按口径排名。',
              '- 首版标准任务推荐4v4至8v8；以上对射不是全舰队模拟，不能据此保证阵容胜率。BB每队最多3艘的目标规则尚未接入。',
              '- 10R远距离政策会使满速接敌下界达到十几分钟；目标房间将部署尺度与武器尺度分开配置，没有更改现有10R要求。',
              '- 两次维修最多恢复16%最大HP，单火15秒损失0.75%HP；火灾概率与上限没有加入主炮试算。',
              '- 鱼雷防护只抵消鱼雷，先做装甲减伤、再消耗防雷容量；航空包括解析周转预算与分层逐机防空试算，仍不是完整飞机AI。',
              '- 本版只验证圆周DD的简化提前量偏差与分舷射界，没有验证任意机动、模型遮挡、船员、装甲重量、避碰、联网延迟、经济成长或渲染性能。后续接入需固定30Hz内核回归与真人试玩。', '']
    return '\n'.join(lines)


def generate(data, output):
    gunnery = [gun_trial(data, scenario) for scenario in data['scenarios'].values()]
    duels = [row for scenario in data['scenarios'].values() if (row := duel_trial(data, scenario)) is not None]
    rooms = room_trials(data)
    extra = extra_trials(data)
    traits = ship_traits(data)
    surface, air = automatic_trials(data)
    manual_air = manual_air_trials(data)
    summary = {'rule_version': data['rules']['rule_version'], 'input_sha256': data['input_sha256'], 'seed': data['settings']['seed'], 'python_version': platform.python_version(), 'model': 'offline-rectangle-impact-discrete-salvos-orbit-secondary-layered-aa-manual-timed-he', 'gunnery': gunnery, 'duels': duels, 'rooms': rooms, 'extra': extra, 'traits': traits, 'automatic_surface': surface, 'automatic_air': air, 'manual_air': manual_air}
    output.mkdir(parents=True, exist_ok=True)
    (output / 'normalized.json').write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    (output / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    for filename, rows in [('gunnery.csv', gunnery), ('duels.csv', duels), ('rooms.csv', rooms), ('extra.csv', extra), ('traits.csv', traits), ('automatic-surface.csv', surface), ('automatic-air.csv', air), ('manual-air.csv', manual_air)]:
        write_csv(output / filename, rows)
    (output / 'balance-report.md').write_text(report(data, gunnery, duels, rooms, extra, traits, surface, air, manual_air), encoding='utf-8')
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true', help='validate inputs without generating reports')
    mode.add_argument('--verify', action='store_true', help='regenerate in a temporary directory and compare all published bytes')
    parser.add_argument('--output', type=Path, default=ROOT / 'design-data/reports/target-v1')
    args = parser.parse_args()
    data = load_data()
    if args.check:
        print(f'Validated {len(data["ships"])} ships; {data["input_sha256"]}')
    elif args.verify:
        with tempfile.TemporaryDirectory() as directory:
            generated = Path(directory)
            generate(data, generated)
            mismatches = [path.name for path in generated.iterdir() if not (args.output / path.name).is_file() or path.read_bytes() != (args.output / path.name).read_bytes()]
            if mismatches:
                parser.exit(1, 'Stale reports (or different Python version): ' + ', '.join(sorted(mismatches)) + '\n')
            print(f'Verified all {len(list(generated.iterdir()))} generated artifacts byte-for-byte')
    else:
        summary = generate(data, args.output)
        print(f'Generated {len(summary["gunnery"])} gunnery scenarios, {len(summary["duels"])} duels, {len(summary["rooms"])} room trials in {args.output}')


if __name__ == '__main__':
    main()
