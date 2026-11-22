import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createShip } from '../../src/ships.ts';
import { turretMuzzle } from '../../src/yamato.ts';
import { hullIntersection, shellPower, gunBallistics, ballisticVelocity } from '../../src/combat.ts';
import { parseOriginalData } from '../../src/original-data.ts';
import { createAmmunition, fireGun } from '../../src/ammunition.ts';
import { createModelBattleConfig } from '../../src/adapters/local/battle-config.ts';
import { LocalBattleSession } from '../../src/adapters/local/battle-session.ts';
import { muzzlePoints } from '../../src/simulation/weapons.ts';

const models = new Map(await Promise.all(['yamato', 'bismarck', 'california', 'yorktown'].map(async key => {
  const bytes = readFileSync(new URL(`../../content/assets/ships/${key}/${key}.glb`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return [key, gltf.scene];
})));
const data = parseOriginalData(JSON.parse(readFileSync(new URL('../../content/data/legacy/official-data.json', import.meta.url))));
const cases = [['nf-4-116', 4, 2], ['nf-1-430', 4, 3], ['nf-1-102', 0, 0]];

test('model contract is copied once into numeric cannon anchors and visual replacements cannot change a running battle', () => {
  for (const [id, gunId] of [['nf-3-121', 'nf-gun-3-341'], ['nf-4-116', 'nf-gun-4-393'], ['nf-1-430', 'nf-gun-1-42']]) {
    const player = createShip(models, id);
    const loadout = { typeId: id, bulgeLevel: 1, weapons: player.turrets.map(() => gunId),
      ammunition: player.turrets.map(() => createAmmunition()) };
    const input = createModelBattleConfig(data, models, loadout, { team: 'alpha', slot: 0 }, 42);
    const session = new LocalBattleSession(input), baseline = new LocalBattleSession(input);
    const definition = session.config.ships[0];
    for (const [index, turret] of player.turrets.entries()) {
      const pose = { x: 120, z: -50, heading: 0.7, speed: 0, throttle: 0 };
      const weapon = { ...session.observe().ships[0].weapons[index], yaw: turret.rear ? 2.8 : 0.3, elevation: 0.2 };
      player.ship.position.set(pose.x, 0, pose.z); player.ship.rotation.set(0, pose.heading, 0);
      turret.group.rotation.set(0, weapon.yaw, 0); turret.elevation.rotation.set(-weapon.elevation, 0, 0);
      player.ship.updateMatrixWorld(true);
      const numeric = muzzlePoints(pose, definition.weapons[index], weapon);
      for (const [tube, node] of turret.muzzles.entries()) {
        const visual = node.getWorldPosition(new THREE.Vector3());
        assert.ok(visual.distanceTo(new THREE.Vector3(numeric[tube].x, numeric[tube].y, numeric[tube].z)) < 1e-7,
          `${id}: gun ${index}, tube ${tube}`);
      }
    }
    player.ship.scale.setScalar(7); player.dimensions.length = 1;
    for (const turret of player.turrets) turret.group.position.set(1e6, 99, 1e6);
    assert.deepEqual(createModelBattleConfig(data, models, loadout, { team: 'alpha', slot: 0 }, 42), baseline.config);
    input.ships[0].weapons[0].power.he = 999999;
    const camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 1, 15000);
    for (let frame = 0; frame < 144; frame++) {
      camera.position.set(Math.sin(frame) * 5000, 900, Math.cos(frame) * 5000);
      camera.zoom = frame % 2 ? 0.05 : 3.5; camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      session.advance(1 / 144);
    }
    baseline.advance(1);
    assert.deepEqual(session.observe(), baseline.observe());
  }
});

test('imported native meshes retain hull proportions within runtime face/byte budgets', () => {
  for (const [id] of cases) {
    const instance = createShip(models, id);
    const size = new THREE.Box3().setFromObject(instance.ship.getObjectByName('Hull')).getSize(new THREE.Vector3());
    assert.ok(size.z > instance.dimensions.length * 0.98 && size.z < instance.dimensions.length * 1.1);
    assert.ok(size.x > instance.dimensions.beam * 0.95 && size.x < instance.dimensions.beam * 1.1);
    let faces = 0;
    instance.ship.traverse(object => {
      if (!object.isMesh) return;
      const positions = object.geometry.attributes.position, normals = object.geometry.attributes.normal;
      for (const value of positions.array) assert.ok(Number.isFinite(value));
      for (const value of normals.array) assert.ok(Number.isFinite(value));
      for (const index of object.geometry.index.array) assert.ok(index >= 0 && index < positions.count);
      faces += object.geometry.index.count / 3;
    });
    assert.ok(faces > 20000 && faces <= 220000);
    const bytes = readFileSync(new URL(`../../content/assets/ships/${instance.modelKey}/${instance.modelKey}.glb`, import.meta.url));
    assert.ok(bytes.byteLength <= 12 * 1024 * 1024);
  }
});

test('native twin/triple muzzle anchors stay on tube ends and rotate/elevate independently', () => {
  for (const [id, count, tubes] of cases.slice(0, 2)) {
    const { ship, turrets } = createShip(models, id);
    assert.equal(turrets.length, count);
    ship.updateMatrixWorld(true);
    const before = turrets.map(turretMuzzle);
    for (const [index, turret] of turrets.entries()) {
      assert.equal(turret.barrels.length, tubes);
      for (const [i, barrel] of turret.barrels.entries()) {
        const box = barrel.children[0].geometry.boundingBox;
        assert.ok(Math.abs(box.max.z - turret.muzzles[i].position.z) < 0.05);
        assert.ok(turret.muzzles[i].position.z > 7);
      }
      const yaw = turret.rear ? -2.8 : 0.3;
      turret.group.rotation.y = yaw;
      turret.elevation.rotation.x = -0.2;
      ship.updateMatrixWorld(true);
      const expected = new THREE.Vector3(Math.sin(yaw) * Math.cos(0.2), Math.sin(0.2), Math.cos(yaw) * Math.cos(0.2));
      assert.ok(turret.muzzles[0].getWorldDirection(new THREE.Vector3()).distanceTo(expected) < 1e-8);
      assert.ok(turretMuzzle(turret).distanceTo(before[index]) > 1);
      for (let j = index + 1; j < turrets.length; j++) assert.ok(turretMuzzle(turrets[j]).distanceTo(before[j]) < 1e-8);
    }
  }
});

test('Yorktown flight-deck faces have one deck material rather than simplification-induced color patches', () => {
  const instance = createShip(models, 'nf-1-102');
  let deckFaces = 0;
  instance.ship.getObjectByName('Hull').traverse(object => {
    if (!object.isMesh) return;
    const positions = object.geometry.attributes.position, indices = object.geometry.index.array;
    for (let i = 0; i < indices.length; i += 3) {
      const points = [indices[i], indices[i + 1], indices[i + 2]].map(index => new THREE.Vector3().fromBufferAttribute(positions, index));
      const heights = points.map(point => point.y);
      const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
      if (Math.max(...heights) - Math.min(...heights) > 0.025 ||
        Math.abs(heights.reduce((sum, y) => sum + y, 0) / 3 - instance.dimensions.height) > 0.04 ||
        normal.length() / 2 < 5 || normal.clone().normalize().y < 0.999) continue;
      assert.equal(object.material.name, 'teak-deck');
      deckFaces++;
    }
  });
  assert.ok(deckFaces > 10);
});

test('switching hulls creates independent rigs and keeps carrier/placeholder/reference semantics', () => {
  const first = createShip(models, 'nf-4-116'), second = createShip(models, 'nf-4-116');
  first.turrets[0].group.rotation.y = 1;
  first.ship.position.x = 10;
  assert.equal(second.ship.position.x, 0);
  assert.equal(second.turrets[0].group.rotation.y, 0);
  assert.equal(createShip(models, 'nf-1-430').turrets.length, 4);
  const carrier = createShip(models, 'nf-1-102');
  assert.equal(carrier.turrets.length, 0);
  assert.equal(carrier.ship.getObjectByName('Turret-0'), undefined);
  assert.match(createShip(models, 'nf-3-465').modelName, /同源参考/);
  assert.match(createShip(models, 'nf-4-370').modelName, /同级参考/);
  assert.match(createShip(models, 'nf-1-4').modelName, /占位/);
  const damaged = models.get('bismarck').clone(true);
  damaged.getObjectByName('Ship').userData.shipModel.barrels[0] = 0;
  assert.throws(() => createShip(new Map(models).set('bismarck', damaged), 'nf-4-116'), /炮位参数/);
  assert.equal(createShip(models, 'nf-4-116').turrets[0].barrels.length, 2);
});

test('continuous hull hits use each imported length and beam instead of Yamato bounds', () => {
  const pose = { x: 0, z: 0, heading: 0, throttle: 0, speed: 0 };
  const bismarck = createShip(models, 'nf-4-116').dimensions;
  const california = createShip(models, 'nf-1-430').dimensions;
  const from = { x: -50, y: 2, z: 120 }, to = { x: 50, y: 2, z: 120 };
  assert.notEqual(hullIntersection(from, to, pose, pose, bismarck), null);
  assert.equal(hullIntersection(from, to, pose, pose, california), null);
  const narrowFrom = { x: 18.1, y: 2, z: -180 }, narrowTo = { x: 18.1, y: 2, z: 180 };
  assert.notEqual(hullIntersection(narrowFrom, narrowTo, pose, pose, bismarck), null);
  assert.equal(hullIntersection(narrowFrom, narrowTo, pose, pose, california), null);
  assert.throws(() => hullIntersection(from, to, pose, pose, { ...california, length: NaN }), RangeError);
});

test('new ships fire two/three shells per gun with their real international ammunition tables', () => {
  for (const [id, gunId, he] of [['nf-4-116', 'nf-gun-4-393', 1661], ['nf-1-430', 'nf-gun-1-42', 1063]]) {
    const instance = createShip(models, id);
    const weapon = data.guns.find(gun => gun.id === gunId);
    const power = shellPower(data, weapon);
    assert.equal(power.he, he);
    assert.equal(power.apBonus, 4);
    const ballistics = gunBallistics(weapon);
    instance.ship.updateMatrixWorld(true);
    for (const turret of instance.turrets) {
      const control = { ammunition: createAmmunition(), reload: 0 };
      assert.equal(fireGun(control, turret.barrels.length, weapon.reloadSeconds).fired, true);
      assert.equal(control.ammunition.lockers.A.remaining, 60 - turret.barrels.length);
      const muzzle = turretMuzzle(turret);
      assert.ok(ballisticVelocity(muzzle, { x: 0, y: 0.5, z: 500 }, ballistics.speed));
    }
  }
});
