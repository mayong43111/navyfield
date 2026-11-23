import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTargetContent } from '../../src/domain/target-content.ts';
import { createTargetBattleConfig } from '../../src/adapters/local/target-battle-config.ts';
import { TargetBattleSimulation } from '../../src/simulation/target-battle.ts';
import { targetIntercept } from '../../src/simulation/target-physics.ts';
const content = parseTargetContent(JSON.parse(readFileSync(new URL('../../content/data/ships/target.json', import.meta.url), 'utf8')));
function simulation(seed = 43111, typeId = 'escort_dd') {
  const ship = content.ships[typeId];
  const config = createTargetBattleConfig(content, { typeId: ship.id, bulgeLevel: 0,
    weapons: Array(ship.main_mounts).fill(ship.main_weapon_id), ammunition: [] }, { team: 'alpha', slot: 0 }, seed);
  const weapon = config.target.content.weapons[ship.main_weapon_id];
  for (const key of ['dispersion_long_base_u', 'dispersion_long_ratio', 'dispersion_cross_base_u', 'dispersion_cross_ratio']) weapon[key] = 0;
  const sim = new TargetBattleSimulation(config);
  sim.navigate = () => {};
  sim.state.ships[0].navigation = { x: 0, z: 0, heading: 0, speed: 0, throttle: 0 };
  sim.state.ships[1].navigation = { x: 1200, z: 0, heading: 0, speed: 0, throttle: 0 };
  for (const group of sim.state.target.groups) { group.enabled = false; group.nextRequestAt = 1e9; }
  return sim;
}
function ready(sim, side = 'player', slot = 'main') {
  const group = sim.state.target.groups.find(g => g.side === side && g.slot === slot);
  group.nextRequestAt = 0; group.switchReadyAt = 0;
  for (const tube of group.tubes) tube.readyAt = 0;
  return group;
}
function launched(events, side = 'player') { return events.filter(e => e.type === 'launched' && e.projectile.owner === side).map(e => e.projectile); }
function close(a, b) { assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`); }
function landing(shot) {
  const g = content.rules.gravity, v = shot.velocity, p = shot.launchPosition;
  const flight = (v.y + Math.sqrt(v.y ** 2 + 2 * g * (p.y - 0.5))) / g;
  return { x: p.x + v.x * flight, z: p.z + v.z * flight };
}

test('clicked guns preserve world bearing and elevation after translation and hull rotation', () => {
  const sim = simulation(); ready(sim);
  const first = launched(sim.step([{ type: 'aim', point: { x: 1200, y: 0.5, z: 120 } }, { type: 'fire' }]));
  assert.equal(first.length, content.ships.escort_dd.main_mounts);
  const initial = sim.state.ships[0].weapons.map(w => ({ bearing: w.yaw, elevation: w.elevation }));
  Object.assign(sim.state.ships[0].navigation, { x: 350, z: -210, heading: 0.25 });
  ready(sim);
  const second = launched(sim.step([{ type: 'fire' }]));
  assert.equal(second.length, first.length);
  for (let i = 0; i < first.length; i++) {
    for (const axis of ['x', 'y', 'z']) close(second[i].velocity[axis], first[i].velocity[axis]);
    close(sim.state.ships[0].weapons[i].yaw + 0.25, initial[i].bearing);
    close(sim.state.ships[0].weapons[i].elevation, initial[i].elevation);
  }
  assert.ok(sim.state.aim.x > 1500, 'marker must translate with the locked firing ray, not stay at the clicked location');
  ready(sim);
  const changed = launched(sim.step([{ type: 'aim', point: { x: 900, y: 0.5, z: 600 } }, { type: 'fire' }]));
  assert.notEqual(changed[0].velocity.x, second[0].velocity.x);
});

test('torpedoes retain world launch direction after moving and turning', () => {
  const sim = simulation(43111, 'torpedo_dd'); ready(sim, 'player', 'secondary');
  const first = launched(sim.step([{ type: 'weapon-slot', slot: 'secondary' },
    { type: 'aim', point: { x: 1200, y: 0.5, z: 100 } }, { type: 'fire' }]));
  assert.equal(first.length, 8);
  Object.assign(sim.state.ships[0].navigation, { x: 300, z: -500, heading: 0.3 });
  ready(sim, 'player', 'secondary'); const second = launched(sim.step([{ type: 'fire' }]));
  assert.equal(second.length, 8);
  for (let i = 0; i < first.length; i++) for (const axis of ['x', 'y', 'z']) close(first[i].velocity[axis], second[i].velocity[axis]);
});

test('ammo or mode changes invalidate the firing lock until another click', () => {
  const sim = simulation(); ready(sim);
  sim.step([{ type: 'aim', point: { x: 1200, y: 0.5, z: 100 } }, { type: 'weapon-ammo-cycle' }]);
  assert.equal(sim.state.target.aimValid, false);
  ready(sim); const events = sim.step([{ type: 'fire' }]);
  assert.equal(launched(events).length, 0); assert.ok(events.some(e => e.type === 'rejected'));
});

test('turning into hull obstruction rejects a locked salvo without consuming ammo', () => {
  const sim = simulation(); const group = ready(sim);
  sim.step([{ type: 'aim', point: { x: 1200, y: 0.5, z: 0 } }]);
  sim.state.ships[0].navigation.heading = Math.PI / 2;
  const stock = structuredClone(group.tubes);
  const events = sim.step([{ type: 'fire' }]);
  assert.ok(events.some(e => e.type === 'rejected' && /遮挡/.test(e.message)));
  assert.deepEqual(group.tubes, stock);
});

test('enemy waits for delayed observations and aims at stale positions rather than following movement every tick', () => {
  const sim = simulation(); ready(sim, 'enemy');
  let shots = [];
  for (let tick = 0; tick < 20; tick++) shots.push(...launched(sim.step(), 'enemy'));
  assert.equal(shots.length, 0);
  sim.state.ships[0].navigation.x = -600;
  for (let tick = 20; tick < 90 && !shots.length; tick++) shots.push(...launched(sim.step(), 'enemy'));
  assert.ok(shots.length > 0);
  assert.ok(shots[0].owner === 'enemy');
  const point = landing(shots[0]);
  const errorBound = content.rules.ai_position_error_u + 1200 * content.rules.ai_position_error_ratio;
  assert.ok(Math.hypot(point.x, point.z) <= errorBound + 5, 'first volley uses the old observed player position');
  assert.ok(Math.hypot(point.x + 600, point.z) > 400, 'first volley must not instantly track the new position');
});

test('enemy lead is incomplete with bounded seeded aim error; repeat seeds reproduce shots', () => {
  function volley(seed) {
    const sim = simulation(seed); sim.state.ships[0].navigation.speed = 45;
    ready(sim, 'enemy'); let shots = [];
    for (let tick = 0; tick < 90 && !shots.length; tick++) shots = launched(sim.step(), 'enemy');
    assert.ok(shots.length > 0); return shots[0];
  }
  assert.deepEqual(volley(12), volley(12));
  assert.notDeepEqual(volley(12).velocity, volley(13).velocity);
  let distanceFromPerfect = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const shot = volley(seed), point = landing(shot), origin = shot.launchPosition;
    const velocity = { x: 0, y: 0, z: 45 };
    const weapon = content.weapons[content.ships.escort_dd.main_weapon_id];
    const intercept = targetIntercept(origin, { x: 0, y: 0.5, z: 0 }, velocity, weapon.muzzle_u_s,
      content.rules.gravity, weapon.max_elevation_deg);
    const imperfect = { x: 0, z: velocity.z * intercept.flight * content.rules.ai_lead_fraction };
    const range = Math.hypot(imperfect.x - origin.x, imperfect.z - origin.z);
    assert.ok(Math.hypot(point.x - imperfect.x, point.z - imperfect.z) <= content.rules.ai_position_error_u + range * content.rules.ai_position_error_ratio + 1e-6);
    distanceFromPerfect += Math.hypot(point.x, point.z - velocity.z * intercept.flight);
  }
  assert.ok(distanceFromPerfect / 30 > 80, 'novice AI should not have perfect predictive aim');
});
