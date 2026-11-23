"""Offline target rules only; never imported by the running game."""
import csv
import hashlib
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCHEMAS = {
    'ships': ('phase main_mounts main_barrels secondary_mounts secondary_barrels aircraft_capacity',
              'hp length_u beam_u speed_u_s initial_speed_u_s acceleration_u_s2 turn_radius_u bulge_hp'),
    'weapons': ('phase ammo_per_barrel',
                'reload_s muzzle_u_s max_elevation_deg damage penetration_mm dispersion_long_base_u dispersion_long_ratio dispersion_cross_base_u dispersion_cross_ratio range_u travel_u_s'),
    'armor': ('', 'belt_mm deck_mm he_resistance_mm torpedo_reduction'),
    'shells': ('', 'damage_multiplier penetration_multiplier nonpenetration_fraction overpenetration_fraction ricochet_deg'),
    'rooms': ('phase ships_per_team', 'map_width_u map_height_u spawn_width_u spawn_height_u center_gap_u ready_budget_s countdown_s combat_limit_s initial_reload_s'),
    'scenarios': ('salvos', 'range_u target_heading_deg impact_obliquity_deg'),
    'profiles': ('', 'preferred_min_u preferred_max_u'),
    'automation': ('mounts barrels', 'bearing_deg arc_deg min_range_u max_range_u slew_deg_s lock_s aim_tolerance_deg hit_probability'),
    'auto_scenarios': ('', 'distance_u'),
    'models': ('', ''),
    'controls': ('', 'mode_switch_s'),
    'weapon_modes': ('', 'range_u max_elevation_deg burst_radius_u damage_multiplier'),
    'manual_aa_scenarios': ('', 'altitude_u formation_spacing_u aim_error_deg lead_error_s fuse_error_s'),
}
TEXT_FIELDS = {
    'ships': 'id name class armor_id main_weapon_id secondary_weapon_id source',
    'weapons': 'id name kind source', 'armor': 'id name source',
    'shells': 'id name source', 'rooms': 'id name source',
    'scenarios': 'id attacker_id target_id shell_id source',
    'profiles': 'id role strength weakness tactics source',
    'automation': 'id ship_id role weapon_id source',
    'auto_scenarios': 'id kind defender_id attacker_id source',
    'controls': 'id ship_id slot control available_modes source',
    'weapon_modes': 'id weapon_id mode target_kind shell_policy source',
    'manual_aa_scenarios': 'id defender_id attacker_id accuracy source',
    'models': 'id ship_name model_url author original_format license availability rights_status local_asset era_note layout_note checked_date source',
}
RULE_UNITS = {
    'schema_version': 'version', 'rule_version': 'version', 'gravity': 'u/s2',
    'deck_threshold_deg': 'deg', 'penetration_range_loss': 'ratio',
    'he_min_fraction': 'ratio', 'overpenetration_armor_ratio': 'ratio',
    'detection_range': 'u', 'fire_duration': 's', 'fire_dps_hp_fraction': '1/s',
    'fire_max_stacks': 'count', 'fire_chance': 'probability',
    'repair_hp_fraction': 'ratio', 'repair_duration': 's', 'repair_cooldown': 's',
    'repair_charges': 'count', 'capture_radius': 'u', 'capture_time': 's',
    'simulation_hz': 'Hz', 'fleet_bb_limit': 'count', 'fleet_cv_limit': 'count',
    'spawn_edge_margin': 'u', 'spawn_spacing': 'u',
    'torpedo_hit_probability': 'probability', 'aircraft_hp': 'hp',
    'aircraft_attack_hit_probability': 'probability', 'aircraft_aa_exposure': 's',
    'ai_observation_interval_s': 's', 'ai_reaction_delay_s': 's',
    'ai_position_error_u': 'u', 'ai_position_error_ratio': 'ratio',
    'ai_lead_fraction': 'ratio', 'ai_fire_delay_s': 's',
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_csv(path):
    with path.open(encoding='utf-8', newline='') as stream:
        reader = csv.DictReader(stream)
        require(reader.fieldnames and len(set(reader.fieldnames)) == len(reader.fieldnames), f'{path}: duplicate/empty headers')
        rows = list(reader)
    require(rows, f'{path}: empty table')
    ids = set()
    for row in rows:
        require(None not in row and None not in row.values(), f'{path}: malformed row')
        require(row.get('id') and row['id'] not in ids, f'{path}: missing/duplicate ID')
        source = row.get('source', '')
        if path.name == 'models.csv':
            require(source.startswith(('self-designed', 'research/models/')), f'{path}: missing model audit provenance')
        else:
            require(source.startswith('self-designed'), f'{path}: missing design provenance')
        ids.add(row['id'])
    return rows


def load_data(root=ROOT):
    data = {}
    paths = []
    for table, (integers, floats) in SCHEMAS.items():
        folder = 'experiments' if table in ('scenarios', 'auto_scenarios', 'manual_aa_scenarios') else 'source'
        path = root / 'design-data' / folder / f'{table}.csv'
        paths.append(path)
        rows = read_csv(path)
        expected = set((integers + ' ' + floats + ' ' + TEXT_FIELDS[table]).split())
        require(set(rows[0]) == expected, f'{table}: unknown/missing columns')
        for row in rows:
            for field in integers.split():
                row[field] = int(row[field])
                require(row[field] >= 0, f'{table}/{row["id"]}: negative {field}')
            for field in floats.split():
                row[field] = float(row[field])
                require(math.isfinite(row[field]) and row[field] >= 0, f'{table}/{row["id"]}: invalid {field}')
        data[table] = {row['id']: row for row in rows}
    for table, folder, units in [('rules', 'source', RULE_UNITS), ('settings', 'experiments', {'seed': 'integer', 'duel_runs': 'count', 'duel_limit_s': 's', 'trait_range_u': 'u', 'trait_salvos': 'count', 'trait_target_id': 'id', 'auto_runs': 'count', 'auto_limit_s': 's', 'auto_step_s': 's', 'aa_attack_distance_u': 'u'})]:
        path = root / 'design-data' / folder / f'{table}.csv'
        paths.append(path)
        rows = read_csv(path)
        require(set(rows[0]) == {'id', 'value', 'unit', 'source'}, f'{table}: unknown/missing columns')
        require({r['id'] for r in rows} == set(units), f'{table}: unknown/missing keys')
        values = {}
        for row in rows:
            require(row['unit'] == units[row['id']], f'{table}: wrong unit for {row["id"]}')
            if row['unit'] == 'id' or row['id'] == 'rule_version':
                value = row['value']
                require(bool(value), 'empty string setting')
                if row['id'] == 'rule_version':
                    require(value.startswith('target-'), 'not a target rule version')
            else:
                value = float(row['value'])
                require(math.isfinite(value) and value >= 0, f'{table}: invalid value')
                if row['unit'] in ('count', 'integer', 'Hz', 'version'):
                    require(value == int(value), f'{table}: integer required')
                    value = int(value)
                if row['unit'] in ('ratio', 'probability'):
                    require(value <= 1, f'{table}: fraction out of bounds')
            values[row['id']] = value
        data[table] = values
    digest = hashlib.sha256()
    for path in sorted(paths):
        digest.update(str(path.relative_to(root)).encode())
        digest.update(b'\0')
        digest.update(path.read_bytes())
    data['input_sha256'] = digest.hexdigest()
    validate(data)
    return data


def validate(data):
    rules = data['rules']
    for key in ('gravity', 'detection_range', 'fire_duration', 'repair_duration', 'repair_cooldown', 'capture_time', 'simulation_hz', 'spawn_spacing', 'aircraft_hp'):
        require(rules[key] > 0, f'rules: {key} must be positive')
    require(rules['ai_observation_interval_s'] > 0, 'AI observation interval must be positive')
    for key in ('ai_reaction_delay_s', 'ai_position_error_u', 'ai_fire_delay_s'):
        require(rules[key] >= 0, f'rules: {key} must be nonnegative')
    for key in ('ai_position_error_ratio', 'ai_lead_fraction'):
        require(0 <= rules[key] <= 1, f'rules: {key} must be in [0, 1]')
    require(rules['schema_version'] == 3, 'unsupported schema version')
    require(0 < rules['deck_threshold_deg'] < 45, 'invalid deck threshold')
    require(data['settings']['duel_runs'] > 0 and data['settings']['duel_limit_s'] > 0, 'empty duel experiment')
    for armor in data['armor'].values():
        require(armor['he_resistance_mm'] > 0 and 0 <= armor['torpedo_reduction'] < 1, 'invalid armor resistance')
    for shell in data['shells'].values():
        require(shell['damage_multiplier'] > 0 and 0 < shell['ricochet_deg'] <= 90, 'invalid shell')
        for field in ('nonpenetration_fraction', 'overpenetration_fraction'):
            require(0 <= shell[field] <= 1, f'invalid shell {field}')
    require(set(data['shells']) == {'HE', 'AP'}, 'expected HE/AP shell rules')
    for weapon in data['weapons'].values():
        require(weapon['phase'] in (1, 2, 3) and weapon['reload_s'] > 0 and weapon['damage'] > 0, 'invalid weapon')
        require(weapon['kind'] in ('gun', 'torpedo', 'aircraft', 'aa'), 'unknown weapon kind')
        require(weapon['ammo_per_barrel'] > 0 if weapon['kind'] != 'aircraft' else weapon['ammo_per_barrel'] == 0, 'invalid ammunition budget')
        if weapon['kind'] == 'gun':
            require(weapon['muzzle_u_s'] > 0 and weapon['penetration_mm'] > 0 and 0 < weapon['max_elevation_deg'] <= 45, 'invalid gun ballistics')
            require(weapon['dispersion_long_base_u'] > 0 and weapon['dispersion_cross_base_u'] > 0, 'invalid dispersion')
        else:
            require(weapon['range_u'] > 0 and weapon['travel_u_s'] > 0, 'invalid travel weapon')
    for ship in data['ships'].values():
        require(ship['phase'] in (1, 2, 3) and ship['class'] in ('DD', 'CL', 'CA', 'BB', 'CV'), 'invalid ship phase/class')
        require(ship['armor_id'] in data['armor'], 'unknown armor ID')
        require(ship['hp'] > 0 and ship['length_u'] > ship['beam_u'] > 0 and ship['speed_u_s'] > 0 and ship['acceleration_u_s2'] > 0 and ship['turn_radius_u'] > 0, 'invalid ship geometry/navigation')
        require(ship['initial_speed_u_s'] <= ship['speed_u_s'], 'initial speed above maximum')
        for prefix in ('main', 'secondary'):
            weapon_id = ship[f'{prefix}_weapon_id']
            count = ship[f'{prefix}_mounts'] * ship[f'{prefix}_barrels']
            if weapon_id:
                require(weapon_id in data['weapons'] and count > 0, f'{ship["id"]}: invalid weapon reference/count')
                require(data['weapons'][weapon_id]['phase'] <= ship['phase'], 'future weapon used too early')
            else:
                require(ship[f'{prefix}_mounts'] == ship[f'{prefix}_barrels'] == 0, 'empty mount has barrels')
    validate_controls(data)
    settings = data['settings']
    require(settings['auto_runs'] > 0 and settings['auto_limit_s'] > 0 and 0 < settings['auto_step_s'] <= 0.25, 'invalid automatic experiment')
    require(settings['aa_attack_distance_u'] > 0, 'invalid aircraft attack distance')
    for bank in data['automation'].values():
        require(bank['ship_id'] in data['ships'] and bank['weapon_id'] in data['weapons'], 'invalid automatic reference')
        weapon = data['weapons'][bank['weapon_id']]
        require(bank['role'] in ('surface', 'aa') and weapon['kind'] == ('gun' if bank['role'] == 'surface' else 'aa'), 'automatic role mismatch')
        require(weapon['phase'] <= data['ships'][bank['ship_id']]['phase'], 'future automatic weapon')
        require(bank['mounts'] > 0 and bank['barrels'] > 0, 'empty automatic bank')
        require(0 <= bank['bearing_deg'] < 360 and 0 < bank['arc_deg'] <= 360, 'invalid automatic arc')
        require(0 <= bank['min_range_u'] < bank['max_range_u'] <= max_range(weapon, rules), 'invalid automatic range')
        require(bank['slew_deg_s'] > 0 and bank['lock_s'] > 0 and 0 < bank['aim_tolerance_deg'] <= 5, 'invalid automatic aiming')
        require(0 <= bank['hit_probability'] <= 1 and (bank['role'] != 'aa' or bank['hit_probability'] > 0), 'invalid AA hit chance')
    for ship in data['ships'].values():
        banks = [b for b in data['automation'].values() if b['ship_id'] == ship['id']]
        require(any(b['role'] == 'aa' for b in banks), 'every ship needs explicit AA guns')
        surface = [b for b in banks if b['role'] == 'surface']
        control = control_for(data, ship['id'], 'secondary')
        automatic_secondary = control is not None and control['control'] == 'automatic'
        require(sum(b['mounts'] * b['barrels'] for b in surface) == (ship['secondary_mounts'] * ship['secondary_barrels'] if automatic_secondary else 0), 'automatic barrels disagree with secondary configuration')
        require(all(b['weapon_id'] == ship['secondary_weapon_id'] for b in surface), 'automatic secondary weapon mismatch')
        require(data['weapons'][ship['main_weapon_id']]['kind'] in ('gun', 'aircraft'), 'invalid main weapon kind')
    require(set(data['models']) == set(data['ships']), 'models must cover every named ship')
    for model in data['models'].values():
        require(model['ship_name'] == data['ships'][model['id']]['name'], 'model/ship name mismatch')
        require(model['model_url'].startswith(('https://sketchfab.com/3d-models/', 'https://www.thingiverse.com/thing:')), 'model needs exact public source URL')
        require(model['license'] in ('CC-BY-4.0', 'CC-BY-SA-4.0'), 'unsupported model license')
        require(model['availability'] in ('local_existing', 'candidate_downloadable', 'download_requires_login'), 'invalid model availability')
        require(model['rights_status'] in ('upstream_unverified', 'author_declared_original'), 'invalid model rights status')
        require(bool(model['local_asset']) == (model['availability'] == 'local_existing'), 'invalid local model binding')
        if model['local_asset']:
            require(model['local_asset'].startswith('content/assets/ships/') and '..' not in Path(model['local_asset']).parts, 'invalid local asset path')
        require(all(model[field].strip() for field in ('author', 'original_format', 'era_note', 'layout_note', 'checked_date')), 'missing model provenance')
    require(set(data['profiles']) == set(data['ships']), 'profiles must cover every ship exactly once')
    for profile in data['profiles'].values():
        ship = data['ships'][profile['id']]
        for field in ('role', 'strength', 'weakness', 'tactics'):
            require(bool(profile[field].strip()), f'profile missing {field}')
        require(0 < profile['preferred_min_u'] < profile['preferred_max_u'] <= max_range(data['weapons'][ship['main_weapon_id']], rules), 'invalid preferred engagement range')
    settings = data['settings']
    require(settings['trait_target_id'] in data['ships'] and settings['trait_salvos'] > 0 and settings['trait_range_u'] > 0, 'invalid trait experiment')
    require(all(settings['trait_range_u'] <= max_range(data['weapons'][s['main_weapon_id']], rules) for s in data['ships'].values()), 'trait experiment outside weapon range')
    for room in data['rooms'].values():
        require(room['phase'] in (1, 2, 3) and room['ships_per_team'] > 0, 'invalid room phase/capacity')
        require(room['combat_limit_s'] > room['initial_reload_s'], 'invalid time limit')
        require(room['center_gap_u'] > room['spawn_width_u'], 'overlapping spawn zones')
        require(room['center_gap_u'] + room['spawn_width_u'] <= room['map_width_u'], 'spawn outside map')
        require(room['spawn_height_u'] <= room['map_height_u'], 'spawn outside map')
        margin = rules['spawn_edge_margin']
        columns = math.floor((room['spawn_width_u'] - 2 * margin) / rules['spawn_spacing']) + 1
        rows = math.floor((room['spawn_height_u'] - 2 * margin) / rules['spawn_spacing']) + 1
        require(columns > 0 and rows > 0 and columns * rows >= room['ships_per_team'], 'insufficient spawn slots')
        active = [s for s in data['ships'].values() if s['phase'] <= room['phase']]
        require(rules['spawn_spacing'] > max(s['length_u'] for s in active), 'spawn hulls may overlap')
        longest = max(max_range(data['weapons'][s['main_weapon_id']], rules) for s in active)
        require(room['center_gap_u'] - room['spawn_width_u'] + 2 * margin > longest, 'spawn already inside enemy range')
    for scenario in data['auto_scenarios'].values():
        require(scenario['defender_id'] in data['ships'] and scenario['attacker_id'] in data['ships'], 'invalid automatic scenario reference')
        defender, attacker = data['ships'][scenario['defender_id']], data['ships'][scenario['attacker_id']]
        require(scenario['kind'] in ('orbit', 'air'), 'invalid automatic scenario kind')
        if scenario['kind'] == 'orbit':
            require(defender['class'] == 'BB' and attacker['class'] == 'DD', 'orbit experiment needs BB/DD')
            require(0 < scenario['distance_u'] <= max_range(data['weapons'][attacker['main_weapon_id']], rules), 'invalid orbit distance')
            require(scenario['distance_u'] >= attacker['turn_radius_u'], 'physically impossible orbit radius')
        else:
            require(attacker['class'] == 'CV' and scenario['distance_u'] == 0, 'air scenario needs CV and automatic approach distance')
            require(settings['aa_attack_distance_u'] < max(b['max_range_u'] for b in data['automation'].values() if b['ship_id'] == defender['id'] and b['role'] == 'aa'), 'air approach outside AA envelope')
    for scenario in data['scenarios'].values():
        require(scenario['attacker_id'] in data['ships'] and scenario['target_id'] in data['ships'] and scenario['shell_id'] in data['shells'], 'invalid scenario reference')
        gun = data['weapons'][data['ships'][scenario['attacker_id']]['main_weapon_id']]
        require(gun['kind'] == 'gun' and 0 < scenario['range_u'] <= max_range(gun, rules), 'scenario outside gun range')
        require(scenario['salvos'] > 0 and 0 <= scenario['impact_obliquity_deg'] < 90 and 0 <= scenario['target_heading_deg'] <= 180, 'invalid scenario geometry')


def control_for(data, ship_id, slot):
    return next((c for c in data['controls'].values()
                 if c['ship_id'] == ship_id and c['slot'] == slot), None)


def mode_for(data, weapon_id, mode):
    return next((m for m in data['weapon_modes'].values()
                 if m['weapon_id'] == weapon_id and m['mode'] == mode), None)


def validate_controls(data):
    for table in ('controls', 'weapon_modes', 'manual_aa_scenarios'):
        for row in data[table].values():
            require(all(math.isfinite(row[field]) and row[field] >= 0 for field in SCHEMAS[table][1].split()), f'{table}: invalid numeric configuration')
    seen = set()
    for mode in data['weapon_modes'].values():
        key = (mode['weapon_id'], mode['mode'])
        require(key not in seen and key[0] in data['weapons'], 'duplicate/unknown weapon mode')
        seen.add(key)
        require(mode['mode'] in ('surface', 'air') and mode['target_kind'] == ('ship' if mode['mode'] == 'surface' else 'aircraft'), 'invalid mode target')
        require(mode['shell_policy'] in ('AP_HE', 'HE', 'TORPEDO', 'AIR_ATTACK') and mode['damage_multiplier'] > 0, 'invalid mode ammunition/damage')
        weapon = data['weapons'][key[0]]
        if weapon['kind'] == 'gun' and mode['mode'] == 'air':
            require(mode['shell_policy'] == 'HE' and mode['range_u'] > 0 and 0 < mode['max_elevation_deg'] < 90 and mode['burst_radius_u'] > 0, 'invalid timed-HE mode')
        else:
            require(mode['range_u'] == mode['max_elevation_deg'] == mode['burst_radius_u'] == 0 and mode['damage_multiplier'] == 1, 'base mode must inherit weapon parameters')
            policy = {'torpedo': 'TORPEDO', 'aircraft': 'AIR_ATTACK', 'aa': 'HE'}
            require(mode['mode'] == ('air' if weapon['kind'] == 'aa' else 'surface'), 'unsupported weapon mode')
            require(mode['shell_policy'] == policy.get(weapon['kind'], mode['shell_policy']) and (weapon['kind'] != 'gun' or mode['shell_policy'] in ('AP_HE', 'HE')), 'weapon ammunition mismatch')
    require({m['weapon_id'] for m in data['weapon_modes'].values()} == set(data['weapons']), 'modes must cover every weapon')
    seen = set()
    expected = {(s['id'], slot) for s in data['ships'].values()
                for slot in ('main', 'secondary') if s[f'{slot}_weapon_id']}
    expected |= {(b['ship_id'], 'light_aa' if b['role'] == 'aa' else 'secondary') for b in data['automation'].values()}
    for control in data['controls'].values():
        key = (control['ship_id'], control['slot'])
        require(key not in seen and key in expected, 'duplicate/unknown control slot')
        seen.add(key)
        require(control['control'] in ('manual', 'automatic'), 'invalid control strategy')
        modes = control['available_modes'].split('|')
        require(len(modes) == len(set(modes)) and set(modes) <= {'surface', 'air'}, 'invalid configured modes')
        if control['slot'] == 'light_aa':
            weapons = {b['weapon_id'] for b in data['automation'].values() if b['ship_id'] == key[0] and b['role'] == 'aa'}
        else:
            weapons = {data['ships'][key[0]][f'{key[1]}_weapon_id']}
        require(all(mode_for(data, weapon, mode) is not None for weapon in weapons for mode in modes), 'configured mode lacks weapon capability')
    require(seen == expected, 'controls must cover every occupied slot')
    for bank in data['automation'].values():
        slot = 'light_aa' if bank['role'] == 'aa' else 'secondary'
        control = control_for(data, bank['ship_id'], slot)
        require(control['control'] == 'automatic' and ('air' if bank['role'] == 'aa' else 'surface') in control['available_modes'].split('|'), 'automatic bank/control mismatch')
    for scenario in data['manual_aa_scenarios'].values():
        require(scenario['defender_id'] in data['ships'] and scenario['attacker_id'] in data['ships'], 'invalid manual AA scenario reference')
        control = control_for(data, scenario['defender_id'], 'main')
        ship = data['ships'][scenario['defender_id']]
        mode = mode_for(data, ship['main_weapon_id'], 'air')
        require(control['control'] == 'manual' and 'air' in control['available_modes'].split('|') and mode is not None, 'manual AA needs configured dual-purpose main guns')
        require(data['ships'][scenario['attacker_id']]['class'] == 'CV' and scenario['accuracy'] in ('ideal', 'practiced', 'rough'), 'invalid manual AA attacker/accuracy')
        require(scenario['altitude_u'] > 0 and scenario['formation_spacing_u'] > 2 * mode['burst_radius_u'], 'invalid aircraft geometry')
        require(data['settings']['aa_attack_distance_u'] < mode['range_u'] <= data['rules']['detection_range'], 'invalid manual AA range')


def max_range(weapon, rules):
    if weapon['kind'] != 'gun':
        return weapon['range_u']
    return weapon['muzzle_u_s'] ** 2 * math.sin(2 * math.radians(weapon['max_elevation_deg'])) / rules['gravity']


def trajectory(weapon, distance, rules):
    require(0 <= distance <= max_range(weapon, rules) + 1e-8, 'out of range')
    sine = min(1, distance * rules['gravity'] / weapon['muzzle_u_s'] ** 2)
    angle = 0.5 * math.asin(sine)
    flight = 2 * weapon['muzzle_u_s'] * math.sin(angle) / rules['gravity']
    return math.degrees(angle), flight


def damage(weapon, shell, armor, distance, obliquity_deg, rules):
    angle, _ = trajectory(weapon, distance, rules)
    zone = 'deck' if angle >= rules['deck_threshold_deg'] else 'belt'
    thickness = armor[f'{zone}_mm']
    normal_angle = 90 - angle if zone == 'deck' else obliquity_deg
    energy = weapon['damage'] * shell['damage_multiplier']
    if shell['id'] == 'HE':
        fraction = max(rules['he_min_fraction'], 1 / (1 + thickness / armor['he_resistance_mm']))
        outcome = 'blast'
    elif normal_angle >= shell['ricochet_deg']:
        fraction, outcome = shell['nonpenetration_fraction'], 'ricochet'
    else:
        penetration = weapon['penetration_mm'] * shell['penetration_multiplier'] * (1 - rules['penetration_range_loss'] * distance / max_range(weapon, rules))
        effective = thickness / max(0.01, math.cos(math.radians(normal_angle)))
        if effective > penetration:
            fraction, outcome = shell['nonpenetration_fraction'], 'blocked'
        elif thickness < rules['overpenetration_armor_ratio'] * weapon['penetration_mm'] * shell['penetration_multiplier']:
            fraction, outcome = shell['overpenetration_fraction'], 'overpenetration'
        else:
            fraction, outcome = 1, 'penetration'
    return math.floor(energy * fraction + 0.5), zone, outcome


def sample_hit(rng, weapon, target, distance, heading_deg, offset_along=0, offset_cross=0):
    radius = math.sqrt(rng.random())
    theta = math.tau * rng.random()
    along = radius * math.cos(theta) * (weapon['dispersion_long_base_u'] + distance * weapon['dispersion_long_ratio'])
    cross = radius * math.sin(theta) * (weapon['dispersion_cross_base_u'] + distance * weapon['dispersion_cross_ratio'])
    along -= offset_along
    cross -= offset_cross
    heading = math.radians(heading_deg)
    length_axis = along * math.cos(heading) + cross * math.sin(heading)
    beam_axis = -along * math.sin(heading) + cross * math.cos(heading)
    return abs(length_axis) <= target['length_u'] / 2 and abs(beam_axis) <= target['beam_u'] / 2


def scenario_rng(data, scenario_id):
    seed = f'{data["settings"]["seed"]}:{scenario_id}'.encode()
    return random.Random(int.from_bytes(hashlib.sha256(seed).digest(), 'big'))


def traveled(ship, time):
    time = max(0, time)
    initial, top, acceleration = ship['initial_speed_u_s'], ship['speed_u_s'], ship['acceleration_u_s2']
    ramp = (top - initial) / acceleration
    accelerated = min(time, ramp)
    return initial * accelerated + 0.5 * acceleration * accelerated ** 2 + top * max(0, time - ramp)


def closing_time(a, b, gap, reach):
    if gap <= reach:
        return 0.0
    low, high = 0.0, gap / (a['speed_u_s'] + b['speed_u_s']) + max(a['speed_u_s'] / a['acceleration_u_s2'], b['speed_u_s'] / b['acceleration_u_s2'])
    for _ in range(70):
        mid = (low + high) / 2
        if traveled(a, mid) + traveled(b, mid) >= gap - reach:
            high = mid
        else:
            low = mid
    return high
