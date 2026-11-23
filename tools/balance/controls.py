"""Offline command/resource replay; not a game input or ballistic controller."""
import argparse
import json
import math
from pathlib import Path

from automatic import AutomaticBank, banks_for
from manual_aa import DualPurposeBattery
from model import ROOT, load_data, mode_for


class WeaponController:
    def __init__(self, data, ship_id):
        self.data, self.ship = data, data['ships'][ship_id]
        self.controls = {c['slot']: c for c in data['controls'].values() if c['ship_id'] == ship_id}
        self.batteries, self.automatic = {}, {}
        for slot, control in self.controls.items():
            if control['control'] == 'automatic':
                role = 'aa' if slot == 'light_aa' else 'surface'
                self.automatic[slot] = [AutomaticBank(b, data['weapons'][b['weapon_id']])
                                        for b in banks_for(data, ship_id, role)]
            elif slot != 'light_aa':
                weapon = data['weapons'][self.ship[slot + '_weapon_id']]
                if weapon['kind'] == 'gun':
                    barrels = self.ship[slot + '_mounts'] * self.ship[slot + '_barrels']
                    policy = mode_for(data, weapon['id'], 'surface')['shell_policy']
                    shells = ('AP', 'HE') if policy == 'AP_HE' else ('HE',)
                    self.batteries[slot] = DualPurposeBattery(weapon, control, barrels, surface_shells=shells)
        self.selected_slot = 'main'
        self.selected_mount = None
        self.firing_modes = {slot: 'salvo' for slot in self.batteries}
        self.next_trigger = {slot: 0.0 for slot in self.batteries}
        self.cursor = {slot: 0 for slot in self.batteries}
        self.last_command_s = 0.0

    def _at(self, time):
        if not math.isfinite(time) or time < self.last_command_s:
            raise ValueError('command time must be finite and nondecreasing')
        self.last_command_s = time

    def _gun(self):
        if self.selected_slot not in self.batteries:
            raise ValueError('selected slot is not a manual gun; no automatic takeover or aircraft/torpedo firing')
        return self.batteries[self.selected_slot]

    def select_slot(self, slot, time):
        if slot not in self.controls:
            raise ValueError('slot is not equipped')
        self._at(time)
        self.selected_slot, self.selected_mount = slot, None

    def select_mount(self, mount, time):
        self._gun()
        mounts = self.ship[self.selected_slot + '_mounts']
        if mount is not None and (type(mount) is not int or not 0 <= mount < mounts):
            raise ValueError('mount is not equipped')
        self._at(time)
        self.selected_mount = mount

    def set_mode(self, mode, time):
        battery = self._gun()
        if mode not in battery.control['available_modes'].split('|'):
            raise ValueError('mode is not available')
        self._at(time)
        battery.switch(mode, time)

    def select_shell(self, shell, time):
        battery = self._gun()
        allowed = ('HE',) if battery.active_mode == 'air' else battery.surface_shells
        if shell not in allowed:
            raise ValueError('shell is not available for this weapon mode')
        self._at(time)
        battery.select_shell(shell, time)

    def set_firing(self, firing, time):
        self._gun()
        if firing not in ('salvo', 'gradual'):
            raise ValueError('unknown firing pattern')
        self._at(time)
        self.firing_modes[self.selected_slot] = firing

    def set_automatic(self, enabled, time):
        if self.selected_slot not in self.automatic or type(enabled) is not bool:
            raise ValueError('only an automatic slot accepts a boolean enable flag')
        self._at(time)
        for bank in self.automatic[self.selected_slot]:
            bank.set_enabled(enabled)

    def fire(self, time, target_kind):
        battery = self._gun()
        self._at(time)
        expected = 'aircraft' if battery.active_mode == 'air' else 'ship'
        if target_kind != expected or time + 1e-9 < max(battery.switch_ready, self.next_trigger[self.selected_slot]):
            return ()
        per_mount = self.ship[self.selected_slot + '_barrels']
        ids = (tuple(range(battery.barrels)) if self.selected_mount is None else
               tuple(range(self.selected_mount * per_mount, (self.selected_mount + 1) * per_mount)))
        if self.firing_modes[self.selected_slot] == 'gradual':
            ordered = sorted(ids, key=lambda i: (i - self.cursor[self.selected_slot]) % battery.barrels)
            ids = tuple(i for i in ordered if battery.ammo_by_barrel[i] > 0
                        and time + 1e-9 >= battery.ready_by_barrel[i])[:1]
            if not ids:
                return ()
        fired = battery.fire_barrels(battery.active_mode, time, ids)
        if fired:
            self.cursor[self.selected_slot] = (fired[-1] + 1) % battery.barrels
            # This gate survives mount/pattern changes; never catch up missed inputs.
            self.next_trigger[self.selected_slot] = time + battery.weapon['reload_s'] / battery.barrels
        return fired

    def status(self):
        slot = self.selected_slot
        control = self.controls[slot]
        result = {'slot': slot, 'control': control['control'], 'available_modes': control['available_modes'].split('|'),
                  'mount': self.selected_mount}
        if slot in self.batteries:
            battery = self.batteries[slot]
            result.update(mode=battery.active_mode, shell=battery.shell, firing=self.firing_modes[slot],
                          switch_ready_s=battery.switch_ready, next_trigger_s=self.next_trigger[slot],
                          ready_by_barrel_s=list(battery.ready_by_barrel), ammo_by_barrel=list(battery.ammo_by_barrel))
        elif slot in self.automatic:
            result['banks'] = [{'id': bank.bank['id'], 'enabled': bank.enabled, 'ammo_per_barrel': bank.ammo,
                                'next_fire_s': bank.next_fire, 'target': bank.target_id}
                               for bank in self.automatic[slot]]
        else:
            result['notice'] = 'aircraft/torpedo command design only; not simulated by this gun controller'
        return result


def control_replay(data):
    cases = [
        ('shared-reload', 'escort_dd', [
            (6, 'fire', 'ship'), (7, 'fire', 'ship'), (8, 'set_mode', 'air'),
            (10.4, 'fire', 'aircraft'), (10.5, 'fire', 'aircraft'), (11, 'select_shell', 'AP'),
            (11, 'set_mode', 'surface'), (13.5, 'fire', 'ship'), (14, 'fire', 'ship')]),
        ('gradual-no-reset', 'escort_dd', [
            (0, 'set_mode', 'air'), (0, 'set_firing', 'gradual'), (7, 'fire', 'aircraft'),
            (7.1, 'fire', 'aircraft'), (7.875, 'fire', 'aircraft'), (8.75, 'fire', 'aircraft'),
            (9.625, 'fire', 'aircraft'), (10.5, 'fire', 'aircraft'), (10.5, 'set_firing', 'salvo'),
            (10.5, 'select_mount', 1), (10.5, 'fire', 'aircraft'), (11.375, 'fire', 'aircraft')]),
        ('shell-and-target', 'escort_dd', [
            (0, 'select_shell', 'HE'), (7, 'fire', 'ship'), (8, 'set_mode', 'air'),
            (8, 'set_mode', 'air'), (10.5, 'fire', 'ship'), (10.5, 'fire', 'aircraft'),
            (11, 'set_mode', 'surface'), (13.5, 'select_shell', 'AP'), (14, 'fire', 'ship'),
            (16, 'fire', 'ship')]),
        ('automatic-inspection', 'yamato', [
            (0, 'select_slot', 'secondary'), (0, 'fire', 'ship'), (0, 'set_automatic', False),
            (1, 'select_slot', 'light_aa'), (1, 'set_automatic', False),
            (2, 'select_slot', 'main'), (7, 'fire', 'ship'),
            (8, 'select_slot', 'secondary'), (8, 'set_automatic', True)]),
    ]
    rows = []
    for name, ship_id, commands in cases:
        controller = WeaponController(data, ship_id)
        events = []
        for time, action, value in commands:
            event = {'time_s': time, 'action': action, 'value': value}
            try:
                result = getattr(controller, action)(time, value) if action == 'fire' else getattr(controller, action)(value, time)
                event['result'] = list(result) if action == 'fire' else 'accepted'
            except ValueError as error:
                event['error'] = str(error)
            event['status'] = controller.status()
            events.append(event)
        rows.append({'id': name, 'ship': ship_id, 'events': events})
    return {'control_revision': 1, 'numerical_rule_version': data['rules']['rule_version'],
            'input_sha256': data['input_sha256'], 'model': 'command-resource-replay-not-ballistics', 'cases': rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', action='store_true')
    parser.add_argument('--output', type=Path, default=ROOT / 'design-data/reports/weapon-controls.json')
    args = parser.parse_args()
    text = json.dumps(control_replay(load_data()), ensure_ascii=False, indent=2) + '\n'
    if args.verify:
        if not args.output.exists() or args.output.read_bytes() != text.encode('utf-8'):
            raise SystemExit('control replay differs or is missing')
        print('Control replay verified')
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding='utf-8')
        print(f'Control replay written: {args.output}')


if __name__ == '__main__':
    main()
