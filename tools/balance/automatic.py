"""Target-only automatic banks: finite traverse, lock, ammo and delayed impacts."""
import math
import statistics

from model import control_for, damage, max_range, sample_hit, scenario_rng, trajectory


def angle_delta(a, b):
    return (a - b + 180) % 360 - 180


def eligible(bank, target):
    distance = math.hypot(target['x'], target['y'])
    bearing = math.degrees(math.atan2(target['y'], target['x'])) % 360
    return (target['enemy'] and target['visible'] and target['hp'] > 0
            and target['kind'] == ('ship' if bank['role'] == 'surface' else 'aircraft')
            and bank['min_range_u'] <= distance <= bank['max_range_u']
            and abs(angle_delta(bearing, bank['bearing_deg'])) <= bank['arc_deg'] / 2)


def select_target(bank, targets):
    candidates = [t for t in targets if eligible(bank, t)]
    def priority(target):
        distance = math.hypot(target['x'], target['y'])
        if bank['role'] == 'surface':
            return (0 if target['class'] == 'DD' else 1, distance, target['id'])
        return (distance, target['hp'], target['id'])
    return min(candidates, key=priority) if candidates else None


class AutomaticBank:
    def __init__(self, bank, weapon):
        self.bank, self.weapon = bank, weapon
        self.target_id = None
        self.locked_since = 0
        self.yaw = 0.0
        self.next_fire = 0.0
        self.ammo = weapon['ammo_per_barrel']
        self.enabled = True

    def set_enabled(self, enabled):
        if type(enabled) is not bool:
            raise ValueError('automatic enable flag must be boolean')
        if enabled != self.enabled:
            self.enabled = enabled
            self.target_id = None
            self.locked_since = 0.0

    def update(self, targets, time, step, aim_bearing=None):
        if not self.enabled:
            return None
        target = next((t for t in targets if t['id'] == self.target_id and eligible(self.bank, t)), None)
        if target is None:
            target = select_target(self.bank, targets)
            self.target_id = target['id'] if target else None
            self.locked_since = time
        if target is None or not self.ammo:
            return None
        desired = math.degrees(math.atan2(target['y'], target['x'])) if aim_bearing is None else aim_bearing
        offset = angle_delta(desired, self.bank['bearing_deg'])
        if self.bank['arc_deg'] < 360 and abs(offset) > self.bank['arc_deg'] / 2:
            return None
        error = angle_delta(offset, self.yaw) if self.bank['arc_deg'] == 360 else offset - self.yaw
        movement = min(abs(error), self.bank['slew_deg_s'] * step)
        self.yaw += math.copysign(movement, error)
        remaining = angle_delta(offset, self.yaw)
        if (abs(remaining) > self.bank['aim_tolerance_deg']
                or time + 1e-9 < self.locked_since + self.bank['lock_s']
                or time + 1e-9 < self.next_fire):
            return None
        self.ammo -= 1
        self.next_fire = time + self.weapon['reload_s']
        return target


def banks_for(data, ship_id, role):
    slot = 'light_aa' if role == 'aa' else 'secondary'
    control = control_for(data, ship_id, slot)
    if control is None or control['control'] != 'automatic':
        return []
    return [b for b in data['automation'].values() if b['ship_id'] == ship_id and b['role'] == role]


def aa_dps(data, ship_id, distance=0):
    return sum(b['mounts'] * b['barrels'] * data['weapons'][b['weapon_id']]['damage']
               * b['hit_probability'] / data['weapons'][b['weapon_id']]['reload_s']
               for b in banks_for(data, ship_id, 'aa')
               if b['min_range_u'] <= distance <= b['max_range_u'])


def orbit_trial(data, defender_id, distance, enabled, dd_id='scout_dd'):
    defender, dd = data['ships'][defender_id], data['ships'][dd_id]
    settings, rules = data['settings'], data['rules']
    step, limit, runs = settings['auto_step_s'], settings['auto_limit_s'], settings['auto_runs']
    configs = banks_for(data, defender_id, 'surface') if enabled else []
    angular_speed = dd['speed_u_s'] / distance
    dd_gun = data['weapons'][dd['main_weapon_id']]
    dd_damage = damage(dd_gun, data['shells']['HE'], data['armor'][defender['armor_id']], distance, 0, rules)[0]
    dd_flight = trajectory(dd_gun, distance, rules)[1]
    rng = scenario_rng(data, f'orbit:{defender_id}:{distance}:{enabled}')
    sunk_times, dd_losses, bb_losses, fired, hit_count = [], [], [], [], []
    bb_sunk = mutual = 0
    for run_index in range(runs):
        dd_rng = scenario_rng(data, f'orbit-dd:{defender_id}:{dd_id}:{distance}:{run_index}')
        states = [AutomaticBank(b, data['weapons'][b['weapon_id']]) for b in configs]
        hp, bb_hp = dd['hp'], defender['hp']
        pending = []
        next_dd, dd_ammo = 7.0, dd_gun['ammo_per_barrel']
        shots = hits = 0
        for tick in range(math.floor(limit / step) + 1):
            time = tick * step
            losses = [0, 0]
            remaining = []
            for due, victim, amount in pending:
                if due <= time + 1e-9:
                    losses[victim] += amount
                else:
                    remaining.append((due, victim, amount))
            pending = remaining
            hp, bb_hp = max(0, hp - losses[0]), max(0, bb_hp - losses[1])
            if hp == 0 or bb_hp == 0:
                if hp == 0:
                    sunk_times.append(time)
                if bb_hp == 0:
                    bb_sunk += 1
                if hp == 0 and bb_hp == 0:
                    mutual += 1
                break
            angle = math.pi / 2 + angular_speed * time
            x, y = distance * math.cos(angle), distance * math.sin(angle)
            vx, vy = -dd['speed_u_s'] * math.sin(angle), dd['speed_u_s'] * math.cos(angle)
            target = {'id': dd['id'], 'kind': 'ship', 'class': 'DD', 'enemy': True, 'visible': distance <= rules['detection_range'], 'hp': hp, 'x': x, 'y': y}
            for state in states:
                gun = state.weapon
                flight = trajectory(gun, distance, rules)[1]
                # Constant-velocity lead; the actual DD continues a curved orbit.
                for _ in range(4):
                    px, py = x + vx * flight, y + vy * flight
                    aim_range = math.hypot(px, py)
                    flight = trajectory(gun, min(aim_range, max_range(gun, rules)), rules)[1]
                px, py = x + vx * flight, y + vy * flight
                aim_range = math.hypot(px, py)
                aim = math.atan2(py, px)
                if aim_range > max_range(gun, rules):
                    continue
                if state.update([target], time, step, math.degrees(aim)) is None:
                    continue
                actual_angle = angle + angular_speed * flight
                ax, ay = distance * math.cos(actual_angle), distance * math.sin(actual_angle)
                dx, dy = ax - px, ay - py
                along = dx * math.cos(aim) + dy * math.sin(aim)
                cross = -dx * math.sin(aim) + dy * math.cos(aim)
                heading = math.degrees(actual_angle + math.pi / 2 - aim)
                barrels = state.bank['mounts'] * state.bank['barrels']
                landed = sum(sample_hit(rng, gun, dd, aim_range, heading, along, cross) for _ in range(barrels))
                amount = damage(gun, data['shells']['HE'], data['armor'][dd['armor_id']], aim_range, 0, rules)[0]
                pending.append((time + flight, 0, landed * amount))
                shots += barrels
                hits += landed
            if dd_ammo and time + 1e-9 >= next_dd:
                landed = sum(sample_hit(dd_rng, dd_gun, defender, distance, 90) for _ in range(dd['main_mounts'] * dd['main_barrels']))
                pending.append((time + dd_flight, 1, landed * dd_damage))
                next_dd, dd_ammo = time + dd_gun['reload_s'], dd_ammo - 1
        dd_losses.append(dd['hp'] - hp)
        bb_losses.append(defender['hp'] - bb_hp)
        fired.append(shots)
        hit_count.append(hits)
    return {'id': f'{defender_id}:orbit:{distance}:{"auto" if enabled else "off"}',
            'defender': defender_id, 'dd': dd['id'], 'distance_u': distance,
            'automatic_enabled': enabled, 'runs': runs, 'dd_sunk': len(sunk_times),
            'bb_sunk': bb_sunk, 'mutual_sink': mutual, 'unresolved': runs - len(sunk_times) - bb_sunk + mutual,
            'dd_sink_median_s': statistics.median(sunk_times) if sunk_times else None,
            'mean_dd_damage': statistics.mean(dd_losses), 'mean_bb_damage': statistics.mean(bb_losses),
            'secondary_shots': sum(fired), 'secondary_hits': sum(hit_count),
            'limit_s': limit, 'dd_orbit_deg_s': math.degrees(angular_speed)}


def aircraft_trial(data, defender_id, carrier_id):
    ship, carrier = data['ships'][defender_id], data['ships'][carrier_id]
    weapon = data['weapons'][carrier['main_weapon_id']]
    configs = banks_for(data, defender_id, 'aa')
    settings, rules = data['settings'], data['rules']
    start = min(rules['detection_range'], max(b['max_range_u'] for b in configs))
    attack_range, step = settings['aa_attack_distance_u'], settings['auto_step_s']
    duration = max(0, (start - attack_range) / weapon['travel_u_s'])
    count = carrier['main_mounts'] * carrier['main_barrels']
    rng = scenario_rng(data, f'aa:{defender_id}:{carrier_id}')
    survivors, damage_taken = [], []
    shots = hit_count = 0
    for _ in range(settings['auto_runs']):
        states = [AutomaticBank(b, data['weapons'][b['weapon_id']]) for b in configs]
        planes = [{'id': f'plane:{i}', 'kind': 'aircraft', 'class': '', 'enemy': True, 'visible': True,
                   'hp': rules['aircraft_hp'], 'x': start, 'y': 0} for i in range(count)]
        pending = []
        for tick in range(math.ceil(duration / step) + 1):
            time = min(tick * step, duration)
            remaining = []
            for due, victim, amount in pending:
                if due <= time + 1e-9:
                    planes[victim]['hp'] = max(0, planes[victim]['hp'] - amount)
                else:
                    remaining.append((due, victim, amount))
            pending = remaining
            if time >= duration:
                break
            distance = start - weapon['travel_u_s'] * time
            for plane in planes:
                plane['x'] = distance
            for state in states:
                target = state.update(planes, time, step)
                if target is None:
                    continue
                barrels = state.bank['mounts'] * state.bank['barrels']
                hits = sum(rng.random() < state.bank['hit_probability'] for _ in range(barrels))
                pending.append((time + distance / state.weapon['travel_u_s'], int(target['id'].split(':')[1]), hits * state.weapon['damage']))
                shots += barrels
                hit_count += hits
        survivors.append(sum(p['hp'] > 0 for p in planes))
        damage_taken.append(sum(rules['aircraft_hp'] - p['hp'] for p in planes))
    mean_survivors = statistics.mean(survivors)
    return {'id': f'{defender_id}:aa:{carrier_id}', 'defender': defender_id, 'carrier': carrier_id,
            'runs': settings['auto_runs'], 'planes': count, 'approach_s': duration,
            'mean_survivors': mean_survivors, 'mean_kills': count - mean_survivors,
            'mean_aircraft_damage': statistics.mean(damage_taken), 'aa_shots': shots, 'aa_hits': hit_count,
            'expected_raid_damage': mean_survivors * rules['aircraft_attack_hit_probability'] * weapon['damage'],
            'no_aa_raid_damage': count * rules['aircraft_attack_hit_probability'] * weapon['damage']}


def automatic_trials(data):
    surface, air = [], []
    for scenario in data['auto_scenarios'].values():
        if scenario['kind'] == 'orbit':
            for enabled in (False, True):
                row = orbit_trial(data, scenario['defender_id'], scenario['distance_u'], enabled, scenario['attacker_id'])
                row['id'] = scenario['id'] + (':auto' if enabled else ':off')
                surface.append(row)
        else:
            row = aircraft_trial(data, scenario['defender_id'], scenario['attacker_id'])
            row['id'] = scenario['id']
            air.append(row)
    return surface, air
