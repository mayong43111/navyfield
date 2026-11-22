import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombat, applyImpact, resolveBattle, hullIntersection, ballisticVelocity,
  dispersedTarget, enemyCourse, leadTarget, impactDamage, shellPower, deploymentPoses, sinkingPose,
  gunBallistics, createBattleLayout, bulgeCapacity } from '../src/combat.ts';
import { GRAVITY, ballisticRange } from '../src/navigation.ts';
import { parseOriginalData } from '../src/original-data.ts';
import { readFileSync } from 'node:fs';

const pose = (x = 0, z = 0, heading = 0) => ({ x, z, heading, throttle: 0, speed: 0 });
test('ordinary HE labels support both official space and hyphen separators without selecting light shells', () => {
  const data = parseOriginalData(JSON.parse(readFileSync(new URL('../resources/original-data/official-data.json', import.meta.url))));
  for (const id of ['nf-gun-3-341', 'nf-gun-4-393', 'nf-gun-1-42']) {
    const gun = data.guns.find(gun => gun.id === id);
    const expected = shellPower(data, gun);
    assert.ok(expected && expected.he > 0);
    const shells = data.shells.map(table => ({ ...table, rows: table.rows.map(row =>
      / HE Shell[ -]Normal$/.test(row[0] ?? '') ? [row[0].replace(/Normal$/, 'Light'), ...row.slice(1)] : row) }));
    assert.equal(shellPower({ ...data, shells }, gun), null);
  }
});
test('four precomputed spawn regions separate opposing edges by ten maximum ranges and contain every formation page', () => {
  const layout = createBattleLayout(3100, 143);
  assert.equal(layout.regions.length, 4);
  const alpha = layout.regions.filter(r => r.team === 'alpha'), bravo = layout.regions.filter(r => r.team === 'bravo');
  for (const left of alpha) for (const right of bravo) assert.ok(right.minX - left.maxX >= 3100 * 10);
  const locations = new Set();
  for (const team of ['alpha', 'bravo']) {
    for (const slot of [0, 7, 47, 48, 95, 96, 143]) {
      const { player, enemy } = deploymentPoses({ team, slot }, layout);
      const region = layout.regions.find(r => r.team === team && r.zone === Math.floor(slot / 48) % 2);
      assert.ok(player.x - 131.5 >= region.minX && player.x + 131.5 <= region.maxX);
      assert.ok(player.z - 19 >= region.minZ && player.z + 19 <= region.maxZ);
      assert.ok(Math.hypot(player.x - enemy.x, player.z - enemy.z) >= layout.gap);
      assert.equal(player.heading, team === 'alpha' ? Math.PI / 2 : -Math.PI / 2);
      assert.equal(enemy.heading, -player.heading);
      locations.add(`${player.x},${player.z}`);
    }
  }
  assert.equal(locations.size, 14);
  assert.throws(() => createBattleLayout(0));
  assert.throws(() => deploymentPoses({ team: 'alpha', slot: -1 }, layout));
  assert.throws(() => deploymentPoses({ team: 'alpha', slot: 2000 }, layout));
});
test('configured bulge capacity is stored independently from hull HP and not consumed by main-gun hits', () => {
  const data = parseOriginalData(JSON.parse(readFileSync(new URL('../resources/original-data/official-data.json', import.meta.url))));
  assert.equal(bulgeCapacity(data, 3, 1), 5000);
  assert.equal(bulgeCapacity(data, 3, 3), 15000);
  assert.equal(bulgeCapacity(data, 0, 1), 3500);
  assert.equal(bulgeCapacity(data, 3, 0), 0);
  assert.equal(bulgeCapacity({ ...data, armor: [] }, 3, 1), null);
  assert.throws(() => bulgeCapacity(data, 3, 1.5));
  const state = createCombat(26300, 26300, bulgeCapacity(data, 3, 3));
  applyImpact(state, 'enemy', { he: 1848, apBonus: 3 }, 'HE', 0.1);
  assert.equal(state.player.hp, 24452);
  assert.equal(state.player.protection, 15000);
  assert.equal(state.player.maxProtection, 15000);
  assert.throws(() => createCombat(26300, 26300, -1));
});
test('sinking progressively heels and floods before fully submerging, without indefinite rotation', () => {
  const initial = sinkingPose(0), middle = sinkingPose(8), end = sinkingPose(18);
  assert.ok(initial.depth === 0);
  assert.ok(middle.visible && middle.depth < -8 && middle.roll > 0.5 && middle.pitch > 0);
  assert.ok(!end.visible && end.depth < -50 && end.roll <= 0.9);
  assert.deepEqual(sinkingPose(100), end);
  assert.throws(() => sinkingPose(-1));
});
test('dispersion fills a firing-aligned ellipse with visible misses, no radial bias and range growth', () => {
  let seed = 43111;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const from = { x: 0, y: 12, z: 0 }, target = { x: 500, y: 0.5, z: 0 };
  const alongRadius = 63, acrossRadius = 26.5;
  let radialMoment = 0, meanX = 0, meanZ = 0, misses = 0;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < 4096; i++) {
    const point = dispersedTarget(from, target, random);
    const dx = point.x - target.x, dz = point.z - target.z;
    const ellipse = (dx / alongRadius) ** 2 + (dz / acrossRadius) ** 2;
    assert.ok(ellipse <= 1 + 1e-12);
    radialMoment += ellipse;
    meanX += dx; meanZ += dz;
    if (Math.abs(dx) > 19) misses++;
    minX = Math.min(minX, dx); maxX = Math.max(maxX, dx);
    minZ = Math.min(minZ, dz); maxZ = Math.max(maxZ, dz);
  }
  assert.ok(Math.abs(radialMoment / 4096 - 0.5) < 0.03);
  assert.ok(Math.hypot(meanX, meanZ) / 4096 < acrossRadius * 0.04);
  assert.ok(maxX - minX > 120 && maxZ - minZ > 50);
  assert.ok(misses / 4096 > 0.45 && misses / 4096 < 0.8);
  const near = dispersedTarget(from, { ...target, x: 100 }, () => 0.5);
  const far = dispersedTarget(from, target, () => 0.5);
  assert.ok(Math.abs(far.x - 500) > Math.abs(near.x - 100));
  const rotated = dispersedTarget(from, { x: 0, y: 0.5, z: 500 }, () => 0.5);
  assert.ok(Math.abs(rotated.z - 500) > Math.abs(rotated.x));
});
test('official muzzle values set different game ranges and edge dispersion remains launchable', () => {
  const data = parseOriginalData(JSON.parse(readFileSync(new URL('../resources/original-data/official-data.json', import.meta.url))));
  const profiles = ['nf-gun-3-341', 'nf-gun-3-342', 'nf-gun-3-343']
    .map(id => gunBallistics(data.guns.find(g => g.id === id)));
  const [normal, long, short] = profiles.map(p => ballisticRange(0, p.maxAngle, p.speed));
  assert.ok(Math.abs(normal - 2500) < 1e-8);
  assert.ok(long > normal && short < normal);
  for (const profile of profiles) {
    const from = { x: 0, y: 12, z: 0 };
    const range = ballisticRange(11.5, profile.maxAngle, profile.speed);
    assert.ok(range > 2000);
    for (let i = 0; i < 100; i++) {
      let n = 0;
      const point = dispersedTarget(from, { x: range, y: 0.5, z: 0 },
        () => n++ === 0 ? 0.999 : i / 100, range * (1 - 1e-9));
      const velocity = ballisticVelocity(from, point, profile.speed);
      assert.ok(velocity);
      const angle = Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z));
      assert.ok(angle <= profile.maxAngle);
      const time = point.x / velocity.x;
      assert.ok(Math.abs(from.y + velocity.y * time - GRAVITY * time * time / 2 - point.y) < 1e-7);
      if (i === 0) assert.ok(time > 15, 'long-range shells must survive the old 15-second cutoff');
    }
  }
  assert.equal(gunBallistics({ raw: { maxAngle: '45' } }), null);
});
test('dispersed trajectories actually miss the hull, rather than only drawing scattered landing points', () => {
  let seed = 9713;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const from = { x: 0, y: 12, z: 0 }, target = { x: 500, y: 0.5, z: 0 };
  const enemy = pose(500);
  let hits = 0;
  for (let i = 0; i < 512; i++) {
    const velocity = ballisticVelocity(from, dispersedTarget(from, target, random));
    assert.ok(velocity);
    let previous = from;
    for (let t = 1 / 30; t < 4; t += 1 / 30) {
      const point = { x: from.x + velocity.x * t, y: from.y + velocity.y * t - GRAVITY * t * t / 2,
        z: from.z + velocity.z * t };
      if (hullIntersection(previous, point, enemy, enemy) !== null) { hits++; break; }
      if (point.y <= 0) break;
      previous = point;
    }
  }
  assert.ok(hits / 512 > 0.2 && hits / 512 < 0.85);
});
test('fast shells sweep rotated and moving hulls, not just endpoints; height and misses are excluded', () => {
  assert.equal(hullIntersection({ x: -100, y: 8, z: 0 }, { x: 100, y: 8, z: 0 }, pose(), pose()), 0.405);
  assert.equal(hullIntersection({ x: -200, y: 8, z: 0 }, { x: 200, y: 8, z: 0 },
    pose(0, 0, Math.PI / 2), pose(0, 0, Math.PI / 2)), 0.17125);
  assert.notEqual(hullIntersection({ x: 40, y: 8, z: 0 }, { x: 40, y: 8, z: 0 }, pose(), pose(80)), null);
  assert.equal(hullIntersection({ x: -100, y: 17, z: 0 }, { x: 100, y: 17, z: 0 }, pose(), pose()), null);
  assert.equal(hullIntersection({ x: -100, y: 8, z: 140 }, { x: 100, y: 8, z: 140 }, pose(), pose()), null);
});
test('ballistic shells reach their target and AI lead follows a moving target', () => {
  const from = { x: 0, y: 12, z: 0 }, target = { x: 380, y: 0.5, z: 150 };
  const v = ballisticVelocity(from, target);
  assert.ok(v);
  const t = target.x / v.x;
  assert.ok(Math.abs(from.y + v.y * t - GRAVITY * t * t / 2 - target.y) < 1e-8);
  assert.equal(ballisticVelocity(from, { x: 4000, y: 0, z: 0 }), null);
  const lead = leadTarget(from, { ...pose(350), speed: 10, heading: Math.PI / 2 });
  assert.ok(lead.x > 365);
  assert.ok(leadTarget(from, { ...pose(350), speed: 10, heading: Math.PI / 2 }, 100).x > lead.x);
  const offset = dispersedTarget(from, target, () => 0.5);
  assert.ok(Math.hypot(offset.x - target.x, offset.z - target.z) <= 28 + Math.hypot(380, 150) * 0.07);
  assert.ok(enemyCourse(pose(), pose(800)).throttle > enemyCourse(pose(), pose(350)).throttle);
});
test('official shell tables drive damage; armor and AP differ; kills clamp damage and finish once', () => {
  const data = parseOriginalData(JSON.parse(readFileSync(new URL('../resources/original-data/official-data.json', import.meta.url))));
  const power = shellPower(data, data.guns.find(g => g.id === 'nf-gun-3-341'));
  assert.deepEqual(power, { he: 1848, apBonus: 3 });
  assert.ok(impactDamage(power, 'HE', 100) < impactDamage(power, 'HE', 0));
  assert.ok(impactDamage(power, 'AP', 100) > impactDamage(power, 'HE', 100));
  const state = createCombat(26300, 2000);
  state.enemy.deck = 100;
  assert.equal(applyImpact(state, 'player', power, 'HE', Math.PI / 4), 924);
  assert.equal(applyImpact(state, 'player', power, 'AP', 0), 1076);
  assert.equal(state.player.damage, 2000);
  assert.equal(state.player.hits, 2);
  assert.equal(resolveBattle(state), 'victory');
  assert.equal(applyImpact(state, 'enemy', power, 'HE', 0), 0);
  assert.equal(state.player.hp, 26300);
  assert.throws(() => impactDamage(power, 'HE', -1));
  assert.throws(() => createCombat(0, 100));
  const closeRange = createCombat(26300, 26300);
  assert.equal(applyImpact(closeRange, 'player', power, 'HE', -0.05), 1848);
});
test('simultaneous final hits resolve a draw and no ship can be killed twice', () => {
  const state = createCombat(100, 100), power = { he: 100, apBonus: 0 };
  applyImpact(state, 'player', power, 'HE', 0);
  assert.equal(applyImpact(state, 'player', power, 'HE', 0), 0);
  applyImpact(state, 'enemy', power, 'HE', 0);
  assert.equal(resolveBattle(state), 'draw');
});
