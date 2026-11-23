import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTargetContent } from '../../src/domain/target-content.ts';
import { createTargetPort } from '../../src/adapters/local/target-port-content.ts';
import { createTargetBattleConfig } from '../../src/adapters/local/target-battle-config.ts';
import { LocalBattleSession } from '../../src/adapters/local/battle-session.ts';
import { ApplicationController } from '../../src/app/controller.ts';
const content = parseTargetContent(JSON.parse(readFileSync(new URL('../../content/data/ships/target.json', import.meta.url), 'utf8')));
function application({ limit, outcome } = {}) {
  let seed = 123, builds = 0;
  const sessions = [];
  const app = new ApplicationController(createTargetPort(content), (state, deployment) => {
    builds++;
    const config = createTargetBattleConfig(content, { typeId: state.active.typeId,
      bulgeLevel: state.active.bulgeLevel, weapons: state.active.weapons,
      ammunition: state.active.guns.map(g => g.ammunition) }, deployment, seed++);
    if (limit) config.target.content.rooms.duel.combat_limit_s = limit;
    return config;
  }, config => {
    const session = new LocalBattleSession(config); sessions.push(session);
    if (!outcome) return session;
    let observation = structuredClone(session.observe()), callback;
    const wrapper = { config: session.config, status: 'running', observe: () => observation,
      send: command => session.send(command), subscribe: listener => { callback = listener; return () => {}; },
      pause: stopped => { wrapper.status = stopped ? 'paused' : 'running'; }, end: () => { wrapper.status = 'ended'; session.end(); },
      advance: seconds => {
        if (!seconds || wrapper.status !== 'running') return;
        observation = structuredClone(observation);
        observation.tick = 90; observation.combat.result = outcome;
        observation.combat.player.shots = 8; observation.combat.player.hits = 3; observation.combat.player.damage = 1000;
        if (outcome !== 'victory') observation.combat.player.hp = 0;
        if (outcome !== 'defeat') observation.combat.enemy.hp = 0;
        observation.ships[0].weapons[0].ammunition.lockers.A.remaining = 42;
        callback({ observation, events: [{ type: 'result', result: outcome }] });
      }
    };
    return wrapper;
  });
  return { app, sessions, builds: () => builds };
}

test('home → port → preparation uses every active berth and its exact launch configuration', () => {
  const { app, builds, sessions } = application();
  assert.equal(app.observe().screen, 'home');
  for (let index = 0; index < 12; index++) {
    app.navigate('yard'); app.portCommand({ type: 'select-berth', index });
    app.navigate('briefing');
    const prepared = app.observe(), count = builds();
    assert.equal(prepared.battle, null);
    assert.equal(prepared.config.ships[0].definitionId, prepared.port.active.typeId);
    assert.equal(prepared.config.ships[1].definitionId, prepared.port.active.typeId);
    assert.ok(Object.isFrozen(prepared.config));
    app.advance(10, false); assert.equal(app.observe().battle, null);
    app.navigate('battle');
    assert.deepEqual(app.observe().config, prepared.config);
    assert.equal(builds(), count, 'launch must not silently reroll the confirmed configuration');
    assert.equal(app.observe().battle.tick, 0);
    app.navigate('yard'); assert.equal(sessions.at(-1).status, 'ended');
  }
  app.end();
});

test('real time-limit result stops catch-up immediately and retains a stable session report', () => {
  const { app, sessions } = application({ limit: 1 });
  app.navigate('yard'); app.navigate('briefing'); app.navigate('battle');
  app.advance(20, false);
  const result = app.observe();
  assert.equal(result.screen, 'results');
  assert.equal(result.battle.combat.result, 'draw');
  assert.equal(result.battle.tick, 30);
  assert.equal(sessions[0].status, 'paused');
  app.advance(500, false); assert.strictEqual(app.observe().battle, result.battle);
  app.send({ type: 'fire' }); app.advance(1, false); assert.strictEqual(app.observe().battle, result.battle);
  app.navigate('yard'); assert.equal(app.observe().battle, null); assert.equal(sessions[0].status, 'ended');
  app.end();
});

for (const outcome of ['victory', 'defeat', 'draw']) test(`${outcome} enters results; retry preserves port observations and re-arms target resources`, () => {
  const { app } = application({ outcome });
  app.navigate('yard'); app.navigate('briefing'); app.navigate('battle');
  const seed = app.observe().config.seed, id = app.observe().port.active.id;
  app.advance(1, false);
  assert.equal(app.observe().screen, 'results'); assert.equal(app.observe().battle.combat.result, outcome);
  assert.equal(app.observe().battle.combat.player.shots, 8);
  app.retry();
  assert.equal(app.observe().screen, 'briefing'); assert.equal(app.observe().battle, null);
  assert.equal(app.observe().port.active.id, id); assert.notEqual(app.observe().config.seed, seed);
  assert.equal(app.observe().port.active.guns[0].ammunition.lockers.A.remaining, 42);
  assert.equal(app.observe().config.ships[0].weapons[0].ammunition.lockers.A.remaining,
    content.weapons[content.ships[app.observe().port.active.typeId].main_weapon_id].ammo_per_barrel);
  app.navigate('battle'); assert.equal(app.observe().battle.tick, 0);
  assert.equal(app.observe().battle.combat.player.shots, 0); assert.equal(app.observe().battle.combat.result, null);
  app.navigate('yard'); app.portCommand({ type: 'reset-ammunition' });
  assert.ok(app.observe().port.active.guns[0].ammunition.lockers.A.remaining > 42);
  app.end();
});

test('cancelled preparation drops pending config and does not spend ammunition or start a session', () => {
  const { app, sessions } = application(); app.navigate('yard'); const inventory = app.observe().port.active.guns;
  app.navigate('briefing'); app.navigate('home');
  assert.equal(app.observe().config, null); assert.equal(app.observe().battle, null);
  assert.equal(sessions.length, 0); assert.deepEqual(app.observe().port.active.guns, inventory);
  assert.throws(() => app.navigate('battle'), /阵位/);
  assert.throws(() => app.navigate('results'), /结算/);
  app.end();
});
