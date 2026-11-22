import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createYamato } from '../src/yamato.ts';

const bytes = readFileSync(new URL('../resources/models/yamato/yamato.glb', import.meta.url));
const model = await new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');

test('converted native hull preserves scale and valid three-dimensional geometry', () => {
  const { ship } = createYamato(model.scene);
  const hull = ship.getObjectByName('Hull');
  assert.ok(hull);
  const size = new THREE.Box3().setFromObject(hull).getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.z - 263) < 0.01);
  assert.ok(size.x > 36 && size.x < 42);
  assert.ok(size.y > 12);
  ship.traverse(object => {
    if (!object.isMesh) return;
    for (const value of object.geometry.getAttribute('position').array) assert.ok(Number.isFinite(value));
  });
});

test('real muzzle anchors coincide with imported tubes and follow only their own turret', () => {
  const { ship, turrets } = createYamato(model.scene);
  ship.updateMatrixWorld(true);
  assert.equal(turrets.length, 3);
  for (const turret of turrets) {
    assert.equal(turret.barrels.length, 3);
    for (const [index, barrel] of turret.barrels.entries()) {
      const muzzle = turret.muzzles[index];
      assert.equal(muzzle.parent, barrel);
      const bounds = new THREE.Box3();
      barrel.traverse(object => {
        if (!object.isMesh) return;
        object.geometry.computeBoundingBox();
        bounds.union(object.geometry.boundingBox);
      });
      assert.ok(Math.abs(bounds.max.z - muzzle.position.z) < 0.05);
      assert.ok(muzzle.position.z > 10);
    }
  }
  const before = turrets.map(turret => turret.muzzles[1].getWorldPosition(new THREE.Vector3()));
  turrets[0].group.rotation.y += Math.PI / 6;
  turrets[0].elevation.rotation.x = -0.25;
  ship.updateMatrixWorld(true);
  const after = turrets.map(turret => turret.muzzles[1].getWorldPosition(new THREE.Vector3()));
  assert.ok(before[0].distanceTo(after[0]) > 1);
  assert.ok(before[1].distanceTo(after[1]) < 1e-9);
  assert.ok(before[2].distanceTo(after[2]) < 1e-9);
});

test('imported rear turret uses the same yaw/elevation axes as the fire-control solver', () => {
  const { ship, turrets } = createYamato(model.scene);
  for (const turret of turrets) {
    const yaw = turret.rear ? -2.8 : 0.3;
    turret.group.rotation.y = yaw;
    turret.elevation.rotation.x = -0.2;
    ship.updateMatrixWorld(true);
    const direction = turret.muzzles[1].getWorldDirection(new THREE.Vector3());
    const expected = new THREE.Vector3(Math.sin(yaw) * Math.cos(0.2), Math.sin(0.2),
      Math.cos(yaw) * Math.cos(0.2));
    assert.ok(direction.distanceTo(expected) < 1e-8);
  }
});
