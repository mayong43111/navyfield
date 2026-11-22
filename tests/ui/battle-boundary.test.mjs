import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { buildGunBanks } from '../../src/ui/gun-console.ts';
import { createBattleHud } from '../../src/ui/battle-hud.ts';
import { bindBattleKeyboard } from '../../src/input/battle-input.ts';
import { createAmmunition } from '../../src/simulation/ammunition.ts';
import { createCombat } from '../../src/simulation/combat.ts';
import { freeze } from '../../src/simulation/config.ts';

function environment(t, html) {
  const dom = new JSDOM(html), saved = new Map();
  for (const name of ['window', 'document', 'HTMLElement', 'HTMLDivElement', 'HTMLTableSectionElement',
    'HTMLButtonElement', 'HTMLCanvasElement']) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
  }
  t.after(() => {
    dom.window.close();
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
    }
  });
  return dom.window;
}
test('battle magazine controls submit commands without mutating a frozen observation copy', t => {
  environment(t, '<div id="yard-mount-pins"></div><table><tbody id="yard-equipment"></tbody></table><div id="station-banks"></div><span id="yard-gun-count"></span>');
  const commands = [], control = freeze({ ammunition: createAmmunition(), reload: 0 });
  let selection = -1, refreshes = 0;
  const [bank] = buildGunBanks({
    mounts: [{ barrelCount: 3, rear: false }], controls: () => [control],
    locker: (weapon, locker) => commands.push({ type: 'locker', weapon, locker }),
    select: index => { selection = index; }, refresh: () => refreshes++, message: () => {}
  });
  bank.toggle.click(); bank.lockers[1].click();
  assert.deepEqual(commands, [{ type: 'locker', weapon: 0, locker: 'B' }, { type: 'locker', weapon: 0, locker: 'B' }]);
  assert.equal(control.ammunition.selected, 'A');
  assert.equal(selection, 0); assert.equal(refreshes, 2);
});
test('browser input sends held steering changes once, clears on blur, and ignores focused text fields', t => {
  const window = environment(t, '<input id="entry">'), keys = new Set(), commands = [], actions = [];
  const unbind = bindBattleKeyboard({ keys, isBattle: () => true, enabled: () => true,
    send: command => commands.push(command), action: code => actions.push(code), clearPointer: () => {} });
  window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyF' }));
  window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyF', repeat: true }));
  window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyD' }));
  window.dispatchEvent(new window.Event('blur'));
  document.querySelector('input').dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyF', bubbles: true }));
  unbind();
  assert.deepEqual(commands, [{ type: 'steer', drive: 1, rudder: 0 },
    { type: 'steer', drive: 1, rudder: 1 }, { type: 'steer', drive: 0, rudder: 0 }]);
  assert.deepEqual(actions, ['KeyF', 'KeyD']); assert.equal(keys.size, 0);
});
test('HUD consumes immutable combat observations and preserves five-second sinking/result delay', t => {
  environment(t, readFileSync(new URL('../../index.html', import.meta.url), 'utf8'));
  const hud = createBattleHud(), combat = createCombat(26300, 26300, 5000);
  combat.enemy.hp = 0; combat.enemy.sinking = 4; combat.result = 'victory';
  combat.player.shots = 9; combat.player.hits = 2; combat.player.damage = 26300;
  const observation = freeze({ combat, resultSeconds: 4 });
  hud.battle(observation);
  assert.equal(hud.resultPanel.hidden, true);
  assert.equal(document.querySelector('#combat-kills').textContent, '1');
  assert.equal(document.querySelector('#combat-accuracy').textContent, '22%');
  hud.battle(freeze({ combat, resultSeconds: 5.1 }));
  assert.equal(hud.resultPanel.hidden, false);
  assert.equal(document.querySelector('#battle-result-title').textContent, '战斗胜利');
  assert.match(document.querySelector('#battle-result-stats').textContent, /命中 2 \/ 9 发/);
  assert.equal(document.activeElement.id, 'battle-result-exit');
  assert.equal(observation.combat.player.protection, 5000);
});
