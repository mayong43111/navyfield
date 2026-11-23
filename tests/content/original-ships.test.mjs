import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildOriginalShip, geometryManifest, originalShipSpecifications } from '../../tools/models/generate-original-ships.mjs';
import { createShip } from '../../src/presentation/ships/ship-models.ts';
import { createTargetGunDefinitions } from '../../src/simulation/target-ship-definition.ts';

const root = new URL('../../', import.meta.url);
const content = JSON.parse(readFileSync(new URL('content/data/ships/target.json', root)));
const visuals = JSON.parse(readFileSync(new URL('content/data/ships/original-visuals.json', root)));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const models = new Map(), binaries = new Map();
for (const spec of originalShipSpecifications) {
  const bytes = readFileSync(new URL(`content/assets/ships/${spec.key}/${spec.key}.glb`, root));
  binaries.set(spec.key, bytes);
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  models.set(spec.key, (await new GLTFLoader().parseAsync(data, '')).scene);
}
const close = (actual, expected, tolerance = 1e-5) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const node = (ship, name) => {
  const result = ship.getObjectByName(name);
  assert.ok(result, `Missing ${name}`);
  return result;
};
const saved = (key, file) => JSON.parse(readFileSync(new URL(`content/assets/ships/${key}/${file}`, root)));

function validateGeometry(ship) {
  let faces = 0, meshes = 0;
  ship.traverse(object => {
    if (!object.isMesh) return;
    meshes++;
    const p = object.geometry.attributes.position, n = object.geometry.attributes.normal;
    assert.ok(p.count > 0);
    for (const value of p.array) assert.ok(Number.isFinite(value));
    for (const value of n.array) assert.ok(Number.isFinite(value));
    const indices = object.geometry.index?.array ?? Array.from({ length: p.count }, (_, i) => i);
    assert.equal(indices.length % 3, 0);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < indices.length; i += 3) {
      for (let j = 0; j < 3; j++) assert.ok(indices[i + j] >= 0 && indices[i + j] < p.count);
      a.fromBufferAttribute(p, indices[i]); b.fromBufferAttribute(p, indices[i + 1]); c.fromBufferAttribute(p, indices[i + 2]);
      assert.ok(b.sub(a).cross(c.sub(a)).lengthSq() > 1e-12, `Degenerate ${object.name}/${i / 3}`);
    }
    faces += indices.length / 3;
    assert.equal(object.material.map, null);
    assert.equal(object.material.normalMap, null);
    assert.equal(object.material.roughnessMap, null);
  });
  assert.ok(faces >= 1000 && faces < 10000);
  assert.ok(meshes >= 35 && meshes < 200);
  return faces;
}

test('all eight original assets have reproducible provenance, no imported artwork, and explicit historical/armament caveats', () => {
  assert.deepEqual(originalShipSpecifications.map(s => s.key), ['shimakaze', 'fletcher', 'cleveland', 'brooklyn', 'admiral-hipper', 'kagero', 'mogami', 'independence']);
  const targetHash = digest(readFileSync(new URL('content/data/ships/target.json', root)));
  const generatorHash = digest(readFileSync(new URL('tools/models/generate-original-ships.mjs', root)));
  assert.equal(visuals.targetInputSha256, targetHash);
  assert.equal(visuals.generatorSha256, generatorHash);
  for (const spec of originalShipSpecifications) {
    const source = saved(spec.key, 'source.json'), conversion = saved(spec.key, 'conversion.json');
    const directory = new URL(`content/assets/ships/${spec.key}/`, root);
    assert.deepEqual(readdirSync(directory).filter(file => file !== `${spec.key}.glb.gz.bin`).sort(),
      ['LICENSE.txt', 'conversion.json', 'source.json', `${spec.key}.glb`].sort());
    assert.equal(source.status, 'original-procedural');
    assert.equal(source.author, 'navyfield project contributors');
    assert.equal(source.license, 'CC-BY-4.0');
    assert.equal(source.targetId, spec.targetId);
    assert.equal(source.targetInputSha256, targetHash);
    assert.equal(source.generatorSha256, generatorHash);
    assert.deepEqual(source.externalMeshes, []);
    assert.deepEqual(source.externalTextures, []);
    assert.deepEqual(source.downloadedFiles, []);
    assert.match(source.historicalApproximation, /not an exact historical reconstruction/);
    assert.ok(source.targetArmament.length > 80);
    assert.match(source.numericFiringOriginNote, /numerical.*z=0.*physical tube tip/);
    assert.equal(source.glbSha256, digest(binaries.get(spec.key)));
    assert.equal(conversion.glbSha256, source.glbSha256);
    assert.equal(conversion.geometrySha256, source.geometrySha256);
    const license = readFileSync(new URL('LICENSE.txt', directory), 'utf8');
    assert.match(license, /Creative Commons Attribution 4.0/);
    assert.match(license, /does NOT relicense Three.js/);
    assert.equal(binaries.get(spec.key).readUInt32LE(0), 0x46546c67);
    assert.equal(binaries.get(spec.key).readUInt32LE(4), 2);
    assert.equal(binaries.get(spec.key).readUInt32LE(8), binaries.get(spec.key).length);
    assert.ok(binaries.get(spec.key).length < 512 * 1024);
  }
});

test('GLB roots, numeric hull dimensions, main yaw/elevation/recoil hierarchy and physical tips satisfy the runtime contract', () => {
  for (const spec of originalShipSpecifications) {
    const ship = node(models.get(spec.key), 'Ship'), target = content.ships[spec.targetId];
    const metadata = ship.userData.shipModel;
    assert.deepEqual(Object.keys(metadata).sort(), ['key', 'hull', 'maxHeight', 'barrels', 'rear'].sort());
    assert.equal(metadata.key, spec.key);
    assert.deepEqual(metadata.hull, { length: target.length_u, beam: target.beam_u, height: target.beam_u });
    assert.ok(metadata.maxHeight > target.beam_u && Number.isFinite(metadata.maxHeight));
    assert.equal(node(ship, 'FunnelSmoke').parent, ship);
    assert.ok(node(ship, 'FunnelSmoke').position.y > target.beam_u);
    const hullSize = new THREE.Box3().setFromObject(node(ship, 'Hull')).getSize(new THREE.Vector3());
    close(hullSize.x, target.beam_u); close(hullSize.z, target.length_u); close(hullSize.y, target.beam_u);
    const numeric = createTargetGunDefinitions(content, target, 'player', Array(target.main_mounts).fill(true), 'HE');
    assert.equal(metadata.barrels.length, numeric.length);
    assert.deepEqual(metadata.rear, numeric.map(gun => gun.rear));
    for (const [i, definition] of numeric.entries()) {
      const turret = node(ship, `Turret-${i}`), elevation = node(ship, `Elevation-${i}`);
      assert.equal(turret.parent, ship); assert.equal(elevation.parent, turret);
      assert.deepEqual(turret.position.toArray(), [definition.mount.x, definition.mount.y, definition.mount.z]);
      assert.deepEqual(elevation.position.toArray(), [0, 0, 0]);
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(turret.quaternion);
      close(forward.z, definition.rear ? -1 : 1);
      assert.equal(metadata.barrels[i], target.main_barrels);
      for (let j = 0; j < target.main_barrels; j++) {
        const barrel = node(ship, `Barrel-${i}-${j}`), muzzle = node(ship, `Muzzle-${i}-${j}`);
        assert.equal(barrel.parent, elevation); assert.equal(muzzle.parent, barrel);
        assert.deepEqual(barrel.position.toArray(), [j - (target.main_barrels - 1) / 2, 0, 0]);
        assert.ok(muzzle.position.z > 0);
        assert.deepEqual(definition.muzzles[j], { x: barrel.position.x, y: 0, z: 0 });
        const tube = node(ship, `Main-Tube-${i}-${j}`);
        const localBounds = new THREE.Box3().setFromObject(tube);
        assert.ok(!localBounds.isEmpty());
        const tubeLength = target.beam_u * (target.class === 'DD' ? 0.54 : 0.65);
        close(muzzle.position.z, tubeLength);
        close(tube.position.z * 2, tubeLength);
      }
    }
    if (content.weapons[target.main_weapon_id].kind === 'aircraft') {
      assert.deepEqual(metadata.barrels, []); assert.deepEqual(metadata.rear, []);
      assert.equal(ship.getObjectByName('Turret-0'), undefined);
      const launch = node(ship, 'AircraftLaunch'), recovery = node(ship, 'AircraftRecovery');
      assert.equal(launch.parent, ship); assert.equal(recovery.parent, ship);
      assert.ok(launch.position.distanceTo(recovery.position) > target.length_u * 0.5);
      assert.ok(launch.position.z > 0 && recovery.position.z < 0);
      for (const point of [launch, recovery]) for (const value of point.position.toArray()) assert.ok(Number.isFinite(value));
    }
  }
});

test('every real manual/automatic bank has complete unique auxiliary mounts, controls, pivots and all barrel muzzle markers', () => {
  for (const spec of originalShipSpecifications) {
    const ship = node(models.get(spec.key), 'Ship'), target = content.ships[spec.targetId];
    const groups = ship.userData.visualWeaponGroups, seen = new Set();
    assert.deepEqual(groups, saved(spec.key, 'conversion.json').visualWeaponGroups);
    const expectedBanks = Object.values(content.automation).filter(b => b.ship_id === target.id);
    assert.deepEqual(groups.filter(g => g.bankId).map(g => g.bankId), expectedBanks.map(b => b.id));
    const secondaryControl = content.controls[`${target.id}:secondary`];
    const manualSecondary = groups.filter(g => g.slot === 'secondary' && !g.bankId);
    assert.equal(manualSecondary.length, target.secondary_weapon_id && secondaryControl.control !== 'automatic' ? 1 : 0);
    for (const entry of groups) {
      const control = content.controls[entry.controlId];
      assert.equal(entry.control, control.control);
      assert.equal(entry.kind, content.weapons[entry.weaponId].kind);
      assert.deepEqual(entry.availableModes, control.available_modes.split('|'));
      const parent = node(ship, entry.loadedGroupNode);
      assert.equal(entry.loadedGroupNode, THREE.PropertyBinding.sanitizeNodeName(entry.groupNode));
      if (entry.slot !== 'main') {
        assert.equal(parent.parent, ship);
        assert.equal(parent.userData.name, `WeaponGroup-${entry.controlId}`);
      }
      assert.equal(entry.mounts.length, entry.kind === 'aircraft' ? 0 : entry.targetMounts);
      if (entry.bankId) {
        const bank = content.automation[entry.bankId];
        assert.equal(entry.control, 'automatic');
        assert.equal(entry.targetMounts, bank.mounts); assert.equal(entry.targetBarrels, bank.barrels);
        assert.equal(entry.weaponId, bank.weapon_id); assert.equal(entry.bearingDeg, bank.bearing_deg); assert.equal(entry.arcDeg, bank.arc_deg);
      }
      for (const mount of entry.mounts) {
        const mounted = node(ship, mount.loadedNode), pivot = node(ship, mount.loadedPivot);
        assert.equal(mounted.parent, parent); assert.equal(pivot.parent, mounted);
        assert.equal(mount.barrelNodes.length, entry.targetBarrels);
        assert.equal(mount.muzzleNames.length, entry.targetBarrels);
        assert.deepEqual(mounted.position.toArray(), mount.position);
        const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(mounted.quaternion);
        close(facing.x, Math.sin(mount.baseYaw)); close(facing.z, Math.cos(mount.baseYaw));
        for (const [j, muzzleName] of mount.loadedMuzzleNames.entries()) {
          assert.ok(!seen.has(muzzleName), `Duplicate muzzle ${muzzleName}`); seen.add(muzzleName);
          const barrel = node(ship, mount.loadedBarrelNodes[j]), muzzle = node(ship, muzzleName);
          assert.equal(barrel.parent, pivot); assert.equal(muzzle.parent, barrel);
          assert.equal(barrel.position.z, 0); assert.ok(muzzle.position.z > 0);
          assert.equal(mount.loadedMuzzleNames[j], THREE.PropertyBinding.sanitizeNodeName(mount.muzzleNames[j]));
          if (entry.slot !== 'main') assert.equal(muzzle.userData.name, `WeaponMuzzle-${entry.controlId}-${mount.index}-${j}`);
        }
        if (entry.bankId && entry.slot === 'secondary') {
          assert.equal(Math.sign(mounted.position.x), entry.bearingDeg === 270 ? -1 : 1);
        }
      }
    }
    const declaredMuzzles = new Set(groups.flatMap(g => g.mounts.flatMap(m => m.loadedMuzzleNames)));
    ship.traverse(object => {
      if (/^(?:WeaponMuzzle|Muzzle)-/.test(object.name)) assert.ok(declaredMuzzles.has(object.name), `Undeclared muzzle ${object.name}`);
    });
    if (spec.key === 'kagero' || spec.key === 'mogami') {
      const torpedoes = manualSecondary[0];
      assert.equal(torpedoes.control, 'manual'); assert.equal(torpedoes.kind, 'torpedo');
      assert.equal(torpedoes.mounts.length, 2); assert.equal(torpedoes.targetBarrels, 4);
    }
  }
});

test('original solid hulls, flat decks and all exported triangles are finite/nondegenerate and shape signatures are distinct', () => {
  const shapeSignatures = new Set(), normalizedHulls = new Set();
  for (const spec of originalShipSpecifications) {
    const ship = node(models.get(spec.key), 'Ship'), target = content.ships[spec.targetId];
    const triangles = validateGeometry(ship), conversion = saved(spec.key, 'conversion.json');
    assert.equal(triangles, conversion.triangles);
    shapeSignatures.add(conversion.geometrySha256);
    const original = buildOriginalShip(spec, content);
    assert.equal(geometryManifest(original).geometrySha256, conversion.geometrySha256);
    const p = node(ship, 'Freeboard').geometry.attributes.position;
    normalizedHulls.add(digest(JSON.stringify(Array.from({ length: p.count }, (_, i) => [
      Number((p.getX(i) / target.beam_u).toFixed(5)), Number((p.getZ(i) / target.length_u).toFixed(5))
    ]))));
    const deck = node(ship, spec.key === 'independence' ? 'FlightDeck' : 'Deck');
    const size = new THREE.Box3().setFromObject(deck).getSize(new THREE.Vector3());
    assert.ok(size.z > target.length_u * 0.9);
    assert.ok(size.y < target.beam_u * 0.1);
    if (spec.key === 'independence') {
      assert.ok(node(ship, 'StarboardIsland').position.x > target.beam_u * 0.3);
      assert.ok(size.z / size.x > 7);
      for (let i = 0; i < 4; i++) node(ship, `Funnel-${i}`);
    } else for (let i = 0; i < spec.funnels.length; i++) node(ship, `Funnel-${i}`);
    if (spec.key === 'shimakaze') {
      for (let i = 0; i < 3; i++) {
        const bank = node(ship, `DecorativeTorpedoBank-${i}`);
        assert.equal(bank.userData.decorativeOnly, true);
        for (let tube = 0; tube < 5; tube++) node(bank, `Decorative-Tube-${i}-${tube}`);
      }
      assert.equal(ship.userData.visualWeaponGroups.filter(g => g.kind === 'torpedo').length, 0);
    }
  }
  assert.equal(shapeSignatures.size, 8);
  assert.equal(normalizedHulls.size, 8);
});

test('existing runtime creates independent main and auxiliary rigs without mutating a model template or other clone', () => {
  for (const spec of originalShipSpecifications) {
    const a = createShip(models, spec.key), b = createShip(models, spec.key), template = node(models.get(spec.key), 'Ship');
    assert.equal(a.modelKey, spec.key); assert.notEqual(a.ship, b.ship);
    assert.equal(a.turrets.length, a.ship.userData.shipModel.barrels.length);
    a.ship.position.x = 50;
    assert.equal(b.ship.position.x, 0); assert.equal(template.position.x, 0);
    assert.notEqual(a.ship.userData.shipModel, b.ship.userData.shipModel);
    a.ship.userData.shipModel.hull.length = 1;
    assert.equal(b.dimensions.length, content.ships[spec.targetId].length_u);
    assert.equal(template.userData.shipModel.hull.length, content.ships[spec.targetId].length_u);
    for (const [i, turret] of a.turrets.entries()) {
      const other = b.turrets[i], yaw = 0.43, elevation = 0.21;
      const before = other.muzzles[0].getWorldPosition(new THREE.Vector3());
      turret.group.rotation.set(0, yaw, 0); turret.elevation.rotation.set(-elevation, 0, 0);
      turret.barrels[0].position.z = -0.8; a.ship.updateMatrixWorld(true);
      const expectedDirection = new THREE.Vector3(Math.sin(yaw) * Math.cos(elevation), Math.sin(elevation), Math.cos(yaw) * Math.cos(elevation));
      assert.ok(turret.muzzles[0].getWorldDirection(new THREE.Vector3()).distanceTo(expectedDirection) < 1e-6);
      assert.equal(other.barrels[0].position.z, 0);
      assert.ok(other.muzzles[0].getWorldPosition(new THREE.Vector3()).distanceTo(before) < 1e-6);
    }
    const auxiliary = a.ship.userData.visualWeaponGroups.find(g => g.slot !== 'main').mounts[0];
    const ap = node(a.ship, auxiliary.loadedPivot), bp = node(b.ship, auxiliary.loadedPivot);
    ap.rotation.x = -0.3; node(a.ship, auxiliary.loadedBarrelNodes[0]).position.z = -0.4;
    close(bp.rotation.x, 0);
    assert.equal(node(b.ship, auxiliary.loadedBarrelNodes[0]).position.z, 0);
    close(node(template, auxiliary.loadedPivot).rotation.x, 0);
  }
});

test('generator --verify reproduces every persisted GLB, specification and provenance file byte-for-byte', () => {
  const result = spawnSync(process.execPath, ['tools/models/generate-original-ships.mjs', '--verify'], {
    cwd: fileURLToPath(root), encoding: 'utf8', timeout: 60000
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stdout.split('\n').filter(line => line.startsWith('Verified ')).length, 8);
});
