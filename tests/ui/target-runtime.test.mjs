import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { parseTargetContent } from '../../src/domain/target-content.ts';
import { createTargetPort } from '../../src/adapters/local/target-port-content.ts';
import { createTargetBattleConfig } from '../../src/adapters/local/target-battle-config.ts';
import { LocalBattleSession } from '../../src/adapters/local/battle-session.ts';
import { ApplicationController } from '../../src/app/controller.ts';
import { createTargetWeaponPanel } from '../../src/ui/target-weapons.ts';
import { bindBattleKeyboard } from '../../src/input/battle-input.ts';
import { createMissingModel } from '../../src/presentation/ships/missing-model.ts';
const content = parseTargetContent(JSON.parse(readFileSync(new URL('../../content/data/ships/target.json', import.meta.url), 'utf8')));
function application() {
  const port = createTargetPort(content);
  return new ApplicationController(port, (state, deployment) => createTargetBattleConfig(content, {
    typeId: state.active.typeId, bulgeLevel: state.active.bulgeLevel, weapons: state.active.weapons,
    ammunition: state.active.guns.map(g => g.ammunition)
  }, deployment, 43111), config => new LocalBattleSession(config));
}
function environment(t) {
  const dom = new JSDOM(readFileSync(new URL('../../index.html', import.meta.url), 'utf8'));
  const saved = new Map();
  for (const name of ['window', 'document', 'HTMLElement', 'HTMLDivElement', 'HTMLSelectElement', 'HTMLParagraphElement', 'HTMLInputElement', 'Option']) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
  }
  t.after(() => { dom.window.close(); for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
  } });
  return dom.window;
}
test('all twelve port berths launch target rules and return without confusing aviation with gun magazines', () => {
  const app = application();
  assert.equal(app.port.observe().ships.length, 12);
  for (let index = 0; index < 12; index++) {
    app.navigate('yard'); app.portCommand({ type: 'select-berth', index });
    const ship = content.ships[app.port.observe().active.typeId];
    app.navigate('battle', { team: 'alpha', slot: 0 });
    assert.equal(app.observe().config.rulesVersion, content.rulesVersion);
    assert.equal(app.observe().battle.combat.player.hp, ship.hp);
    assert.equal(app.observe().battle.ships[0].navigation.speed, ship.initial_speed_u_s);
    app.advance(0.1, false); app.navigate('yard');
    assert.equal(app.port.observe().active.guns.length,
      content.weapons[ship.main_weapon_id].kind === 'aircraft' ? 0 : ship.main_mounts);
  }
  app.end();
});
test('target panel distinguishes manual dual-purpose main guns from automatic banks and shared stocks', t => {
  const window = environment(t), app = application();
  app.navigate('yard'); app.portCommand({ type: 'equip-hull', typeId: 'escort_dd' });
  app.navigate('battle', { team: 'alpha', slot: 0 });
  const panel = createTargetWeaponPanel({ content, state: () => app.observe(), send: command => app.send(command), portCommand: command => app.portCommand(command) });
  panel.render(app.observe());
  assert.match(panel.panel.textContent, /共享备弹/);
  assert.equal(panel.panel.querySelector('[data-control="automatic"]').hidden, true);
  assert.equal(document.querySelector('#shell-b').disabled, true);
  assert.equal(document.querySelector('#shell-b').closest('label').hidden, true);
  assert.equal(document.querySelector('#shell-a').getAttribute('aria-label'), '出击初始弹种');
  assert.equal(document.querySelector('#battle-gun-console').hidden, true);
  const mode = panel.panel.querySelector('[data-control="mode"]');
  mode.value = 'air'; mode.dispatchEvent(new window.Event('change'));
  app.advance(0.1, false); panel.render(app.observe());
  assert.equal(app.observe().battle.target.groups[0].mode, 'air');
  assert.equal(panel.panel.querySelector('[data-control="shell"]').disabled, true);
  assert.equal(panel.panel.querySelector('[data-control="height"]').disabled, false);
  assert.ok(app.observe().battle.target.groups[0].tubes.every(tube => tube.remaining === 140));
  const slot = panel.panel.querySelector('[data-control="slot"]');
  slot.value = 'light_aa'; slot.dispatchEvent(new window.Event('change'));
  app.advance(0.1, false); panel.render(app.observe());
  assert.equal(panel.panel.querySelector('[data-control="automatic"]').hidden, false);
  assert.equal(panel.panel.querySelector('[data-control="pattern"]').disabled, true);
  panel.dispose(); app.end();
});
test('keyboard releases gradual fire on keyup and focus loss, without repeated presses', t => {
  const window = environment(t), actions = [], releases = [], clears = [];
  const unbind = bindBattleKeyboard({ keys: new Set(), isBattle: () => true, enabled: () => true,
    action: code => actions.push(code), release: code => releases.push(code), clearActions: () => clears.push(true),
    send: () => {}, clearPointer: () => {} });
  window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Space' }));
  window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Space', repeat: true }));
  window.dispatchEvent(new window.KeyboardEvent('keyup', { code: 'Space' }));
  window.dispatchEvent(new window.Event('blur'));
  assert.deepEqual(actions, ['Space']); assert.deepEqual(releases, ['Space']); assert.equal(clears.length, 1);
  unbind();
});
test('missing ship visuals are explicitly named collision-volume markers, never another real ship', () => {
  const ship = content.ships.scout_dd;
  const visual = createMissingModel(ship.id, ship.name, ship.length_u, ship.beam_u);
  assert.match(visual.modelName, /模型缺失.*非真实舰外形/);
  assert.equal(visual.modelKey, 'missing:scout_dd'); assert.equal(visual.turrets.length, 0);
  assert.equal(visual.dimensions.length, ship.length_u); assert.equal(visual.dimensions.beam, ship.beam_u);
});
