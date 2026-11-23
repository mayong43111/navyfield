import copy
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/balance'))
from controls import WeaponController, control_replay
from model import load_data


class ControlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = load_data()

    def test_full_roster_and_no_extra_barrels(self):
        for ship_id, ship in self.data['ships'].items():
            controller = WeaponController(self.data, ship_id)
            self.assertEqual(controller.selected_slot, 'main')
            for slot, battery in controller.batteries.items():
                self.assertEqual(battery.barrels, ship[slot + '_mounts'] * ship[slot + '_barrels'])
        for ship_id, ship in self.data['ships'].items():
            if ship['class'] == 'BB':
                controller = WeaponController(self.data, ship_id)
                with self.assertRaises(ValueError):
                    controller.set_mode('air', 0)

    def test_shared_reload_shell_and_switch(self):
        controller = WeaponController(self.data, 'escort_dd')
        self.assertEqual(controller.fire(7, 'ship'), (0, 1, 2, 3))
        controller.set_mode('air', 8)
        self.assertEqual(controller.status()['shell'], 'HE')
        self.assertEqual(controller.fire(10.4, 'aircraft'), ())
        self.assertEqual(controller.fire(10.5, 'aircraft'), (0, 1, 2, 3))
        controller.set_mode('surface', 11)
        self.assertEqual(controller.status()['shell'], 'AP')
        self.assertEqual(controller.fire(13.5, 'ship'), ())
        self.assertEqual(controller.fire(14, 'ship'), (0, 1, 2, 3))
        self.assertEqual(controller.status()['ammo_by_barrel'], [137] * 4)

    def test_shell_gate_and_idempotent_commands(self):
        controller = WeaponController(self.data, 'escort_dd')
        controller.select_shell('HE', 0)
        controller.fire(7, 'ship')
        controller.select_shell('AP', 8)
        controller.select_shell('AP', 9)
        self.assertEqual(controller.status()['switch_ready_s'], 10.5)
        self.assertEqual(controller.fire(10.4, 'ship'), ())
        self.assertEqual(controller.fire(10.5, 'ship'), (0, 1, 2, 3))
        controller.set_mode('air', 11)
        before = controller.status()
        with self.assertRaises(ValueError):
            controller.select_shell('AP', 12)
        self.assertEqual(controller.status(), before)
        controller.set_mode('air', 12)
        self.assertEqual(controller.status()['switch_ready_s'], 13.5)

    def test_gradual_cadence_and_per_barrel_reload(self):
        controller = WeaponController(self.data, 'escort_dd')
        controller.set_mode('air', 0)
        controller.set_firing('gradual', 0)
        times = [7, 7.875, 8.75, 9.625, 10.5]
        for index, time in enumerate(times):
            self.assertEqual(controller.fire(time, 'aircraft'), (index % 4,))
            self.assertEqual(controller.fire(time, 'aircraft'), ())
        self.assertEqual(controller.status()['ammo_by_barrel'], [138, 139, 139, 139])
        self.assertEqual(controller.status()['ready_by_barrel_s'], [14, 11.375, 12.25, 13.125])
        controller.set_firing('salvo', 10.5)
        controller.select_mount(1, 10.5)
        self.assertEqual(controller.fire(10.5, 'aircraft'), ())
        self.assertEqual(controller.fire(11.375, 'aircraft'), (1,))
        controller.select_mount(None, 11.375)
        self.assertEqual(controller.fire(14, 'aircraft'), ())
        self.assertEqual(controller.fire(14.875, 'aircraft'), (0, 1, 2, 3))

    def test_gradual_sustained_rate_and_no_input_catchup(self):
        for firing in ('salvo', 'gradual'):
            controller = WeaponController(self.data, 'escort_dd')
            controller.set_firing(firing, 0)
            shots = sum(len(controller.fire(7 + i * 0.875, 'ship')) for i in range(40))
            self.assertEqual(shots, 40)
        controller = WeaponController(self.data, 'escort_dd')
        controller.set_firing('gradual', 0)
        self.assertEqual(controller.fire(7, 'ship'), (0,))
        self.assertEqual(controller.fire(100, 'ship'), (1,))
        self.assertEqual(controller.fire(100, 'ship'), ())

    def test_target_kind_and_ammo_exhaustion(self):
        controller = WeaponController(self.data, 'escort_dd')
        controller.set_mode('air', 0)
        before = controller.status()
        self.assertEqual(controller.fire(7, 'ship'), ())
        self.assertEqual(controller.status(), before)
        controller.batteries['main'].ammo_by_barrel = [0, 1, 0, 0]
        controller.set_firing('gradual', 7)
        self.assertEqual(controller.fire(7, 'aircraft'), (1,))
        self.assertEqual(controller.fire(100, 'aircraft'), ())
        self.assertEqual(controller.status()['ammo_by_barrel'], [0, 0, 0, 0])

    def test_selection_no_reset_and_automatic_no_takeover(self):
        controller = WeaponController(self.data, 'yamato')
        controller.fire(7, 'ship')
        battery = controller.batteries['main']
        ready, ammo = list(battery.ready_by_barrel), list(battery.ammo_by_barrel)
        controller.select_slot('secondary', 8)
        for action in (lambda: controller.fire(8, 'ship'), lambda: controller.set_mode('air', 8),
                       lambda: controller.select_mount(0, 8)):
            with self.assertRaises(ValueError):
                action()
        controller.set_automatic(False, 8)
        self.assertTrue(all(not b.enabled for b in controller.automatic['secondary']))
        self.assertTrue(all(b.enabled for b in controller.automatic['light_aa']))
        controller.select_slot('main', 9)
        self.assertEqual(battery.ready_by_barrel, ready)
        self.assertEqual(battery.ammo_by_barrel, ammo)
        self.assertEqual(controller.fire(9, 'ship'), ())

    def test_automatic_pause_retains_resources_and_relocks(self):
        controller = WeaponController(self.data, 'yamato')
        controller.select_slot('secondary', 0)
        bank = controller.automatic['secondary'][0]
        target = {'id': 'dd', 'kind': 'ship', 'class': 'DD', 'enemy': True, 'visible': True,
                  'hp': 10000, 'x': 0, 'y': 350 if bank.bank['bearing_deg'] == 90 else -350}
        self.assertIsNone(bank.update([target], 0, 0.1))
        self.assertIsNotNone(bank.update([target], 1, 0.1))
        ready, ammo, yaw = bank.next_fire, bank.ammo, bank.yaw
        controller.set_automatic(False, 1)
        self.assertIsNone(bank.update([target], 2, 0.1))
        controller.set_automatic(True, 2)
        self.assertEqual((bank.next_fire, bank.ammo, bank.yaw), (ready, ammo, yaw))
        self.assertIsNone(bank.update([target], 2, 0.1))
        self.assertIsNone(bank.update([target], 2.5, 0.1))
        self.assertIsNotNone(bank.update([target], ready, 0.1))

    def test_invalid_selection_time_and_non_gun_boundary(self):
        controller = WeaponController(self.data, 'escort_dd')
        for mount in (-1, 4, 1.5, True):
            with self.assertRaises(ValueError):
                controller.select_mount(mount, 0)
        with self.assertRaises(ValueError):
            controller.select_slot('secondary', 0)
        controller.select_mount(0, 1)
        for time in (0, -1, float('nan'), float('inf')):
            with self.assertRaises(ValueError):
                controller.fire(time, 'ship')
        for ship_id, ship in self.data['ships'].items():
            controller = WeaponController(self.data, ship_id)
            for slot, control in controller.controls.items():
                if control['control'] == 'manual' and slot not in controller.batteries:
                    controller.select_slot(slot, 0)
                    self.assertIn('notice', controller.status())
                    with self.assertRaises(ValueError):
                        controller.fire(0, 'ship')

    def test_manual_secondary_has_independent_physical_state(self):
        data = copy.deepcopy(self.data)
        control = next(c for c in data['controls'].values() if c['ship_id'] == 'yamato' and c['slot'] == 'secondary')
        control['control'] = 'manual'
        controller = WeaponController(data, 'yamato')
        self.assertIn('secondary', controller.batteries)
        self.assertNotIn('secondary', controller.automatic)
        controller.select_slot('secondary', 0)
        self.assertEqual(controller.status()['shell'], 'HE')
        with self.assertRaises(ValueError):
            controller.select_shell('AP', 0)
        self.assertEqual(len(controller.fire(7, 'ship')), 4)
        self.assertEqual(controller.batteries['main'].ammo, 60)

    def test_replay_is_deterministic_and_has_expected_boundaries(self):
        report = control_replay(self.data)
        self.assertEqual(report, control_replay(self.data))
        self.assertEqual(len(report['cases']), 4)
        errors = [e for case in report['cases'] for e in case['events'] if 'error' in e]
        self.assertEqual(len(errors), 2)
        events = report['cases'][0]['events']
        self.assertEqual(events[3]['result'], [])
        self.assertEqual(events[4]['result'], [0, 1, 2, 3])
        self.assertEqual(events[-1]['status']['ammo_by_barrel'], [137] * 4)


if __name__ == '__main__':
    unittest.main()
