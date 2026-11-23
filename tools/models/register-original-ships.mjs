import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../../', import.meta.url);
const path = new URL('content/manifests/ship-model-catalog.json', root);
const current = readFileSync(path, 'utf8');
const catalog = JSON.parse(current);
const target = JSON.parse(readFileSync(new URL('content/data/ships/target.json', root), 'utf8'));
const keys = new Set(['shimakaze', 'fletcher', 'cleveland', 'brooklyn', 'admiral-hipper', 'kagero', 'mogami', 'independence']);
for (const [index, entry] of catalog.targetModels.entries()) {
  if (!keys.has(entry.modelId)) continue;
  const directory = `content/assets/ships/${entry.modelId}`;
  const sourcePath = `${directory}/source.json`;
  const source = JSON.parse(readFileSync(new URL(sourcePath, root), 'utf8'));
  const asset = `${directory}/${entry.modelId}.glb`;
  const sha256 = createHash('sha256').update(readFileSync(new URL(asset, root))).digest('hex');
  if (source.status !== 'original-procedural' || source.targetId !== entry.shipId || source.glbSha256 !== sha256 ||
    source.externalMeshes.length || source.externalTextures.length) throw new Error(`Invalid original provenance: ${entry.modelId}`);
  const ship = target.ships[entry.shipId];
  const gun = target.weapons[ship.main_weapon_id].kind === 'gun';
  catalog.targetModels[index] = {
    shipId: entry.shipId, modelId: entry.modelId, name: entry.name,
    status: 'local_original', acquisitionStatus: 'original_procedural', runtimeAsset: asset, sha256,
    source: sourcePath, author: source.author, license: source.license, licenseUrl: source.licenseUrl,
    rightsStatus: 'project_original', identityStatus: 'historical_approximation_target_armament',
    identityNote: source.historicalApproximation, targetArmament: source.targetArmament,
    turretRig: { root: 'Ship', mounts: gun ? ship.main_mounts : 0, barrelsPerMount: gun ? ship.main_barrels : 0,
      yaw: 'Turret-i', elevation: 'Elevation-i', recoil: 'Barrel-i-j', muzzle: 'Muzzle-i-j',
      auxiliary: 'Ship.userData.visualWeaponGroups', numericOriginsUnchanged: true },
    modificationsFile: sourcePath, previousCandidate: entry.previousCandidate ?? entry
  };
}
catalog.targetSummary = { ...catalog.targetSummary, originalRuntimeModels: keys.size,
  missingRuntimeModels: catalog.targetModels.filter(entry => !entry.runtimeAsset).length };
const result = JSON.stringify(catalog, null, 2) + '\n';
if (process.argv.includes('--verify')) {
  if (current !== result) throw new Error('Original model catalog is stale; run npm run generate:ships');
  console.log('Original model catalog verified.');
} else {
  writeFileSync(path, result);
  console.log('Registered eight original runtime models; preserved previous candidate audits.');
}
