import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { parseTargetContent } from '../../src/domain/target-content.ts';
import { createTargetBattleConfig } from '../../src/adapters/local/target-battle-config.ts';
import { TargetBattleSimulation } from '../../src/simulation/target-battle.ts';
import { cycleTargetAmmo, createTargetGroup } from '../../src/simulation/target-weapons.ts';
import { dispatchWeaponShortcut } from '../../src/input/weapon-shortcuts.ts';
import { bindBattleKeyboard } from '../../src/input/battle-input.ts';
const content = parseTargetContent(JSON.parse(readFileSync(new URL('../../content/data/ships/target.json', import.meta.url), 'utf8')));
function fixture(typeId = 'escort_dd') {
  const ship = content.ships[typeId];
  const config = createTargetBattleConfig(content, { typeId, bulgeLevel: 0,
    weapons: Array(ship.main_mounts).fill(ship.main_weapon_id), ammunition: [] }, { team: 'alpha', slot: 0 }, 43111);
  const sim = new TargetBattleSimulation(config);
  sim.state.ships[0].navigation = { x: 0, z: 0, heading: 0, speed: 0, throttle: 0 };
  sim.state.ships[1].navigation = { x: 500, z: 0, heading: 0, speed: 0, throttle: 0 };
  sim.navigate = () => {};
  for (const group of sim.state.target.groups) { group.enabled = false; group.nextRequestAt = 0; for (const tube of group.tubes) tube.readyAt = 0; }
  return { sim, config, group: sim.state.target.groups.find(g => g.side === 'player' && g.slot === 'main') };
}
function press(sim, code) {
  const commands = [];
  dispatchWeaponShortcut(code, sim.state.target, content, command => commands.push(command));
  return sim.step(commands);
}
test('C cycles all/fore/aft without changing weapon slots and preserves independent mount UI', () => {
  const { sim } = fixture();
  assert.equal(sim.state.target.selectedBattery, 'all');
  sim.step([{ type: 'weapon-mount', mount: 3 }]);
  for (const battery of ['fore', 'aft', 'all']) {
    press(sim, 'KeyC');
    assert.equal(sim.state.target.selectedBattery, battery);
    assert.equal(sim.state.target.selectedSlot, 'main');
    assert.equal(sim.state.target.selectedMount, null);
  }
  press(sim, 'KeyC');
  sim.step([{ type: 'weapon-mount', mount: 3 }]);
  assert.equal(sim.state.target.selectedMount, 3); assert.equal(sim.state.target.selectedBattery, 'all');
});
test('all, fore and aft salvo/held gradual only consume and launch selected physical tubes', () => {
  for (const typeId of ['escort_dd', 'yamato']) for (const battery of ['all', 'fore', 'aft']) for (const pattern of ['salvo', 'gradual']) {
    const { sim, group } = fixture(typeId);
    const selected = mount => battery === 'all' || (mount >= Math.ceil(group.mounts / 2) ? 'aft' : 'fore') === battery;
    const before = structuredClone(group.tubes);
    const events = sim.step([{ type: 'weapon-battery', battery }, { type: 'firing-pattern', pattern },
      { type: 'aim', point: { x: 500, y: 0.5, z: 0 } }, pattern === 'salvo' ? { type: 'fire' } : { type: 'fire-hold', enabled: true }]);
    assert.ok(!events.some(e => e.type === 'rejected'), `${typeId}/${battery}/${pattern}`);
    const shots = events.filter(e => e.type === 'launched' && e.projectile.owner === 'player');
    assert.equal(shots.length, pattern === 'salvo' ? group.tubes.filter(t => selected(t.mount)).length : 1);
    assert.ok(shots.every(e => selected(e.weapon)));
    group.tubes.forEach((tube, index) => { if (!selected(tube.mount)) assert.deepEqual(tube, before[index]); });
  }
});
test('Z cycles gun-compatible surface HE/AP and air HE, retaining shared tube stock, reload and cadence', () => {
  for (const typeId of ['escort_dd', 'yamato']) {
    const { sim, group } = fixture(typeId);
    sim.step([{ type: 'aim', point: { x: 500, y: 0.5, z: 0 } }, { type: 'fire' }]);
    const tubes = structuredClone(group.tubes), cadence = group.nextRequestAt;
    assert.ok(tubes.every(tube => tube.remaining === content.weapons[group.weaponId].ammo_per_barrel - 1));
    const expected = typeId === 'escort_dd' ? [['surface', 'AP'], ['air', 'HE'], ['surface', 'HE']] : [['surface', 'AP'], ['surface', 'HE']];
    for (const [mode, shell] of expected) {
      sim.step([{ type: 'aim', point: { x: 500, y: 0.5, z: 0 } }]);
      assert.ok(!press(sim, 'KeyZ').some(e => e.type === 'rejected'));
      assert.equal(group.mode, mode); assert.equal(group.shellType, shell);
      assert.equal(sim.state.target.aimValid, false);
      assert.deepEqual(group.tubes, tubes); assert.equal(group.nextRequestAt, cadence);
      assert.equal(group.switchReadyAt, sim.state.tick / 30 + content.controls[`${typeId}:main`].mode_switch_s);
    }
  }
});
test('Z respects restricted shell policy and only enabled modes, without inventing AA inventory', () => {
  const { config } = fixture();
  const custom = structuredClone(content);
  const definition = config.target.groups.find(g => g.side === 'player' && g.slot === 'main');
  custom.weapon_modes[Object.keys(custom.weapon_modes).find(id => custom.weapon_modes[id].weapon_id === definition.weaponId && custom.weapon_modes[id].mode === 'surface')].shell_policy = 'HE';
  const group = createTargetGroup(custom, definition, 7);
  const before = structuredClone(group.tubes);
  cycleTargetAmmo(custom, definition, group, 0); assert.equal(group.mode, 'air'); assert.equal(group.shellType, 'HE');
  cycleTargetAmmo(custom, definition, group, 1); assert.equal(group.mode, 'surface'); assert.equal(group.shellType, 'HE');
  group.availableModes = ['surface'];
  assert.equal(cycleTargetAmmo(custom, definition, group, 2), false);
  assert.deepEqual(group.tubes, before); assert.deepEqual(Object.keys(custom.shells).sort(), ['AP', 'HE']);
});
test('C/Z/X stop held shots first; unsupported aircraft, torpedoes and automatic groups are harmless', () => {
  for (const code of ['KeyC', 'KeyZ', 'KeyX']) {
    const { sim, group } = fixture();
    sim.step([{ type: 'firing-pattern', pattern: 'gradual' }, { type: 'fire-hold', enabled: true }]);
    const commands = [];
    dispatchWeaponShortcut(code, sim.state.target, content, c => commands.push(c));
    assert.deepEqual(commands[0], { type: 'fire-hold', enabled: false });
    sim.step(commands); assert.equal(sim.state.target.fireHeld, false);
    if (code === 'KeyX') assert.equal(group.pattern, 'salvo');
  }
  for (const [typeId, slot] of [['escort_dd', 'light_aa'], ['torpedo_dd', 'secondary'], ['yorktown', 'main']]) {
    const { sim } = fixture(typeId); sim.step([{ type: 'weapon-slot', slot }]);
    for (const code of ['KeyC', 'KeyZ', 'KeyX', 'KeyE', 'KeyY', 'KeyN']) {
      const commands = []; dispatchWeaponShortcut(code, sim.state.target, content, c => commands.push(c)); assert.deepEqual(commands, []);
    }
    for (const command of [{ type: 'weapon-battery', battery: 'fore' }, { type: 'weapon-ammo-cycle' }, { type: 'firing-pattern', pattern: 'gradual' }]) {
      assert.ok(sim.step([command]).some(e => e.type === 'rejected'));
    }
  }
});
test('keyboard prevents new browser defaults, ignores editables/repeats and clears input on blur', t => {
  const dom = new JSDOM('<input><select></select><textarea></textarea><div contenteditable="true"></div>');
  const saved = new Map(['window', 'document', 'HTMLElement'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of saved.keys()) Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
  t.after(() => { dom.window.close(); for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
  const actions = [], releases = [], keys = new Set(); let clears = 0;
  const unbind = bindBattleKeyboard({ keys, isBattle: () => true, enabled: () => true, send: () => {}, clearPointer: () => {},
    action: code => actions.push(code), release: code => releases.push(code), clearActions: () => clears++ });
  for (const code of ['KeyC', 'KeyZ', 'KeyX', 'Home']) {
    const event = new window.KeyboardEvent('keydown', { code, cancelable: true }); window.dispatchEvent(event); assert.equal(event.defaultPrevented, true);
    window.dispatchEvent(new window.KeyboardEvent('keydown', { code, repeat: true }));
    window.dispatchEvent(new window.KeyboardEvent('keyup', { code }));
  }
  for (const element of document.querySelectorAll('input, select, textarea, div')) {
    if (element.tagName === 'DIV') Object.defineProperty(element, 'isContentEditable', { value: true });
    const event = new window.KeyboardEvent('keydown', { code: 'KeyZ', bubbles: true, cancelable: true });
    element.dispatchEvent(event); assert.equal(event.defaultPrevented, false);
  }
  assert.deepEqual(actions, ['KeyC', 'KeyZ', 'KeyX', 'Home']); assert.deepEqual(releases, actions);
  window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Space' })); window.dispatchEvent(new window.Event('blur'));
  assert.equal(keys.size, 0); assert.equal(clears, 1);
  unbind();
});
test('camera uses Home/button rather than C; player text has no developer audit messages or obsolete hints', () => {
  const runtime = readFileSync(new URL('../../src/app/runtime.ts', import.meta.url), 'utf8');
  assert.match(runtime, /code === 'Home'/); assert.doesNotMatch(runtime, /code === 'KeyC'|code === 'KeyY'/);
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="camera-return"/);
  const sources = ['../../src/ui/game-journey.ts', '../../src/ui/target-weapons.ts', '../../src/ui/lobby-controller.ts'].map(path => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
  assert.doesNotMatch(html + sources + runtime, /验证|测试|审计|C 返回本舰|C回舰|Y切AP\/HE/);
  assert.match(sources, /前炮组/); assert.match(sources, /后炮组/); assert.match(sources, /Home/);
});
