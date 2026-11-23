import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { parseTargetContent } from '../../src/domain/target-content.ts';
import { createTargetPort } from '../../src/adapters/local/target-port-content.ts';
import { createTargetBattleConfig } from '../../src/adapters/local/target-battle-config.ts';
import { LocalBattleSession } from '../../src/adapters/local/battle-session.ts';
import { ApplicationController } from '../../src/app/controller.ts';
import { createGameJourney } from '../../src/ui/game-journey.ts';
import { createBattleControls } from '../../src/ui/battle-controls.ts';
const content = parseTargetContent(JSON.parse(readFileSync(new URL('../../content/data/ships/target.json', import.meta.url), 'utf8')));
function setup(t) {
  const dom = new JSDOM(readFileSync(new URL('../../index.html', import.meta.url), 'utf8'), { pretendToBeVisual: true });
  const saved = new Map();
  for (const name of ['document', 'HTMLElement', 'HTMLButtonElement']) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
  }
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let launches = 0;
  let cancellations = 0;
  const app = new ApplicationController(createTargetPort(content), (state, deployment) => createTargetBattleConfig(content, {
    typeId: state.active.typeId, bulgeLevel: state.active.bulgeLevel, weapons: state.active.weapons,
    ammunition: state.active.guns.map(g => g.ammunition) }, deployment, 78), config => { launches++; return new LocalBattleSession(config); });
  const journey = createGameJourney({ navigate: screen => app.navigate(screen), launch: () => app.navigate('battle'), retry: () => app.retry(), cancelPending: () => { cancellations++; } }, content);
  const controls = createBattleControls({ navigate: journey.navigate, fire: () => app.fire(), tda: () => app.toggleTDA(),
    power: step => app.send({ type: 'power', step }), resupply: () => app.portCommand({ type: 'reset-ammunition' }) });
  const unsubscribe = app.subscribe(({ state }) => { controls.render(state); journey.render(state); });
  journey.render(app.observe()); controls.render(app.observe());
  t.after(() => {
    unsubscribe(); controls.dispose(); journey.dispose(); app.end(); dom.window.close();
    for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  });
  const click = selector => { const element = document.querySelector(selector); assert.ok(element, selector); element.click(); };
  const tick = seconds => { for (let i = 0; i < seconds; i++) t.mock.timers.tick(1000); };
  return { app, journey, controls, click, tick, window: dom.window, launches: () => launches, cancellations: () => cancellations };
}

test('semantic home → port → confirmed preparation shows selected ship and current location', t => {
  const { app, click } = setup(t);
  assert.equal(document.querySelector('[data-page="home"]').hidden, false);
  click('.home-page [data-route="yard"]');
  assert.equal(app.observe().screen, 'yard');
  assert.equal(document.querySelector('nav [data-route="yard"]').getAttribute('aria-current'), 'page');
  app.portCommand({ type: 'select-berth', index: 7 });
  click('#yard-depart');
  assert.equal(app.observe().screen, 'briefing');
  assert.equal(document.querySelector('#briefing-ship').textContent, app.observe().port.active.name);
  assert.match(document.querySelector('#briefing-mission').textContent, /单机 1 对 1/);
  assert.match(document.querySelector('#journey-location').textContent, /战前准备/);
  assert.equal(document.activeElement.id, 'briefing-title');
});

test('countdown launches once with the prepared config; cancellation and navigation cannot leak timers', t => {
  const { app, click, tick, launches } = setup(t);
  app.navigate('yard'); click('#yard-depart'); const config = app.observe().config;
  click('#sortie-start'); assert.equal(document.querySelector('#sortie-start').disabled, true);
  click('#sortie-start'); tick(1); click('#sortie-cancel'); tick(100);
  assert.equal(launches(), 0); assert.equal(app.observe().screen, 'briefing');
  click('#sortie-start'); tick(1); click('.journey-header [data-route="home"]'); tick(100);
  assert.equal(launches(), 0); assert.equal(app.observe().screen, 'home');
  app.navigate('yard'); click('#yard-depart'); const confirmed = app.observe().config;
  click('#sortie-start'); tick(content.rooms.duel.countdown_s);
  assert.equal(launches(), 1); assert.equal(app.observe().screen, 'battle');
  assert.deepEqual(app.observe().config, confirmed); tick(100); assert.equal(launches(), 1);
  assert.equal(config.rulesVersion, confirmed.rulesVersion);
});

test('opening help or hiding the document cancels pending departure and disposal clears timers', t => {
  const { app, click, tick, journey, launches, cancellations, window } = setup(t);
  app.navigate('yard'); click('#yard-depart'); click('#sortie-start'); click('#journey-help');
  assert.equal(cancellations(), 1);
  assert.equal(journey.dialogOpen(), true); tick(100); assert.equal(launches(), 0);
  click('#journey-help-close'); click('#sortie-start');
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  document.dispatchEvent(new window.Event('visibilitychange')); tick(100); assert.equal(launches(), 0);
  assert.equal(document.querySelector('#sortie-start').disabled, false);
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  click('#sortie-start'); journey.dispose(); tick(100); assert.equal(launches(), 0);
});

test('battle exit and main navigation require confirmation; cancellation retains the live session', t => {
  const { app, click, journey } = setup(t);
  app.navigate('battle', { team: 'alpha', slot: 0 }); const before = app.observe().battle;
  click('#battle-exit'); assert.equal(app.observe().screen, 'battle'); assert.equal(journey.dialogOpen(), true);
  assert.equal(document.activeElement.id, 'abandon-cancel');
  click('#abandon-cancel'); assert.equal(journey.dialogOpen(), false); assert.strictEqual(app.observe().battle, before);
  click('.journey-header [data-route="home"]'); click('#abandon-confirm');
  assert.equal(app.observe().screen, 'home'); assert.equal(app.observe().battle, null);
});

for (const result of ['victory', 'defeat', 'draw']) test(`result page displays only real ${result} session statistics and zero-shot accuracy`, t => {
  const { app, journey } = setup(t); app.navigate('battle', { team: 'alpha', slot: 0 });
  const state = structuredClone(app.observe()); state.screen = 'results'; state.battle.combat.result = result;
  state.battle.combat.player.shots = 0; state.battle.combat.player.hits = 0;
  state.battle.combat.player.damage = 1234; state.battle.tick = 300;
  state.battle.combat.player.hp = result === 'victory' ? 100 : 0;
  state.battle.combat.enemy.hp = result === 'defeat' ? 100 : 0;
  journey.render(state);
  assert.equal(document.querySelector('[data-page="results"]').hidden, false);
  const text = document.querySelector('#results-statistics').textContent;
  assert.match(text, /0 \/ 0 发/); assert.match(text, /命中率0%/); assert.match(text, /1,234/); assert.match(text, /10.0 秒/);
  assert.doesNotMatch(text, /NaN|经验|金币/);
  assert.equal(document.activeElement.id, 'results-title');
  assert.match(document.querySelector('#results-title').textContent, result === 'victory' ? /胜利/ : result === 'defeat' ? /失利/ : /平局/);
});

test('controls remove their button listeners on disposal', t => {
  const { app, controls, click } = setup(t); app.navigate('yard'); controls.dispose(); click('#yard-depart');
  assert.equal(app.observe().screen, 'yard');
});
