import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createYamato, loadYamato } from './yamato.ts';
import type { ShipInstance, Turret } from './yamato.ts';
import { loadResource } from './adapters/content/resource-loader.ts';

const types = new Map([
  ['nf-3-121', ['yamato', '大和']], ['nf-3-415', ['yamato', '大和（武藏同级参考）']],
  ['nf-3-465', ['yamato', '大和1945（同源参考）']],
  ['nf-4-116', ['bismarck', '俾斯麦']], ['nf-4-370', ['bismarck', '俾斯麦（1943 同级参考）']],
  ['nf-4-516', ['bismarck', '俾斯麦（1945 同级参考）']],
  ['nf-1-430', ['california', '加利福尼亚']], ['nf-1-102', ['yorktown', '约克镇 CV-5']]
]);

export async function loadShipModels(): Promise<ReadonlyMap<string, THREE.Object3D>> {
  const loader = new GLTFLoader();
  const [yamato, bismarck, california, yorktown] = await Promise.all([
    loadYamato(),
    loadResource(new URL('../content/assets/ships/bismarck/bismarck.glb', import.meta.url)).then(bytes => loader.parseAsync(bytes, '')),
    loadResource(new URL('../content/assets/ships/california/california.glb', import.meta.url)).then(bytes => loader.parseAsync(bytes, '')),
    loadResource(new URL('../content/assets/ships/yorktown/yorktown.glb', import.meta.url)).then(bytes => loader.parseAsync(bytes, ''))
  ]);
  return new Map([['yamato', yamato], ['bismarck', bismarck.scene], ['california', california.scene], ['yorktown', yorktown.scene]]);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function node(root: THREE.Object3D, name: string): THREE.Object3D {
  const result = root.getObjectByName(name);
  if (!result) throw new Error(`舰船模型缺少节点：${name}`);
  return result;
}

export function createShip(models: ReadonlyMap<string, THREE.Object3D>, typeId: string): ShipInstance {
  const [key = 'yamato', modelName = '大和（占位）'] = types.get(typeId) ?? [];
  const model = models.get(key);
  if (!model) throw new Error(`舰船模型未加载：${key}`);
  if (key === 'yamato') return { ...createYamato(model), modelName };
  const ship = node(model, 'Ship').clone(true);
  const metadata: unknown = ship.userData['shipModel'];
  if (!record(metadata) || metadata['key'] !== key || !record(metadata['hull']) ||
    !positive(metadata['hull']['length']) || !positive(metadata['hull']['beam']) || !positive(metadata['hull']['height']) ||
    !positive(metadata['maxHeight']) || !Array.isArray(metadata['barrels']) || !Array.isArray(metadata['rear'])) {
    throw new Error(`舰船模型参数无效：${key}`);
  }
  const counts: readonly unknown[] = metadata['barrels'];
  const rear: readonly unknown[] = metadata['rear'];
  if (rear.length !== counts.length || counts.some(count => !Number.isInteger(count) || typeof count !== 'number' || count < 1 || count > 4) ||
    rear.some(value => typeof value !== 'boolean')) throw new Error(`舰船炮位参数无效：${key}`);
  const turrets = counts.map((count, index): Turret => {
    if (typeof count !== 'number') throw new Error('舰炮管数无效');
    const group = node(ship, `Turret-${index}`), elevation = node(ship, `Elevation-${index}`);
    const barrels = Array.from({ length: count }, (_, barrel) => node(ship, `Barrel-${index}-${barrel}`));
    const muzzles = Array.from({ length: count }, (_, barrel) => node(ship, `Muzzle-${index}-${barrel}`));
    if (group.parent !== ship || elevation.parent !== group ||
      barrels.some((barrel, i) => barrel.parent !== elevation || muzzles[i]?.parent !== barrel)) {
      throw new Error(`舰炮层级无效：${key}/${index}`);
    }
    const isRear = rear[index] === true;
    group.rotation.set(0, isRear ? Math.PI : 0, 0);
    elevation.rotation.set(0, 0, 0);
    return { group, elevation, barrels, muzzles, rear: isRear, recoil: 0 };
  });
  return { ship, turrets, funnel: node(ship, 'FunnelSmoke'), modelKey: key, modelName,
    dimensions: { length: metadata['hull']['length'], beam: metadata['hull']['beam'], height: metadata['hull']['height'] },
    maxHeight: metadata['maxHeight'] };
}
