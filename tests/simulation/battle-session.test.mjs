import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { LocalBattleSession } from '../../src/adapters/local/battle-session.ts';
import { BattleSimulation } from '../../src/simulation/battle.ts';
import { createAmmunition } from '../../src/simulation/ammunition.ts';
import { steeringCommand } from '../../src/input/battle-input.ts';

function config(seed = 4217) {
  const ship = (side, x, heading) => ({
    id: side, definitionId: 'test-battleship', side, hp: 26300, protection: 5000,
    dimensions: { beam: 38, length: 263, height: 16 },
    spawn: { x, z: 0, heading, speed: 0, throttle: 0 },
    weapons: [{
      id: `${side}-gun-0`, rear: false, mount: { x: 0, y: 12, z: 50 },
      pivot: { x: 0, y: 0, z: 0 },
      muzzles: [-3, 0, 3].map(x => ({ x, y: 0, z: 20 })),
      reloadSeconds: 3, installed: true, ballistics: { speed: 200, maxAngle: Math.PI / 4 },
      power: { he: 1848, apBonus: 3 }, ammunition: createAmmunition()
    }]
  });
  return { seed, rulesVersion: 'single-ship-v1', ships: [ship('player', 0, Math.PI / 2), ship('enemy', 500, -Math.PI / 2)],
    aim: { x: 500, y: 0.5, z: 0 },
    layout: { range: 2500, gap: 25000, width: 28000, height: 5000, regions: [] } };
}
function replay(cadence, seed = 4217, present = () => {}) {
  const session = new LocalBattleSession(config(seed)), events = [];
  session.subscribe(update => { events.push(...update.events); present(update); });
  session.send({ type: 'aim', point: { x: 500, y: 0.5, z: 0 } }, 1);
  session.send({ type: 'tda', enabled: true }, 2);
  session.send({ type: 'fire' }, 40);
  session.send({ type: 'locker', weapon: 0, locker: 'B' }, 100);
  session.send({ type: 'fire' }, 150);
  session.send({ type: 'steer', drive: 1, rudder: 0.5 }, 160);
  session.send({ type: 'steer', drive: 0, rudder: 0 }, 190);
  session.send({ type: 'fire' }, 250);
  let remaining = 12, frame = 0;
  while (remaining > 1e-10) {
    const dt = Math.min(remaining, cadence[frame++ % cadence.length]);
    session.advance(dt); remaining -= dt;
  }
  return { observation: session.observe(), events };
}
test('fixed 30Hz seeded battle reproduces full trajectories, damage and events at differing render cadences', () => {
  const baseline = replay([1 / 30]);
  assert.equal(baseline.observation.tick, 360);
  assert.ok(baseline.events.some(e => e.type === 'launched' && e.projectile.owner === 'player'));
  assert.ok(baseline.events.some(e => e.type === 'impact'));
  assert.ok(baseline.observation.combat.player.shots >= 6);
  assert.deepEqual(replay([1 / 144]), baseline);
  assert.deepEqual(replay([1 / 20, 0.27, 0.002, 0.8]), baseline);
  assert.notDeepEqual(replay([1 / 30], 999).events.filter(e => e.type === 'launched'),
    baseline.events.filter(e => e.type === 'launched'));
});
test('camera motion, disabled effects and independent visual randomness do not affect battle results', () => {
  const bare = replay([1 / 60]);
  let camera = { x: 0, z: 0, zoom: 0.66 }, smoke = 0;
  const effects = replay([1 / 60], 4217, update => {
    camera = { x: camera.x + Math.random() * 100, z: camera.z - 90, zoom: 0.05 + Math.random() };
    smoke += update.events.length;
    for (let i = 0; i < 40; i++) Math.random();
  });
  assert.ok(smoke > 0 && camera.x > 0);
  assert.deepEqual(effects, bare);
});
test('session freezes configuration/observations, copies commands and does not discard stalled time', () => {
  const input = config(), session = new LocalBattleSession(input);
  const command = { type: 'power', step: 0.5 };
  session.send(command); command.step = -0.3;
  input.ships[0].hp = 1; input.ships[0].weapons[0].power.he = 999999;
  session.advance(1);
  assert.equal(session.observe().tick, 30);
  assert.equal(session.observe().combat.player.maxHp, 26300);
  assert.equal(session.observe().ships[0].navigation.throttle, 0.5);
  assert.throws(() => { session.observe().ships[0].navigation.x = 88; }, TypeError);
  assert.throws(() => { session.config.ships[0].weapons[0].muzzles[0].x = 88; }, TypeError);
  session.pause(true); session.advance(100); assert.equal(session.observe().tick, 30);
  session.pause(false); session.advance(1 / 30); assert.equal(session.observe().tick, 31);
  assert.throws(() => session.send({ type: 'fire' }, 31));
  assert.throws(() => session.advance(NaN));
  session.end(); assert.throws(() => session.send({ type: 'fire' }));
  const stopping = new LocalBattleSession(config());
  stopping.subscribe(() => stopping.end());
  stopping.advance(100);
  assert.equal(stopping.observe().tick, 1);
  assert.equal(stopping.status, 'ended');
});
test('commands control route, manual steering, lockers and explicit rejection without direct state access', () => {
  const session = new LocalBattleSession(config()), events = [];
  session.subscribe(update => events.push(...update.events));
  session.send({ type: 'route', point: { x: 2000, z: 0 } });
  session.advance(1 / 30); assert.ok(session.observe().ships[0].route);
  session.send(steeringCommand(new Set(['KeyF', 'KeyA'])));
  session.send({ type: 'shell-type', weapon: 0, locker: 'B', shellType: 'HE' });
  session.send({ type: 'locker', weapon: 0, locker: 'B' });
  session.send({ type: 'locker', weapon: 99, locker: 'A' });
  session.send({ type: 'aim', point: { x: NaN, y: 0, z: 0 } });
  session.advance(1 / 30);
  const observation = session.observe();
  assert.equal(observation.ships[0].route, null);
  assert.equal(observation.ships[0].weapons[0].ammunition.selected, 'B');
  assert.equal(observation.ships[0].weapons[0].ammunition.lockers.B.shellType, 'HE');
  assert.equal(events.filter(e => e.type === 'rejected').length, 2);
  assert.equal(observation.drive, 1); assert.equal(observation.rudder, -1);
});
test('same-step fire preserves command order rather than using a later locker or shell-type change', () => {
  const session = new LocalBattleSession(config()), events = [];
  session.subscribe(update => events.push(...update.events));
  session.advance(1);
  session.send({ type: 'fire' });
  session.send({ type: 'shell-type', weapon: 0, locker: 'A', shellType: 'AP' });
  session.send({ type: 'locker', weapon: 0, locker: 'B' });
  session.advance(1 / 30);
  assert.ok(events.some(e => e.type === 'launched' && e.projectile.owner === 'player'));
  assert.ok(events.filter(e => e.type === 'launched' && e.projectile.owner === 'player')
    .every(e => e.projectile.shellType === 'HE'));
  const ammunition = session.observe().ships[0].weapons[0].ammunition;
  assert.equal(ammunition.selected, 'B');
  assert.equal(ammunition.lockers.A.shellType, 'AP');
  assert.equal(ammunition.lockers.A.remaining, 57);
  assert.equal(ammunition.lockers.B.remaining, 60);
});
test('simultaneous fatal impacts produce one draw, sinking events and stable delayed result', () => {
  const simulation = new BattleSimulation(config());
  simulation.state.combat.player.hp = simulation.state.combat.enemy.hp = 1;
  simulation.state.projectiles = ['player', 'enemy'].map((owner, index) => ({
    id: `projectile-test-${index}`, owner, position: { x: owner === 'player' ? 470 : 30, y: 8, z: 0 },
    velocity: { x: owner === 'player' ? 2000 : -2000, y: 0, z: 0 }, shellType: 'HE',
    power: { he: 1848, apBonus: 3 }, elevation: 0
  }));
  const events = simulation.step();
  assert.equal(simulation.state.combat.result, 'draw');
  assert.equal(events.filter(e => e.type === 'sunk').length, 2);
  assert.equal(events.filter(e => e.type === 'result').length, 1);
  assert.equal(simulation.step().filter(e => e.type === 'sunk' || e.type === 'result').length, 0);
  assert.equal(simulation.state.combat.player.protection, 5000);
});
test('domain and simulation have only numeric/domain imports; invalid numeric configurations fail explicitly', () => {
  for (const folder of ['domain', 'simulation']) {
    for (const name of readdirSync(new URL(`../../src/${folder}/`, import.meta.url)).filter(n => n.endsWith('.ts'))) {
      const source = readFileSync(new URL(`../../src/${folder}/${name}`, import.meta.url), 'utf8');
      const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
      assert.ok(imports.every(path => path.startsWith('./') || path.startsWith('../domain/')), `${folder}/${name}: ${imports}`);
      assert.doesNotMatch(source, /\b(document|window|localStorage|fetch|THREE)\b|Math\.random/);
    }
  }
  const invalid = config(); invalid.ships[0].dimensions.beam = 0;
  assert.throws(() => new LocalBattleSession(invalid));
  assert.throws(() => new LocalBattleSession({ ...config(), seed: NaN }));
});
