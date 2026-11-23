"""Manual timed-HE assumptions, separate from automatic light-AA hit probabilities."""
import math
import statistics

from automatic import AutomaticBank, banks_for
from model import control_for, mode_for, scenario_rng


class DualPurposeBattery:
    def __init__(self, weapon, control, barrels, initial_ready_s=7, surface_shells=('AP', 'HE')):
        self.weapon, self.control, self.barrels = weapon, control, barrels
        self.active_mode = control['available_modes'].split('|')[0]
        self.ready_by_barrel = [float(initial_ready_s)] * barrels
        self.ammo_by_barrel = [weapon['ammo_per_barrel']] * barrels
        self.switch_ready = 0.0
        self.surface_shells = tuple(surface_shells)
        self.surface_shell = self.surface_shells[0]
        self.shell = 'HE' if self.active_mode == 'air' else self.surface_shell
        self.last_command_s = 0.0

    @property
    def next_fire(self):
        return max(self.ready_by_barrel)

    @property
    def ammo(self):
        return min(self.ammo_by_barrel)

    @ammo.setter
    def ammo(self, value):
        self.ammo_by_barrel = [value] * self.barrels

    def check_time(self, time):
        if not math.isfinite(time) or time < self.last_command_s:
            raise ValueError('command time must be finite and nondecreasing')
        self.last_command_s = time

    def switch(self, mode, time):
        if mode not in self.control['available_modes'].split('|'):
            raise ValueError('mode not configured for this battery')
        self.check_time(time)
        if mode != self.active_mode:
            self.active_mode = mode
            self.shell = 'HE' if mode == 'air' else self.surface_shell
            self.switch_ready = time + self.control['mode_switch_s']

    def select_shell(self, shell, time):
        allowed = ('HE',) if self.active_mode == 'air' else self.surface_shells
        if shell not in allowed:
            raise ValueError('shell is not available for this weapon mode')
        self.check_time(time)
        if shell != self.shell:
            self.shell = self.surface_shell = shell
            self.switch_ready = time + self.control['mode_switch_s']

    def fire_barrels(self, mode, time, barrel_ids):
        ids = tuple(barrel_ids)
        if (not ids or len(set(ids)) != len(ids)
                or any(type(i) is not int or not 0 <= i < self.barrels for i in ids)):
            raise ValueError('invalid barrel selection')
        if mode != self.active_mode:
            return ()
        self.check_time(time)
        if (time + 1e-9 < self.switch_ready
                or any(time + 1e-9 < self.ready_by_barrel[i] or self.ammo_by_barrel[i] <= 0 for i in ids)):
            return ()
        for index in ids:
            self.ammo_by_barrel[index] -= 1
            self.ready_by_barrel[index] = time + self.weapon['reload_s']
        return ids

    def fire(self, mode, time):
        return len(self.fire_barrels(mode, time, range(self.barrels)))


def intercept(x, y, z, vx, speed, gravity, max_elevation):
    def residual(t):
        return (x + vx * t) ** 2 + y ** 2 + (z + gravity * t * t / 2) ** 2 - (speed * t) ** 2
    left, previous = 0.0, residual(0)
    for index in range(1, 257):
        right = 2 * speed / gravity * index / 256
        value = residual(right)
        if previous > 0 and value <= 0:
            for _ in range(45):
                middle = (left + right) / 2
                if residual(middle) > 0:
                    left = middle
                else:
                    right = middle
            time = (left + right) / 2
            angle = math.degrees(math.atan2(z + gravity * time * time / 2, math.hypot(x + vx * time, y)))
            return (time, angle) if angle <= max_elevation else None
        left, previous = right, value
    return None


def burst_hits(point, plane, radius):
    return sum((point[i] - plane[key]) ** 2 for i, key in enumerate(('x', 'y', 'z'))) <= radius ** 2 + 1e-9


def manual_air_trial(data, scenario, defense):
    if defense not in ('automatic_only', 'manual_only', 'combined'):
        raise ValueError('unknown defense comparison')
    ship = data['ships'][scenario['defender_id']]
    carrier = data['ships'][scenario['attacker_id']]
    gun = data['weapons'][ship['main_weapon_id']]
    mode = mode_for(data, gun['id'], 'air')
    air_weapon = data['weapons'][carrier['main_weapon_id']]
    configs = banks_for(data, ship['id'], 'aa')
    start = mode['range_u']
    step = data['settings']['auto_step_s']
    speed = air_weapon['travel_u_s']
    duration = (start - data['settings']['aa_attack_distance_u']) / speed
    count = carrier['main_mounts'] * carrier['main_barrels']
    hp = data['rules']['aircraft_hp']
    gravity = data['rules']['gravity']
    survivors, losses = [], []
    manual_shots = aa_shots = manual_hits = 0
    for run_index in range(data['settings']['auto_runs']):
        # Paired streams do not change merely because the other defense is enabled.
        auto_rng = scenario_rng(data, f'formation-auto:{carrier["id"]}:{run_index}')
        manual_rng = scenario_rng(data, f'formation-manual:{carrier["id"]}:{run_index}')
        planes = [{'id': f'plane:{i}', 'kind': 'aircraft', 'class': '', 'enemy': True, 'visible': True,
                   'hp': hp, 'x': start, 'y': (i - (count - 1) / 2) * scenario['formation_spacing_u'],
                   'z': scenario['altitude_u']} for i in range(count)]
        states = [AutomaticBank(b, data['weapons'][b['weapon_id']]) for b in configs] if defense != 'manual_only' else []
        battery = DualPurposeBattery(gun, control_for(data, ship['id'], 'main'), ship['main_mounts'] * ship['main_barrels'])
        battery.switch('air', 0)
        pending = []
        for tick in range(math.ceil(duration / step) + 1):
            time = min(tick * step, duration)
            for plane in planes:
                plane['x'] = start - speed * time
            remaining = []
            for due, kind, victim, amount in sorted(pending, key=lambda event: event[0]):
                if due > time + 1e-9:
                    remaining.append((due, kind, victim, amount))
                elif kind == 'auto':
                    planes[victim]['hp'] = max(0, planes[victim]['hp'] - amount)
                else:
                    for plane in planes:
                        at_burst = dict(plane, x=start - speed * due)
                        if plane['hp'] > 0 and burst_hits(victim, at_burst, mode['burst_radius_u']):
                            plane['hp'] = max(0, plane['hp'] - amount)
                            manual_hits += 1
            pending = remaining
            if time >= duration:
                break
            for state in states:
                target = state.update(planes, time, step)
                if target is not None:
                    barrels = state.bank['mounts'] * state.bank['barrels']
                    hits = sum(auto_rng.random() < state.bank['hit_probability'] for _ in range(barrels))
                    distance = math.sqrt(target['x'] ** 2 + target['y'] ** 2 + target['z'] ** 2)
                    pending.append((time + distance / state.weapon['travel_u_s'], 'auto', int(target['id'].split(':')[1]), hits * state.weapon['damage']))
                    aa_shots += barrels
            alive = [p for p in planes if p['hp'] > 0 and math.hypot(p['x'], p['y']) <= mode['range_u']]
            if defense == 'automatic_only' or not alive or time + 1e-9 < max(battery.next_fire, battery.switch_ready):
                continue
            target = min(alive, key=lambda p: (math.hypot(p['x'], p['y']), p['hp'], p['id']))
            solution = intercept(target['x'], target['y'], target['z'], -speed, gun['muzzle_u_s'], gravity, mode['max_elevation_deg'])
            if solution is None:
                continue
            fired = battery.fire('air', time)
            if not fired:
                continue
            flight, _ = solution
            lead_error = manual_rng.gauss(0, scenario['lead_error_s'])
            px, py = target['x'] - speed * (flight + lead_error), target['y']
            horizontal = math.hypot(px, py)
            yaw = math.atan2(py, px) + math.radians(manual_rng.gauss(0, scenario['aim_error_deg']))
            elevation = math.atan2(target['z'] + gravity * flight * flight / 2, horizontal) + math.radians(manual_rng.gauss(0, scenario['aim_error_deg']))
            # Weapon elevation is a physical bound, including player aim error.
            elevation = min(math.radians(mode['max_elevation_deg']), max(0, elevation))
            for _ in range(fired):
                fuse = max(0.001, flight + manual_rng.uniform(-scenario['fuse_error_s'], scenario['fuse_error_s']))
                radius, angle = math.sqrt(manual_rng.random()), manual_rng.uniform(0, 2 * math.pi)
                along = radius * math.cos(angle) * (gun['dispersion_long_base_u'] + horizontal * gun['dispersion_long_ratio'])
                cross = radius * math.sin(angle) * (gun['dispersion_cross_base_u'] + horizontal * gun['dispersion_cross_ratio'])
                travel = gun['muzzle_u_s'] * math.cos(elevation) * fuse
                point = ((travel + along) * math.cos(yaw) - cross * math.sin(yaw),
                         (travel + along) * math.sin(yaw) + cross * math.cos(yaw),
                         gun['muzzle_u_s'] * math.sin(elevation) * fuse - gravity * fuse * fuse / 2)
                pending.append((time + fuse, 'manual', point, gun['damage'] * data['shells']['HE']['damage_multiplier'] * mode['damage_multiplier']))
            manual_shots += fired
        survivors.append(sum(p['hp'] > 0 for p in planes))
        losses.append(sum(hp - p['hp'] for p in planes))
    mean_survivors = statistics.mean(survivors)
    return {'id': scenario['id'] + ':' + defense, 'defender': ship['id'], 'carrier': carrier['id'],
            'accuracy': scenario['accuracy'], 'defense': defense, 'runs': data['settings']['auto_runs'],
            'planes': count, 'approach_s': duration, 'altitude_u': scenario['altitude_u'],
            'formation_spacing_u': scenario['formation_spacing_u'], 'mean_kills': count - mean_survivors,
            'mean_survivors': mean_survivors, 'mean_aircraft_damage': statistics.mean(losses),
            'manual_shots': manual_shots, 'manual_effective_hits': manual_hits, 'automatic_shots': aa_shots,
            'expected_raid_damage': mean_survivors * data['rules']['aircraft_attack_hit_probability'] * air_weapon['damage'],
            'no_aa_raid_damage': count * data['rules']['aircraft_attack_hit_probability'] * air_weapon['damage']}


def manual_air_trials(data):
    return [manual_air_trial(data, scenario, defense)
            for scenario in data['manual_aa_scenarios'].values()
            for defense in ('automatic_only', 'manual_only', 'combined')]
