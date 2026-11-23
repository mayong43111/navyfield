import copy
import json
import math
from pathlib import Path
import random
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/balance'))
from model import closing_time, damage, load_data, max_range, read_csv, sample_hit, trajectory, traveled, validate
from run import duel_trial, generate, gun_trial, room_trials, ship_traits
from automatic import AutomaticBank, aa_dps, aircraft_trial, eligible, orbit_trial, select_target
from model import control_for, mode_for
from manual_aa import DualPurposeBattery, burst_hits, intercept, manual_air_trial, manual_air_trials


class BalanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = load_data()

    def test_model_audit_provenance_is_not_numerical_design_provenance(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'models.csv'
            path.write_text('id,source\nexample,research/models/audit.json\n', encoding='utf-8')
            self.assertEqual(read_csv(path)[0]['id'], 'example')
            path.rename(Path(folder) / 'ships.csv')
            with self.assertRaisesRegex(ValueError, 'missing design provenance'):
                read_csv(Path(folder) / 'ships.csv')
            path.write_text('id,source\nexample,\n', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'missing model audit provenance'):
                read_csv(path)

    def test_download_blocked_models_cannot_claim_local_assets(self):
        data = copy.deepcopy(self.data)
        model = data['models']['scout_dd']
        model['availability'] = 'download_requires_login'
        model['local_asset'] = ''
        validate(data)
        model['local_asset'] = 'content/assets/ships/shimakaze.glb'
        with self.assertRaisesRegex(ValueError, 'invalid local model binding'):
            validate(data)

    def test_roster_and_phases(self):
        self.assertEqual(len(self.data['ships']), 12)
        self.assertEqual(sum(s['phase'] == 1 for s in self.data['ships'].values()), 8)
        self.assertEqual(sum(s['phase'] == 2 for s in self.data['ships'].values()), 2)
        self.assertEqual(sum(s['phase'] == 3 for s in self.data['ships'].values()), 2)

    def test_range_and_ballistic_endpoint(self):
        gun = self.data['weapons']['gun_460']
        rules = self.data['rules']
        distance = max_range(gun, rules)
        angle, time = trajectory(gun, distance, rules)
        self.assertAlmostEqual(angle, gun['max_elevation_deg'])
        horizontal = gun['muzzle_u_s'] * math.cos(math.radians(angle)) * time
        vertical = gun['muzzle_u_s'] * math.sin(math.radians(angle)) * time - 0.5 * rules['gravity'] * time ** 2
        self.assertAlmostEqual(horizontal, distance)
        self.assertAlmostEqual(vertical, 0)
        with self.assertRaises(ValueError):
            trajectory(gun, distance + 1, rules)

    def test_damage_outcomes(self):
        rules = self.data['rules']
        gun = self.data['weapons']['gun_460']
        heavy = self.data['armor']['heavy']
        light = self.data['armor']['light']
        ap = self.data['shells']['AP']
        self.assertEqual(damage(gun, ap, heavy, 1600, 0, rules)[2], 'penetration')
        self.assertEqual(damage(gun, ap, light, 1000, 0, rules)[2], 'overpenetration')
        self.assertEqual(damage(gun, ap, heavy, 1600, 80, rules)[2], 'ricochet')
        self.assertEqual(damage(gun, ap, heavy, 2800, 0, rules)[1], 'deck')
        small = self.data['weapons']['gun_127']
        self.assertEqual(damage(small, ap, heavy, 1000, 0, rules)[2], 'blocked')
        he = self.data['shells']['HE']
        self.assertGreater(damage(gun, he, light, 1000, 0, rules)[0], damage(gun, ap, light, 1000, 0, rules)[0])

    def test_dispersion_geometry(self):
        gun = self.data['weapons']['gun_460']
        huge = dict(self.data['ships']['yamato'], length_u=100000, beam_u=100000)
        self.assertTrue(all(sample_hit(random.Random(i), gun, huge, 1600, 90) for i in range(100)))
        base = self.data['scenarios']['yamato_ap']
        broadside = gun_trial(self.data, base)
        bow = gun_trial(self.data, dict(base, target_heading_deg=0))
        self.assertLess(broadside['hit_rate'], bow['hit_rate'])
        self.assertLess(broadside['hit_ci95_low'], broadside['hit_rate'])
        self.assertGreater(broadside['hit_ci95_high'], broadside['hit_rate'])

    def test_acceleration_and_closing(self):
        ship = self.data['ships']['yamato']
        ramp = (ship['speed_u_s'] - ship['initial_speed_u_s']) / ship['acceleration_u_s2']
        self.assertEqual(traveled(ship, 0), 0)
        self.assertAlmostEqual(traveled(ship, ramp + 5) - traveled(ship, ramp), 5 * ship['speed_u_s'])
        time = closing_time(ship, ship, 5000, 2000)
        self.assertAlmostEqual(2 * traveled(ship, time), 3000)
        self.assertEqual(closing_time(ship, ship, 1000, 2000), 0)

    def test_rooms_legal_and_center_order(self):
        rows = room_trials(self.data)
        for room in ('duel', 'skirmish', 'fleet'):
            pair = [r for r in rows if r['room'] == room and r['a'] == r['b'] == 'yamato']
            center = next(r for r in pair if r['placement'] == 'center')
            near = next(r for r in pair if r['placement'] == 'nearest_legal')
            self.assertGreater(center['first_fire_after_start_s'], near['first_fire_after_start_s'])
            self.assertGreater(center['first_salvo_arrival_after_start_s'], center['first_fire_after_start_s'])

    def test_bad_data_rejected(self):
        edits = [
            ('ships', 'yamato', 'main_weapon_id', 'missing'),
            ('ships', 'yamato', 'initial_speed_u_s', 1000),
            ('weapons', 'gun_460', 'reload_s', 0),
            ('rooms', 'duel', 'spawn_width_u', 200),
            ('rooms', 'duel', 'center_gap_u', 99999),
            ('rooms', 'duel', 'ships_per_team', 9999),
            ('scenarios', 'yamato_ap', 'range_u', 99999),
            ('armor', 'heavy', 'torpedo_reduction', 1),
        ]
        for table, key, field, value in edits:
            with self.subTest(field=field):
                data = copy.deepcopy(self.data)
                data[table][key][field] = value
                with self.assertRaises(ValueError):
                    validate(data)

    def test_invalid_csv_inputs(self):
        mutations = [
            ('source/ships.csv', ',1,DD,12000,', ',1,DD,nan,'),
            ('source/ships.csv', 'escort_dd,', 'scout_dd,'),
            ('source/rules.csv', 'gravity,16,u/s2', 'gravity,16,meters'),
            ('source/ships.csv', 'id,name,phase', 'id,name,unexpected'),
        ]
        for filename, before, after in mutations:
            with self.subTest(filename=filename, before=before), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                shutil.copytree(ROOT / 'design-data/source', root / 'design-data/source')
                shutil.copytree(ROOT / 'design-data/experiments', root / 'design-data/experiments')
                path = root / 'design-data' / filename
                path.write_text(path.read_text(encoding='utf-8').replace(before, after), encoding='utf-8')
                with self.assertRaises(ValueError):
                    load_data(root)

    def test_timeout_and_duel_accounting(self):
        data = copy.deepcopy(self.data)
        data['settings']['duel_runs'] = 5
        data['settings']['duel_limit_s'] = 1
        row = duel_trial(data, data['scenarios']['yamato_ap'])
        self.assertEqual(row['timeouts'], 5)
        self.assertIsNone(row['resolved_median_s'])
        data['settings']['duel_limit_s'] = 900
        row = duel_trial(data, data['scenarios']['yamato_ap'])
        self.assertEqual(sum(row[key] for key in ('attacker_wins', 'target_wins', 'mutual_sink', 'timeouts')), 5)

    def test_profile_validation(self):
        for field, value in [('weakness', ''), ('preferred_max_u', 99999)]:
            data = copy.deepcopy(self.data)
            data['profiles']['yamato'][field] = value
            with self.assertRaises(ValueError):
                validate(data)
        data = copy.deepcopy(self.data)
        del data['profiles']['light_cv']
        with self.assertRaises(ValueError):
            validate(data)

    def test_differentiation_tradeoffs(self):
        data = copy.deepcopy(self.data)
        data['settings']['trait_salvos'] = 1000
        traits = {row['id']: row for row in ship_traits(data)}
        scout, escort = traits['scout_dd'], traits['escort_dd']
        self.assertGreater(scout['speed_u_s'], escort['speed_u_s'])
        self.assertGreater(scout['main_range_u'], escort['main_range_u'])
        self.assertLess(escort['main_reload_s'], scout['main_reload_s'])
        self.assertGreater(escort['main_cycle_raw_rate'], scout['main_cycle_raw_rate'])
        fast, support = traits['fast_cl'], traits['support_cl']
        self.assertGreater(fast['speed_u_s'], support['speed_u_s'])
        self.assertGreater(fast['main_cycle_raw_rate'], support['main_cycle_raw_rate'])
        self.assertGreater(support['main_range_u'], fast['main_range_u'])
        self.assertGreater(support['reference_he_hit_rate'], fast['reference_he_hit_rate'])
        cal, bis, yam = [traits[key] for key in ('california', 'bismarck', 'yamato')]
        self.assertGreater(cal['main_projectiles'], yam['main_projectiles'])
        self.assertGreater(yam['main_salvo_energy'], cal['main_salvo_energy'])
        self.assertGreater(yam['main_range_u'], bis['main_range_u'])
        self.assertGreater(bis['main_cycle_raw_rate'], yam['main_cycle_raw_rate'])
        self.assertLess(bis['main_reload_s'], cal['main_reload_s'])
        self.assertGreater(bis['speed_u_s'], yam['speed_u_s'])
        heavy, light = traits['yorktown'], traits['light_cv']
        self.assertGreater(heavy['main_salvo_energy'], light['main_salvo_energy'])
        self.assertGreater(heavy['main_range_u'], light['main_range_u'])
        self.assertLess(light['main_reload_s'], heavy['main_reload_s'])
        self.assertGreater(light['speed_u_s'], heavy['speed_u_s'])
        self.assertIsNone(light['reference_he_dps'])

    def test_named_models_cover_roster(self):
        self.assertEqual(set(self.data['models']), set(self.data['ships']))
        self.assertEqual(sum(m['availability'] == 'local_existing' for m in self.data['models'].values()), 4)
        self.assertEqual(self.data['ships']['heavy_ca']['main_mounts'], 4)
        self.assertEqual(self.data['ships']['heavy_ca']['main_barrels'], 2)
        data = copy.deepcopy(self.data)
        data['models']['heavy_ca']['ship_name'] = 'Baltimore'
        with self.assertRaises(ValueError):
            validate(data)

    def test_only_ap_he_and_separate_torpedoes(self):
        self.assertEqual(set(self.data['shells']), {'AP', 'HE'})
        self.assertEqual(self.data['weapons']['torpedo_fast']['kind'], 'torpedo')
        self.assertTrue(all(s['shell_id'] in ('AP', 'HE') for s in self.data['scenarios'].values()))

    def test_reduced_bb_secondary_counts_and_other_ships_unchanged(self):
        expected = {'california': (4, 1, 2), 'bismarck': (4, 2, 4),
                    'yamato': (2, 2, 2), 'heavy_ca': (4, 1, 2),
                    'yorktown': (4, 1, 2), 'light_cv': (2, 1, 1)}
        for ship_id, (mounts, barrels, per_side) in expected.items():
            ship = self.data['ships'][ship_id]
            self.assertEqual((ship['secondary_mounts'], ship['secondary_barrels']), (mounts, barrels))
            banks = [b for b in self.data['automation'].values()
                     if b['ship_id'] == ship_id and b['role'] == 'surface']
            self.assertEqual(len(banks), 2)
            self.assertEqual({b['bearing_deg'] for b in banks}, {90, 270})
            for bank in banks:
                self.assertEqual(bank['mounts'] * bank['barrels'], per_side)
        data = copy.deepcopy(self.data)
        data['automation']['yam_starboard']['barrels'] = 3
        with self.assertRaises(ValueError):
            validate(data)

    def test_secondary_range_and_reduced_accuracy(self):
        target = self.data['ships']['scout_dd']
        fields = ('dispersion_long_base_u', 'dispersion_long_ratio',
                  'dispersion_cross_base_u', 'dispersion_cross_ratio')
        for weapon_id, old_values, limit in (
                ('gun_127_auto', (8, 0.025, 4, 0.009), 600),
                ('gun_152_auto', (10, 0.03, 5, 0.01), 550)):
            gun = self.data['weapons'][weapon_id]
            old = dict(gun, **dict(zip(fields, old_values)))
            for field in fields:
                self.assertAlmostEqual(gun[field], old[field] * 1.5)
            new_rng, old_rng = random.Random(43111), random.Random(43111)
            new_hits = sum(sample_hit(new_rng, gun, target, 350, 90) for _ in range(10000))
            old_hits = sum(sample_hit(old_rng, old, target, 350, 90) for _ in range(10000))
            self.assertLess(new_hits, old_hits)
            for bank in self.data['automation'].values():
                if bank['role'] != 'surface' or bank['weapon_id'] != weapon_id:
                    continue
                self.assertEqual(bank['max_range_u'], limit)
                bearing = math.radians(bank['bearing_deg'])
                base = {'id': 'dd', 'class': 'DD', 'kind': 'ship', 'enemy': True,
                        'visible': True, 'hp': 100,
                        'x': limit * math.cos(bearing), 'y': limit * math.sin(bearing)}
                self.assertTrue(eligible(bank, base))
                self.assertFalse(eligible(bank, dict(base, x=(limit + 1) * math.cos(bearing),
                                                   y=(limit + 1) * math.sin(bearing))))

    def test_automatic_target_filters_and_priority(self):
        bank = self.data['automation']['yam_starboard']
        base = {'id': 'dd', 'class': 'DD', 'kind': 'ship', 'enemy': True, 'visible': True, 'hp': 100, 'x': 0, 'y': 500}
        for changes in ({'enemy': False}, {'visible': False}, {'hp': 0}, {'kind': 'aircraft'}, {'y': 900}, {'y': 100}, {'y': -500}):
            self.assertFalse(eligible(bank, dict(base, **changes)))
        cruiser = dict(base, id='ca', **{'class': 'CA', 'y': 300})
        self.assertEqual(select_target(bank, [cruiser, base])['id'], 'dd')
        self.assertIsNone(select_target(bank, [dict(base, enemy=False)]))

    def test_automatic_lock_traverse_reload_and_ammo(self):
        bank = self.data['automation']['yam_starboard']
        state = AutomaticBank(bank, self.data['weapons'][bank['weapon_id']])
        target = {'id': 'dd', 'class': 'DD', 'kind': 'ship', 'enemy': True, 'visible': True, 'hp': 100, 'x': 0, 'y': 500}
        self.assertIsNone(state.update([target], 0, 0.1))
        self.assertIsNotNone(state.update([target], 1, 0.1))
        self.assertIsNone(state.update([target], 1.1, 0.1))
        self.assertIsNotNone(state.update([target], 5, 0.1))
        state.ammo = 0
        self.assertIsNone(state.update([target], 9, 0.1))
        state = AutomaticBank(bank, self.data['weapons'][bank['weapon_id']])
        self.assertIsNone(state.update([target], 0, 0.1, 160))
        self.assertIsNone(state.update([target], 1, 0.1, 160))
        self.assertLessEqual(state.yaw, 5)
        self.assertIsNone(state.update([dict(target, visible=False)], 2, 0.1))
        self.assertIsNone(state.target_id)

    def test_automatic_holds_target_and_relocks_after_loss(self):
        bank = self.data['automation']['yam_starboard']
        state = AutomaticBank(bank, self.data['weapons'][bank['weapon_id']])
        cruiser = {'id': 'ca', 'class': 'CA', 'kind': 'ship', 'enemy': True, 'visible': True, 'hp': 100, 'x': 0, 'y': 500}
        destroyer = dict(cruiser, id='dd', **{'class': 'DD', 'y': 300})
        state.update([cruiser], 0, 0.1)
        self.assertEqual(state.update([cruiser, destroyer], 1, 0.1)['id'], 'ca')
        self.assertIsNone(state.update([dict(cruiser, hp=0), destroyer], 2, 0.1))
        self.assertEqual(state.target_id, 'dd')
        self.assertEqual(state.locked_since, 2)
        aa = self.data['automation']['yam_aa40']
        self.assertFalse(eligible(aa, cruiser))
        self.assertTrue(eligible(aa, dict(cruiser, kind='aircraft')))

    def test_automatic_input_validation(self):
        for field, value in [('weapon_id', 'aa_40'), ('arc_deg', 361), ('max_range_u', 99999), ('mounts', 0), ('slew_deg_s', 0), ('hit_probability', 2)]:
            data = copy.deepcopy(self.data)
            data['automation']['yam_starboard'][field] = value
            with self.assertRaises(ValueError):
                validate(data)

    def test_orbit_defense_and_outside_range(self):
        data = copy.deepcopy(self.data)
        data['settings']['auto_runs'] = 3
        close = orbit_trial(data, 'bismarck', 350, True)
        off = orbit_trial(data, 'bismarck', 350, False)
        outside = orbit_trial(data, 'bismarck', 1100, True)
        medium = orbit_trial(data, 'bismarck', 700, True)
        self.assertEqual(medium['secondary_shots'], 0)
        self.assertEqual(medium['mean_dd_damage'], 0)
        self.assertGreater(close['mean_dd_damage'], off['mean_dd_damage'])
        self.assertEqual(off['secondary_shots'], 0)
        self.assertEqual(outside['secondary_shots'], 0)
        self.assertGreater(close['dd_sunk'], 0)
        self.assertEqual(close['dd_sunk'] + close['bb_sunk'] - close['mutual_sink'] + close['unresolved'], 3)
        self.assertGreater(close['dd_sink_median_s'], 1)

    def test_aa_shorter_range_lower_probability_and_same_batteries(self):
        expected = {
            'scout_dd': (2, 2, 0.12, 0.15), 'escort_dd': (4, 4, 0.18, 0.2),
            'fast_cl': (4, 4, 0.16, 0.18), 'support_cl': (6, 6, 0.18, 0.2),
            'heavy_ca': (6, 4, 0.16, 0.18), 'california': (8, 8, 0.18, 0.2),
            'bismarck': (8, 8, 0.16, 0.18), 'yamato': (8, 8, 0.18, 0.2),
            'torpedo_dd': (2, 2, 0.1, 0.12), 'torpedo_ca': (4, 4, 0.14, 0.16),
            'yorktown': (10, 8, 0.18, 0.2), 'light_cv': (6, 6, 0.16, 0.18)}
        for ship_id, (mid_count, close_count, mid_probability, close_probability) in expected.items():
            for weapon_id, count, probability, limit in (
                    ('aa_40', mid_count, mid_probability, 1200),
                    ('aa_20', close_count, close_probability, 600)):
                banks = [b for b in self.data['automation'].values()
                         if b['ship_id'] == ship_id and b['weapon_id'] == weapon_id]
                self.assertEqual(len(banks), 1)
                bank = banks[0]
                self.assertEqual(bank['mounts'] * bank['barrels'], count)
                self.assertAlmostEqual(bank['hit_probability'], probability * 0.8)
                self.assertEqual(bank['max_range_u'], limit)
                self.assertEqual(self.data['weapons'][weapon_id]['range_u'], limit)
                target = {'id': 'plane', 'class': '', 'kind': 'aircraft', 'enemy': True,
                          'visible': True, 'hp': 1200, 'x': limit, 'y': 0}
                self.assertTrue(eligible(bank, target))
                self.assertFalse(eligible(bank, dict(target, x=limit + 1)))
        self.assertAlmostEqual(aa_dps(self.data, 'yamato', 600), 192)
        self.assertAlmostEqual(aa_dps(self.data, 'yamato', 601), 115.2)
        self.assertEqual(aa_dps(self.data, 'yamato', 1201), 0)
        for weapon_id, reload_s, damage_hp, ammo in (
                ('aa_40', 0.5, 50, 1200), ('aa_20', 0.2, 12, 3000)):
            gun = self.data['weapons'][weapon_id]
            self.assertEqual((gun['reload_s'], gun['damage'], gun['ammo_per_barrel']),
                             (reload_s, damage_hp, ammo))

    def test_aa_layers_and_discrete_kills(self):
        data = copy.deepcopy(self.data)
        data['settings']['auto_runs'] = 5
        self.assertGreater(aa_dps(data, 'yamato', 600), aa_dps(data, 'yamato', 1200))
        self.assertEqual(aa_dps(data, 'yamato', 1700), 0)
        row = aircraft_trial(data, 'yamato', 'yorktown')
        self.assertAlmostEqual(row['approach_s'], (1200 - 350) / 65)
        self.assertGreater(row['mean_kills'], 0)
        self.assertLess(row['expected_raid_damage'], row['no_aa_raid_damage'])
        self.assertAlmostEqual(row['mean_kills'] + row['mean_survivors'], row['planes'])
        for bank in data['automation'].values():
            if bank['role'] == 'aa':
                bank['hit_probability'] = 0
        row = aircraft_trial(data, 'yamato', 'yorktown')
        self.assertEqual(row['mean_kills'], 0)
        self.assertEqual(row['aa_hits'], 0)

    def test_aa_in_flight_hits_do_not_stop_bombing(self):
        data = copy.deepcopy(self.data)
        data['settings']['auto_runs'] = 1
        for bank in data['automation'].values():
            if bank['role'] == 'aa':
                bank['hit_probability'] = 1
                data['weapons'][bank['weapon_id']]['travel_u_s'] = 1
        row = aircraft_trial(data, 'yamato', 'yorktown')
        self.assertGreater(row['aa_hits'], 0)
        self.assertEqual(row['mean_aircraft_damage'], 0)
        self.assertEqual(row['mean_kills'], 0)
        self.assertEqual(row['expected_raid_damage'], row['no_aa_raid_damage'])

    def test_position_capability_and_control_are_independent(self):
        self.assertEqual(len(self.data['controls']), 32)
        self.assertEqual(len(self.data['weapon_modes']), 17)
        for ship in self.data['ships'].values():
            self.assertEqual(control_for(self.data, ship['id'], 'main')['control'], 'manual')
            self.assertEqual(control_for(self.data, ship['id'], 'light_aa')['control'], 'automatic')
        self.assertEqual(control_for(self.data, 'escort_dd', 'main')['available_modes'], 'surface|air')
        for ship_id in ('california', 'bismarck', 'yamato'):
            self.assertEqual(control_for(self.data, ship_id, 'secondary')['control'], 'automatic')
            self.assertEqual(control_for(self.data, ship_id, 'secondary')['available_modes'], 'surface')
        data = copy.deepcopy(self.data)
        data['controls']['bismarck:secondary']['control'] = 'manual'
        data['automation'] = {k: b for k, b in data['automation'].items()
                              if not (b['ship_id'] == 'bismarck' and b['role'] == 'surface')}
        validate(data)
        self.assertEqual(control_for(data, 'bismarck', 'secondary')['control'], 'manual')
        self.assertEqual(data['ships']['bismarck']['secondary_mounts'], 4)

    def test_controls_and_modes_reject_inconsistent_data(self):
        for table, key, field, value in (
                ('controls', 'escort_dd:main', 'available_modes', 'air|air'),
                ('controls', 'yamato:secondary', 'control', 'manual'),
                ('controls', 'yamato:main', 'available_modes', 'surface|air'),
                ('weapon_modes', 'gun_127_rapid:air', 'shell_policy', 'AP_HE'),
                ('weapon_modes', 'gun_127_rapid:air', 'burst_radius_u', 0),
                ('weapon_modes', 'gun_127_rapid:surface', 'range_u', 1000),
                ('controls', 'escort_dd:main', 'mode_switch_s', -1),
                ('controls', 'escort_dd:main', 'mode_switch_s', float('nan')),
                ('manual_aa_scenarios', 'fletcher-yorktown-ideal', 'formation_spacing_u', 30)):
            with self.subTest(table=table, field=field):
                data = copy.deepcopy(self.data)
                data[table][key][field] = value
                with self.assertRaises(ValueError):
                    validate(data)
        data = copy.deepcopy(self.data)
        del data['controls']['escort_dd:main']
        with self.assertRaises(ValueError):
            validate(data)

    def test_dual_purpose_shared_reload_ammo_and_switch(self):
        gun = self.data['weapons']['gun_127_rapid']
        battery = DualPurposeBattery(gun, control_for(self.data, 'escort_dd', 'main'), 4)
        self.assertEqual(battery.fire('surface', 6), 0)
        self.assertEqual(battery.fire('surface', 7), 4)
        battery.switch('air', 8)
        self.assertEqual(battery.ammo, 139)
        self.assertEqual(battery.next_fire, 10.5)
        self.assertEqual(battery.fire('surface', 10.5), 0)
        self.assertEqual(battery.fire('air', 10.4), 0)
        self.assertEqual(battery.fire('air', 10.5), 4)
        self.assertEqual(battery.fire('air', 10.5), 0)
        battery.switch('surface', 10.5)
        self.assertEqual(battery.fire('surface', 13), 0)
        self.assertEqual(battery.fire('surface', 14), 4)
        self.assertEqual(battery.ammo, 137)
        battery.ammo = 0
        battery.switch('air', 15)
        self.assertEqual(battery.fire('air', 20), 0)
        with self.assertRaises(ValueError):
            battery.switch('torpedo', 20)
        self.assertEqual(mode_for(self.data, gun['id'], 'air')['shell_policy'], 'HE')

    def test_manual_intercept_ballistics_and_elevation(self):
        flight, angle = intercept(1000, 80, 120, -65, 165, 16, 75)
        self.assertAlmostEqual((1000 - 65 * flight) ** 2 + 80 ** 2 + (120 + 8 * flight ** 2) ** 2, (165 * flight) ** 2, places=6)
        self.assertGreater(angle, 0)
        self.assertLessEqual(angle, 75)
        self.assertIsNone(intercept(100000, 0, 120, -65, 165, 16, 75))
        self.assertIsNone(intercept(1000, 0, 10000, -65, 165, 16, 75))
        self.assertIsNone(intercept(1000, 80, 120, -65, 165, 16, 1))

    def test_manual_spherical_burst_and_separated_formation(self):
        plane = {'x': 500, 'y': 0, 'z': 120}
        self.assertTrue(burst_hits((500, 0, 150), plane, 30))
        self.assertFalse(burst_hits((500, 0, 150.001), plane, 30))
        self.assertFalse(burst_hits((500, 0, 120), dict(plane, y=80), 30))

    def test_manual_air_comparisons_and_error_tradeoff(self):
        data = copy.deepcopy(self.data)
        data['settings']['auto_runs'] = 30
        rows = manual_air_trials(data)
        self.assertEqual(len(rows), 18)
        york = [r for r in rows if r['carrier'] == 'yorktown']
        auto = [r for r in york if r['defense'] == 'automatic_only']
        self.assertEqual(len({r['mean_aircraft_damage'] for r in auto}), 1)
        ideal = next(r for r in york if r['accuracy'] == 'ideal' and r['defense'] == 'manual_only')
        rough = next(r for r in york if r['accuracy'] == 'rough' and r['defense'] == 'manual_only')
        combined = next(r for r in york if r['accuracy'] == 'ideal' and r['defense'] == 'combined')
        self.assertGreater(ideal['mean_kills'], 0)
        self.assertGreater(ideal['mean_kills'], rough['mean_kills'])
        self.assertGreater(combined['mean_kills'], ideal['mean_kills'])
        for row in rows:
            self.assertAlmostEqual(row['mean_kills'] + row['mean_survivors'], row['planes'])
            self.assertLessEqual(row['mean_aircraft_damage'], row['planes'] * data['rules']['aircraft_hp'])
            if row['defense'] == 'automatic_only':
                self.assertEqual(row['manual_shots'], 0)
            if row['defense'] == 'manual_only':
                self.assertEqual(row['automatic_shots'], 0)

    def test_manual_bursts_after_release_do_not_stop_bombing(self):
        data = copy.deepcopy(self.data)
        data['settings']['auto_runs'] = 1
        scenario = data['manual_aa_scenarios']['fletcher-yorktown-ideal']
        duration = (1600 - data['settings']['aa_attack_distance_u']) / 65
        data['controls']['escort_dd:main']['mode_switch_s'] = duration - 0.05
        row = manual_air_trial(data, scenario, 'manual_only')
        self.assertGreater(row['manual_shots'], 0)
        self.assertEqual(row['manual_effective_hits'], 0)
        self.assertEqual(row['mean_kills'], 0)
        self.assertEqual(row['expected_raid_damage'], row['no_aa_raid_damage'])

    def test_generation_reproducible(self):
        data = copy.deepcopy(self.data)
        data['settings']['duel_runs'] = 3
        data['settings']['trait_salvos'] = 100
        data['settings']['auto_runs'] = 2
        data['settings']['auto_limit_s'] = 10
        for scenario in data['scenarios'].values():
            scenario['salvos'] = 100
        with tempfile.TemporaryDirectory() as directory:
            a, b = Path(directory) / 'a', Path(directory) / 'b'
            generate(data, a)
            generate(data, b)
            self.assertEqual(sorted(p.name for p in a.iterdir()), sorted(p.name for p in b.iterdir()))
            for path in a.iterdir():
                self.assertEqual(path.read_bytes(), (b / path.name).read_bytes())
            summary = json.loads((a / 'summary.json').read_text())
            self.assertEqual(summary['input_sha256'], data['input_sha256'])


if __name__ == '__main__':
    unittest.main()
