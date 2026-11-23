import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createShip } from '../../src/presentation/ships/ship-models.ts';
import { updateVisualWeaponGroups } from '../../src/presentation/ships/weapon-rig.ts';
import { createTargetBattleConfig } from '../../src/adapters/local/target-battle-config.ts';
import { LocalBattleSession } from '../../src/adapters/local/battle-session.ts';
import { createAmmunition } from '../../src/ammunition.ts';
import { originalShipSpecifications, buildOriginalShip, geometryManifest } from '../../tools/models/generate-original-ships.mjs';

const root = new URL('../../', import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('content/manifests/ship-model-catalog.json', root), 'utf8'));
const content = JSON.parse(readFileSync(new URL('content/data/ships/target.json', root), 'utf8'));
const originals = catalog.targetModels.filter(entry => entry.status === 'local_original');
const models = new Map(await Promise.all(originals.map(async entry => {
  const bytes = readFileSync(new URL(entry.runtimeAsset, root));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return [entry.modelId, gltf.scene];
})));
function configFor(id) {
  const ship = content.ships[id];
  return createTargetBattleConfig(content, { typeId: id, bulgeLevel: 0,
    weapons: Array(ship.main_mounts).fill(ship.main_weapon_id),
    ammunition: Array.from({ length: ship.main_mounts }, () => createAmmunition()) }, { team: 'alpha', slot: 0 }, 42);
}

test('unified visual source drives authored geometry without a second per-ship JavaScript data table', () => {
  const visuals = JSON.parse(readFileSync(new URL('content/data/ships/original-visuals.json', root), 'utf8'));
  const editable = visuals.ships.map(ship => Object.fromEntries(visuals.editableFields.map(field => [field, ship[field]])));
  assert.deepEqual(originalShipSpecifications, editable);
  const digest = createHash('sha256').update(JSON.stringify(editable, null, 2) + '\n').digest('hex');
  assert.equal(visuals.visualInputSha256, digest);
  for (const entry of originals) {
    const source = JSON.parse(readFileSync(new URL(entry.source, root), 'utf8'));
    assert.equal(source.visualInputSha256, digest);
  }
  const spec = structuredClone(editable[0]);
  const before = geometryManifest(buildOriginalShip(spec, content)).geometrySha256;
  spec.bridge[2] *= 1.2;
  assert.notEqual(geometryManifest(buildOriginalShip(spec, content)).geometrySha256, before);
});

test('all twelve catalog bindings are persisted with hashes; four old model bytes remain unchanged', () => {
  assert.equal(originals.length, 8);
  assert.equal(catalog.targetSummary.missingRuntimeModels, 0);
  const oldHashes = { california: '1718958064e22ab88db06138f64cc73d26ba15401b7190c0e1fc1989f373d6ad',
    bismarck: 'a320f1501ab978766aa3103d9b15c10fc580c10ffef0671ee611efaf6e62f9b6',
    yamato: '532c6e31236d045e8f55b304b2291ed999832d7ecfd2bb7e158bd4f44e575039',
    yorktown: '0a73157188ac0d69329c0eaaf268617981c99671724eb240183283f63b85ad7a' };
  for (const entry of catalog.targetModels) {
    const hash = createHash('sha256').update(readFileSync(new URL(entry.runtimeAsset, root))).digest('hex');
    assert.equal(hash, entry.sha256);
    if (entry.status === 'local_original') {
      assert.equal(entry.author, 'navyfield project contributors');
      assert.equal(entry.previousCandidate.runtimeAsset, null);
    } else assert.equal(hash, oldHashes[entry.modelId]);
  }
  execFileSync(process.execPath, ['tools/models/register-original-ships.mjs', '--verify'], { cwd: root });
});

test('numeric groups bind to independent visual rigs without changing firing origins or control identity', () => {
  for (const entry of originals) {
    const first = createShip(models, entry.modelId), second = createShip(models, entry.modelId);
    const config = configFor(entry.shipId), before = structuredClone(config);
    const observation = JSON.parse(JSON.stringify(new LocalBattleSession(config).observe()));
    const defs = config.target.groups.filter(group => group.side === 'player' && group.slot !== 'main');
    assert.equal(first.auxiliaryGroups.length, defs.length);
    for (const rig of first.auxiliaryGroups) {
      const state = observation.target.groups.find(group => group.side === 'player' &&
        (rig.bankId ? group.id === `player-${rig.bankId}` : group.slot === rig.slot && group.control === rig.control));
      assert.ok(state);
      assert.equal(rig.mounts.length, state.mounts);
      assert.equal(rig.control, state.control);
      state.enabled = true; state.yaw = 0.3;
    }
    updateVisualWeaponGroups(first.auxiliaryGroups, 'player', observation);
    for (const [i, rig] of first.auxiliaryGroups.entries()) {
      for (const [j, mount] of rig.mounts.entries()) {
        assert.equal(mount.group.userData.enabled, true);
        assert.notEqual(mount.group, second.auxiliaryGroups[i].mounts[j].group);
        assert.equal(second.auxiliaryGroups[i].mounts[j].group.rotation.y, mount.baseYaw);
        if (rig.control === 'automatic') assert.ok(Math.abs(mount.group.rotation.y - rig.bearing - 0.3) < 1e-10);
      }
    }
    for (const group of observation.target.groups) group.enabled = false;
    updateVisualWeaponGroups(first.auxiliaryGroups, 'player', observation);
    for (const rig of first.auxiliaryGroups) for (const mount of rig.mounts) {
      assert.equal(mount.group.rotation.y, mount.baseYaw);
      assert.equal(mount.pivot.rotation.x, 0);
      assert.equal(mount.group.userData.enabled, false);
    }
    assert.deepEqual(config, before);
    if (entry.modelId === 'independence') {
      assert.equal(first.turrets.length, 0);
      assert.ok(first.aircraftLaunch && first.aircraftRecovery);
      assert.notEqual(first.aircraftLaunch, first.aircraftRecovery);
    }
    if (entry.modelId === 'fletcher') assert.equal(first.turrets.length, 4);
  }
});

test('automatic AA tracks elevation only from the observed aircraft and does not mutate observations', () => {
  const ship = createShip(models, 'mogami');
  const observation = JSON.parse(JSON.stringify(new LocalBattleSession(configFor('torpedo_ca')).observe()));
  const aa = ship.auxiliaryGroups.find(rig => rig.slot === 'light_aa');
  const state = observation.target.groups.find(group => group.id === `player-${aa.bankId}`);
  const navigation = observation.ships.find(ship => ship.side === 'player').navigation;
  state.enabled = true; state.targetId = 'test-plane'; state.mode = 'air';
  observation.aircraft = [{ id: 'test-plane', position: { x: navigation.x + 100, y: 100, z: navigation.z + 100 } }];
  const before = structuredClone(observation);
  updateVisualWeaponGroups(ship.auxiliaryGroups, 'player', observation);
  assert.ok(aa.mounts.every(mount => mount.pivot.rotation.x < 0 && Number.isFinite(mount.pivot.rotation.x)));
  assert.deepEqual(observation, before);
});
