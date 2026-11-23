import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTargetContent } from '../../src/domain/target-content.ts';
import { createTargetBattleConfig } from '../../src/adapters/local/target-battle-config.ts';
import { TargetBattleSimulation } from '../../src/simulation/target-battle.ts';
import { LocalBattleSession } from '../../src/adapters/local/battle-session.ts';
import { targetDamage, targetRange, targetTrajectory, targetIntercept, targetNavigation } from '../../src/simulation/target-physics.ts';
const content = parseTargetContent(JSON.parse(readFileSync(new URL('../../content/data/ships/target.json', import.meta.url), 'utf8')));
const loadout = typeId => ({ typeId, bulgeLevel: 0, weapons: Array(content.ships[typeId].main_mounts).fill(content.ships[typeId].main_weapon_id), ammunition: [] });
function config(typeId = 'escort_dd', enemyId = typeId, seed = 43111) {
  const own = createTargetBattleConfig(content, loadout(typeId), { team: 'alpha', slot: 0 }, seed);
  if (enemyId !== typeId) {
    const other = createTargetBattleConfig(content, loadout(enemyId), { team: 'alpha', slot: 0 }, seed);
    own.ships[1] = other.ships[1];
    own.target.groups = [...own.target.groups.filter(g => g.side === 'player'), ...other.target.groups.filter(g => g.side === 'enemy')];
  }
  return own;
}
function quiet(sim, distance = 500) {
  sim.state.ships[0].navigation = { x: 0, z: 0, heading: 0, speed: 0, throttle: 0 };
  sim.state.ships[1].navigation = { x: distance, z: 0, heading: 0, speed: 0, throttle: 0 };
  for (const group of sim.state.target.groups) if (group.side === 'enemy') { group.enabled = false; group.nextRequestAt = 1e9; }
  sim.navigate = () => {};
  return sim;
}
const group = (sim, side = 'player', slot = 'main') => sim.state.target.groups.find(g => g.side === side && g.slot === slot);
function steps(sim, count, commands = []) { const events = []; for (let tick = 0; tick < count; tick++) events.push(...sim.step(tick === 0 ? commands : [])); return events; }

 test('all twelve selectable CSV ships configure distinct HP, weapons, ammo, navigation, armor and room-sized maps', () => {
  const signatures = new Set();
  for (const ship of Object.values(content.ships)) {
    const input = config(ship.id), sim = new TargetBattleSimulation(input);
    assert.equal(sim.state.combat.player.hp, ship.hp);
    assert.equal(sim.state.combat.player.protection, ship.bulge_hp);
    assert.equal(input.layout.width, content.rooms.duel.map_width_u);
    assert.equal(input.layout.height, content.rooms.duel.map_height_u);
    assert.equal(input.layout.gap, content.rooms.duel.center_gap_u);
    assert.notEqual(input.layout.gap, 10 * input.layout.range);
    const region = input.layout.regions[0], spawn = input.ships[0].spawn;
    assert.ok(spawn.x >= region.minX && spawn.x <= region.maxX && spawn.z >= region.minZ && spawn.z <= region.maxZ);
    assert.equal(spawn.speed, ship.initial_speed_u_s);
    assert.equal(group(sim).weaponId, ship.main_weapon_id);
    assert.equal(group(sim).tubes.length, ship.main_mounts * ship.main_barrels);
    assert.ok(group(sim).tubes.every(t => t.remaining === content.weapons[ship.main_weapon_id].ammo_per_barrel && t.readyAt === content.rooms.duel.initial_reload_s));
    const shellMounts = content.weapons[ship.main_weapon_id].kind === 'gun' ? ship.main_mounts : 0;
    assert.equal(sim.state.ships[0].weapons.length, shellMounts);
    signatures.add(JSON.stringify([ship.hp, ship.speed_u_s, ship.armor_id, ship.main_weapon_id, ship.main_mounts, ship.main_barrels, ship.secondary_weapon_id]));
    steps(sim, 30); assert.equal(sim.state.tick, 30);
    quiet(sim, 500); steps(sim, 180);
    const events = sim.step([{ type: 'aim', point: { x: 500, y: 0.5, z: 0 } }, { type: 'fire' }]);
    assert.ok(!events.some(e => e.type === 'rejected'), `${ship.id} must deploy and fire its CSV main armament`);
    if (shellMounts) {
      assert.equal(events.filter(e => e.type === 'launched' && e.projectile.owner === 'player' &&
        e.projectile.weaponId === ship.main_weapon_id).length, ship.main_mounts * ship.main_barrels);
      assert.ok(group(sim).tubes.every(t => t.remaining === content.weapons[ship.main_weapon_id].ammo_per_barrel - 1));
    } else {
      assert.equal(events.filter(e => e.type === 'aircraft-launched').length, ship.main_mounts * ship.main_barrels);
      assert.equal(group(sim).aircraftAvailable, ship.aircraft_capacity - ship.main_mounts * ship.main_barrels);
    }
  }
  assert.equal(signatures.size, 12);
});

test('model attributes cannot enter frozen target configuration or change trajectories', () => {
  const plain = config('bismarck'), decorated = structuredClone(plain);
  decorated.models = { scale: 100, gunDamage: 1e9 }; decorated.target.content.models = { visual: 42 };
  decorated.ships[0].model = { url: 'different.glb', scale: 999 };
  decorated.ships[0].weapons[0].modelMount = { x: 9999 };
  decorated.ships[0].spawn.visual = { scale: 2 };
  decorated.ships[0].weapons[0].mount = { x: 999, y: 999, z: 999, model: { node: 'visual-only' } };
  decorated.ships[0].weapons[0].ballistics.model = { importedSpeed: 1e9 };
  decorated.target.content.ships.bismarck.model = { node: () => 'not-cloneable' };
  decorated.target.content.rules.models = { nodes: 88 };
  const a = new TargetBattleSimulation(plain), b = new TargetBattleSimulation(decorated);
  assert.deepEqual(a.config, b.config); assert.ok(Object.isFrozen(a.config.target.content.weapons.gun_380));
  assert.throws(() => a.config.ships[0].hp = 1);
  assert.deepEqual(steps(a, 240), steps(b, 240)); assert.deepEqual(a.state, b.state);
  const bad = config(); bad.ships[0].hp = 1; assert.throws(() => new TargetBattleSimulation(bad));
  const missing = config(); missing.target.groups.pop(); assert.throws(() => new TargetBattleSimulation(missing));
  const unknownBank = config(); unknownBank.target.groups.find(g => g.bankId).bankId = 'visual-bank';
  assert.throws(() => new TargetBattleSimulation(unknownBank));
});

test('fixed-30Hz target sessions preserve seeded full states/events at differing frame cadences and freeze observations', () => {
  function replay(cadence) {
    const session = new LocalBattleSession(config('escort_dd')), events = [];
    session.subscribe(update => events.push(...update.events));
    session.send({ type: 'firing-pattern', pattern: 'gradual' }, 1);
    session.send({ type: 'aim', point: { x: 0, y: 0.5, z: 700 } }, 2);
    session.send({ type: 'fire-hold', enabled: true }, 210);
    let remaining = 14, index = 0;
    while (remaining > 1e-9) { const dt = Math.min(remaining, cadence[index++ % cadence.length]); session.advance(dt); remaining -= dt; }
    assert.equal(session.observe().tick, 420);
    assert.ok(Object.isFrozen(session.observe().target.groups[0].tubes[0]));
    return { state: session.observe(), events };
  }
  assert.deepEqual(replay([1 / 30]), replay([1 / 144, 0.7, 0.002, 0.01]));
});

test('unreachable, obstructed, wrong-kind and invalid preaim requests reject before ammunition or reload changes', () => {
  const sim = quiet(new TargetBattleSimulation(config()), 700); steps(sim, 210);
  const before = structuredClone(group(sim).tubes);
  let events = sim.step([{ type: 'fire' }]); assert.match(events.find(e => e.type === 'rejected').message, /预瞄/);
  events = sim.step([{ type: 'aim', point: { x: 9000, y: 0.5, z: 0 } }, { type: 'fire' }]); assert.ok(events.some(e => e.type === 'rejected'));
  assert.deepEqual(group(sim).tubes, before);
  events = sim.step([{ type: 'aim', point: { x: 0, y: 0.5, z: -700 } }, { type: 'fire' }]); assert.ok(events.some(e => e.type === 'rejected' && /遮挡/.test(e.message)));
  assert.deepEqual(group(sim).tubes, before);
  events = sim.step([{ type: 'weapon-mode', mode: 'air' }, { type: 'aim', point: { x: 700, y: 0.5, z: 0 } }, { type: 'fire' }]);
  assert.ok(events.some(e => e.type === 'rejected' && /飞机|敌机/.test(e.message))); assert.deepEqual(group(sim).tubes, before);
  events = sim.step([{ type: 'shell-type', weapon: 0, locker: 'A', shellType: 'AP' }]); assert.ok(events.some(e => e.type === 'rejected'));
});

test('integrated salvo and gradual use exact tube stock; changing mode, mount, slot, or pattern releases held input', () => {
  const sim = quiet(new TargetBattleSimulation(config()), 700); steps(sim, 210);
  let events = sim.step([{ type: 'aim', point: { x: 700, y: 0.5, z: 0 } }, { type: 'fire' }]);
  assert.equal(events.filter(e => e.type === 'launched' && e.projectile.owner === 'player').length, 4);
  assert.ok(group(sim).tubes.every(t => t.remaining === 139));
  steps(sim, 105);
  sim.step([{ type: 'firing-pattern', pattern: 'gradual' }, { type: 'fire-hold', enabled: true }]);
  assert.equal(group(sim).tubes.reduce((sum, t) => sum + 140 - t.remaining, 0), 5);
  assert.equal(sim.state.target.fireHeld, true);
  sim.step([{ type: 'weapon-mount', mount: 1 }]); assert.equal(sim.state.target.fireHeld, false);
  sim.step([{ type: 'fire-hold', enabled: true }, { type: 'weapon-mode', mode: 'air' }]);
  assert.equal(sim.state.target.fireHeld, false); assert.equal(sim.state.target.aimValid, false);
  assert.ok(sim.state.ships[0].weapons.every(w => w.ammunition.lockers.B.remaining === 0));
});

test('CSV HE/AP deck/belt/penetration/overpenetration/ricochet and movement parameters are used independently', () => {
  const gun = content.weapons.gun_460, range = targetRange(gun, content.rules), armor = content.armor.heavy;
  assert.equal(targetDamage(gun, content.shells.HE, armor, 700, 0, content.rules).damage,
    Math.round(gun.damage * content.shells.HE.damage_multiplier / (1 + armor.belt_mm / armor.he_resistance_mm)));
  assert.equal(targetDamage(gun, content.shells.AP, armor, 700, 0, content.rules).outcome, 'penetration');
  assert.equal(targetDamage(gun, content.shells.AP, content.armor.light, 700, 0, content.rules).outcome, 'overpenetration');
  assert.equal(targetDamage(gun, content.shells.AP, armor, 700, 80, content.rules).outcome, 'ricochet');
  assert.equal(targetDamage(gun, content.shells.HE, armor, range * 0.99, 0, content.rules).zone, 'deck');
  assert.equal(targetTrajectory({ x: 0, y: 0, z: 0 }, { x: range + 1, y: 0, z: 0 }, gun.muzzle_u_s, content.rules.gravity, gun.max_elevation_deg), null);
  const nav = { x: 0, z: 0, heading: 0, speed: content.ships.scout_dd.initial_speed_u_s, throttle: 1 };
  targetNavigation(nav, content.ships.scout_dd, 1, 1, 1, 10000, 6000);
  assert.equal(nav.speed, content.ships.scout_dd.initial_speed_u_s + content.ships.scout_dd.acceleration_u_s2);
  assert.equal(nav.heading, nav.speed / content.ships.scout_dd.turn_radius_u);
});

test('automatic secondary guns require visibility, range, bearing, traverse and fresh lock; toggles cannot refill or remove existing shots', () => {
  const sim = quiet(new TargetBattleSimulation(config('bismarck', 'scout_dd')), 700);
  steps(sim, 240);
  const banks = sim.state.target.groups.filter(g => g.side === 'player' && g.slot === 'secondary');
  assert.ok(banks.every(g => g.tubes.every(t => t.remaining === content.weapons[g.weaponId].ammo_per_barrel)));
  sim.state.ships[1].navigation.x = 350;
  const events = steps(sim, 60);
  assert.ok(events.some(e => e.type === 'launched' && e.projectile.owner === 'player'));
  const port = banks.find(g => g.id.includes('port')), starboard = banks.find(g => g.id.includes('starboard'));
  assert.ok(port.tubes.every(t => t.remaining === content.weapons[port.weaponId].ammo_per_barrel));
  assert.ok(starboard.tubes.some(t => t.remaining < content.weapons[starboard.weaponId].ammo_per_barrel));
  const ammo = structuredClone(starboard.tubes), next = starboard.nextRequestAt;
  const pending = sim.state.projectiles.length;
  sim.step([{ type: 'automatic', slot: 'secondary', enabled: false }]);
  assert.equal(starboard.targetId, null); assert.ok(pending > 0);
  sim.step([{ type: 'automatic', slot: 'secondary', enabled: true }]);
  assert.deepEqual(starboard.tubes, ammo); assert.equal(starboard.nextRequestAt, next);
  assert.ok(starboard.lockReadyAt >= sim.state.tick / 30 + content.automation.bis_starboard.lock_s - 1e-9);
  assert.ok(sim.state.projectiles.length > 0);
});

test('torpedoes have per-tube inventory/reload, moving collision and armor plus finite bulge protection', () => {
  const sim = quiet(new TargetBattleSimulation(config('torpedo_dd', 'bismarck')), 500); steps(sim, 210);
  const commands = [{ type: 'weapon-slot', slot: 'secondary' }, { type: 'aim', point: { x: 500, y: 0.5, z: 0 } }, { type: 'fire' }];
  let events = sim.step(commands); assert.equal(events.filter(e => e.type === 'launched' && e.projectile.kind === 'torpedo').length, 8);
  const torpedoes = group(sim, 'player', 'secondary');
  assert.ok(torpedoes.tubes.every(t => t.remaining === content.weapons.torpedo_fast.ammo_per_barrel - 1));
  assert.ok(torpedoes.tubes.every(t => t.readyAt > 90));
  const before = structuredClone(torpedoes.tubes); events = sim.step([{ type: 'fire' }]); assert.ok(events.some(e => e.type === 'rejected'));
  assert.deepEqual(torpedoes.tubes, before);
  const armor = content.armor[content.ships.bismarck.armor_id], bulge = sim.state.combat.enemy.protection;
  const damagePerHit = Math.round(content.weapons.torpedo_fast.damage * (1 - armor.torpedo_reduction));
  events = steps(sim, 500);
  const impacts = events.filter(e => e.type === 'impact' && e.owner === 'player'); assert.ok(impacts.length > 0);
  assert.equal(impacts[0].damage, damagePerHit - Math.min(bulge, damagePerHit));
  assert.ok(sim.state.combat.enemy.protection < bulge);
});

test('carriers command actual finite-stock moving sorties, never main cannon shells, and recover surviving aircraft', () => {
  const sim = quiet(new TargetBattleSimulation(config('yorktown', 'bismarck')), 1800); steps(sim, 210);
  const initial = group(sim).aircraftAvailable;
  let events = sim.step([{ type: 'aim', point: { x: 1800, y: 0.5, z: 0 } }, { type: 'fire' }]);
  assert.equal(events.filter(e => e.type === 'aircraft-launched').length, 6);
  assert.equal(sim.state.ships[0].weapons.length, 0);
  assert.equal(group(sim).aircraftAvailable, initial - 6);
  const positions = sim.state.aircraft.map(a => ({ ...a.position })); steps(sim, 30);
  assert.ok(sim.state.aircraft.some((a, i) => a.position.x !== positions[i].x));
  events = steps(sim, 1800);
  assert.ok(events.some(e => e.type === 'aircraft-dropped'));
  assert.ok(events.some(e => e.type === 'launched' && e.projectile.kind === 'bomb'));
  assert.ok(!events.some(e => e.type === 'launched' && e.projectile.owner === 'player' && e.projectile.weaponId === 'aircraft_bomber' && e.projectile.kind === 'shell'));
  assert.equal(group(sim).aircraftAvailable, initial);
  assert.ok(sim.state.combat.enemy.hp < content.ships.bismarck.hp);
});

test('aircraft losses prevent unreleased bombs; automatic AA and timed manual HE use separate physical groups', () => {
  const sim = quiet(new TargetBattleSimulation(config('escort_dd', 'light_cv')), 1000); steps(sim, 210);
  const enemy = group(sim, 'enemy'); enemy.nextRequestAt = 0;
  sim.manualFire(enemy, { x: 0, y: 0.5, z: 0 }, null, true);
  enemy.nextRequestAt = 1e9;
  assert.equal(sim.state.aircraft.length, 3);
  const manualStock = group(sim).tubes.map(t => t.remaining);
  let events = steps(sim, 60);
  const aa = sim.state.target.groups.filter(g => g.side === 'player' && g.slot === 'light_aa');
  assert.ok(aa.some(g => g.tubes.some(t => t.remaining < content.weapons[g.weaponId].ammo_per_barrel)));
  assert.deepEqual(group(sim).tubes.map(t => t.remaining), manualStock);
  sim.step([{ type: 'automatic', slot: 'light_aa', enabled: false }, { type: 'weapon-mode', mode: 'air' }]);
  steps(sim, 75);
  const surviving = sim.state.aircraft.find(a => a.owner === 'enemy' && !a.dropped);
  assert.ok(surviving); assert.equal(surviving.maxHp, content.rules.aircraft_hp);
  const intercept = targetIntercept(sim.origin(group(sim), 0), surviving.position, surviving.velocity,
    content.weapons.gun_127_rapid.muzzle_u_s, content.rules.gravity,
    content.weapon_modes['gun_127_rapid:air'].max_elevation_deg);
  assert.ok(intercept);
  const point = { x: surviving.position.x + surviving.velocity.x * intercept.flight, y: surviving.position.y,
    z: surviving.position.z + surviving.velocity.z * intercept.flight };
  events = sim.step([{ type: 'aim', point }, { type: 'fire' }]);
  const rounds = events.filter(e => e.type === 'launched' && e.projectile.owner === 'player');
  assert.equal(rounds.length, 4);
  assert.ok(rounds.every(e => e.projectile.fuseRemaining > 0 && e.projectile.shellType === 'HE' &&
    e.projectile.burstRadius === content.weapon_modes['gun_127_rapid:air'].burst_radius_u));
  assert.ok(group(sim).tubes.every(t => t.remaining === 139));
  events = steps(sim, 120);
  assert.ok(events.some(e => e.type === 'aircraft-hit' && e.damage === content.weapons.gun_127_rapid.damage *
    content.shells.HE.damage_multiplier * content.weapon_modes['gun_127_rapid:air'].damage_multiplier));
  const victim = sim.state.aircraft.find(a => !a.dropped); assert.ok(victim);
  const id = victim.id; sim.hitAircraft(victim, victim.hp);
  events = steps(sim, 600);
  assert.ok(!events.some(e => e.type === 'aircraft-dropped' && e.aircraftId === id));
  assert.ok(enemy.aircraftLost > 0);
});

test('a released bomb still lands after its aircraft is shot down', () => {
  const sim = quiet(new TargetBattleSimulation(config('light_cv', 'bismarck')), 900); steps(sim, 210);
  sim.step([{ type: 'aim', point: { x: 900, y: 0.5, z: 0 } }, { type: 'fire' }]);
  let events = [];
  for (let tick = 0; tick < 600 && !sim.state.aircraft.some(a => a.dropped); tick++) events.push(...sim.step());
  const dropped = sim.state.aircraft.find(a => a.dropped); assert.ok(dropped);
  const bomb = sim.state.projectiles.find(p => p.kind === 'bomb'); assert.ok(bomb);
  sim.hitAircraft(dropped, dropped.hp); assert.ok(sim.state.projectiles.some(p => p.id === bomb.id));
  events = steps(sim, 180); assert.ok(events.some(e => e.type === 'impact' || e.type === 'splash'));
});

test('actual same-step fatal shell impacts settle both ships and publish one draw result', () => {
  const sim = quiet(new TargetBattleSimulation(config())); steps(sim, 210);
  sim.state.combat.player.hp = sim.state.combat.enemy.hp = 1;
  for (const [owner, x] of [['player', 493], ['enemy', -7]]) sim.launch({
    id: `fatal-${owner}`, owner, position: { x, y: 1, z: 0 }, velocity: { x: 300, y: 0, z: 0 },
    shellType: 'HE', power: { he: content.weapons.gun_127_rapid.damage, apBonus: 0 }, elevation: 0,
    kind: 'shell', weaponId: 'gun_127_rapid', traveled: 0, rangeRemaining: 1000,
  }, 0);
  const events = sim.step();
  assert.equal(events.filter(e => e.type === 'impact' && e.damage === 1).length, 2);
  assert.equal(events.filter(e => e.type === 'sunk').length, 2);
  assert.equal(events.filter(e => e.type === 'result').length, 1); assert.equal(sim.state.combat.result, 'draw');
  assert.equal(sim.step().filter(e => e.type === 'result' || e.type === 'sunk').length, 0);
});

test('same-step AA arrival respects bomb release ordering, without canceling already released bombs', () => {
  for (const [releaseAt, hitAt, released] of [[0.75, 0.25, false], [0.25, 0.75, true]]) {
    const sim = quiet(new TargetBattleSimulation(config('light_cv', 'bismarck')), 900); steps(sim, 210);
    sim.step([{ type: 'aim', point: { x: 900, y: 0.5, z: 0 } }, { type: 'fire' }]);
    const plane = sim.state.aircraft[0], weapon = content.weapons[plane.weaponId];
    const fall = Math.sqrt(2 * plane.position.y / content.rules.gravity);
    plane.position = { x: 900 - weapon.travel_u_s * fall - weapon.travel_u_s / 30 * releaseAt, y: plane.position.y, z: 0 };
    plane.hp = 1;
    sim.launch({ id: 'chronological-aa', owner: 'enemy', position: { ...plane.position }, velocity: { x: 0, y: 0, z: 0 },
      shellType: 'HE', power: { he: content.weapons.aa_40.damage, apBonus: 0 }, elevation: 0, kind: 'aa', weaponId: 'aa_40',
      targetId: plane.id, fuseRemaining: hitAt / 30, hitProbability: 1,
    }, 0);
    const events = sim.step();
    assert.ok(events.some(e => e.type === 'aircraft-shot-down' && e.aircraftId === plane.id));
    assert.equal(events.some(e => e.type === 'aircraft-dropped' && e.aircraftId === plane.id), released);
    assert.equal(sim.state.projectiles.some(p => p.kind === 'bomb'), released);
    assert.equal(group(sim).aircraftLost, 1);
  }
});

test('a torpedo cannot impact beyond its remaining travel range in the final fixed step', () => {
  const sim = quiet(new TargetBattleSimulation(config('torpedo_dd', 'bismarck')), 500); steps(sim, 210);
  const nearHull = 500 - content.ships.bismarck.beam_u / 2;
  const projectile = { id: 'expired-torpedo', owner: 'player', position: { x: nearHull - 1, y: 0.5, z: 0 },
    velocity: { x: content.weapons.torpedo_fast.travel_u_s, y: 0, z: 0 }, shellType: 'HE',
    power: { he: content.weapons.torpedo_fast.damage, apBonus: 0 }, elevation: 0, kind: 'torpedo',
    weaponId: 'torpedo_fast', rangeRemaining: 0.1, traveled: 0 };
  sim.launch(projectile, 0);
  const hp = sim.state.combat.enemy.hp, protection = sim.state.combat.enemy.protection, events = sim.step();
  assert.ok(!events.some(e => e.type === 'impact')); assert.equal(sim.state.projectiles.length, 0);
  assert.equal(sim.state.combat.enemy.hp, hp); assert.equal(sim.state.combat.enemy.protection, protection);
});
