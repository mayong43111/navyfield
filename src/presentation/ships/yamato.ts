import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { context2d } from '../../ui/legacy-helpers.ts';
import { loadCompressedResource } from '../../adapters/content/resource-loader.ts';
import type { VisualWeaponGroup } from './weapon-rig.ts';

export interface Turret {
  group: THREE.Object3D;
  elevation: THREE.Object3D;
  barrels: readonly THREE.Object3D[];
  muzzles: readonly THREE.Object3D[];
  rear: boolean;
  recoil: number;
}

export interface ShipInstance {
  ship: THREE.Object3D;
  turrets: Turret[];
  funnel: THREE.Object3D;
  modelKey: string;
  modelName: string;
  dimensions: { length: number; beam: number; height: number };
  maxHeight: number;
  auxiliaryGroups?: VisualWeaponGroup[];
  aircraftLaunch?: THREE.Object3D | undefined;
  aircraftRecovery?: THREE.Object3D | undefined;
}

export function turretMuzzle(turret: Turret): THREE.Vector3 {
  if (!turret.muzzles.length) throw new Error('舰炮缺少炮口');
  return turret.muzzles.reduce((center, muzzle) =>
    center.add(muzzle.getWorldPosition(new THREE.Vector3())), new THREE.Vector3()).divideScalar(turret.muzzles.length);
}

function node(root: THREE.Object3D, name: string): THREE.Object3D {
  const result = root.getObjectByName(name);
  if (!result) throw new Error(`Missing imported Yamato node: ${name}`);
  return result;
}

export async function loadYamato(): Promise<THREE.Group> {
  const url = new URL('../../../content/assets/ships/yamato/yamato.glb.gz.bin', import.meta.url);
  const model = await new GLTFLoader().parseAsync(await loadCompressedResource(url), '');
  return model.scene;
}

export function createYamato(model: THREE.Object3D): ShipInstance {
  const ship = node(model, 'Yamato').clone(true);
  const turrets = [0, 1, 2].map((index): Turret => {
    const group = node(ship, `Turret-${index}`);
    const elevation = node(ship, `Elevation-${index}`);
    const barrels: Turret['barrels'] = [
      node(ship, `Barrel-${index}-0`),
      node(ship, `Barrel-${index}-1`),
      node(ship, `Barrel-${index}-2`)
    ];
    const muzzles: Turret['muzzles'] = [
      node(ship, `Muzzle-${index}-0`),
      node(ship, `Muzzle-${index}-1`),
      node(ship, `Muzzle-${index}-2`)
    ];
    if (group.parent !== ship || elevation.parent !== group
      || barrels.some((barrel, barrelIndex) => barrel.parent !== elevation || muzzles[barrelIndex]?.parent !== barrel)) {
      throw new Error(`Invalid imported Yamato turret hierarchy: ${index}`);
    }
    // glTF quaternions can decode a rear-facing yaw as Euler X/Z rotations of PI.
    group.rotation.set(0, index === 2 ? Math.PI : 0, 0);
    elevation.rotation.set(0, 0, 0);
    return { group, elevation, barrels, muzzles, rear: index === 2, recoil: 0 };
  });
  return { ship, turrets, funnel: node(ship, 'FunnelSmoke'), modelKey: 'yamato', modelName: '大和',
    dimensions: { length: 263, beam: 38, height: 16 }, maxHeight: new THREE.Box3().setFromObject(ship).max.y };
}

export function renderYamatoPreview(renderer: THREE.WebGLRenderer, model: THREE.Object3D): HTMLCanvasElement {
  return renderShipPreview(renderer, createYamato(model).ship);
}

export function renderShipPreview(renderer: THREE.WebGLRenderer, vessel: THREE.Object3D): HTMLCanvasElement {
  const width = 320, height = 128;
  const preview = new THREE.Scene();
  const ship = vessel.clone(true);
  ship.rotation.set(0, Math.PI / 2, 0);
  preview.add(ship, new THREE.HemisphereLight('#dce4e1', '#33434a', 1.7));
  const light = new THREE.DirectionalLight('#fff0d1', 2.7);
  light.position.set(-250, 380, 150);
  preview.add(light);
  const box = new THREE.Box3().setFromObject(ship);
  box.min.y = Math.max(0, box.min.y);
  const center = box.getCenter(new THREE.Vector3());
  const camera = new THREE.OrthographicCamera(-200, 200, 80, -80, 1, 5000);
  camera.position.copy(center).add(new THREE.Vector3(775, 900, 1040));
  camera.lookAt(center);
  camera.updateMatrixWorld();
  const projected = new THREE.Box3();
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        projected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
      }
    }
  }
  const halfHeight = Math.max(Math.abs(projected.min.y), Math.abs(projected.max.y),
    Math.abs(projected.min.x) * height / width, Math.abs(projected.max.x) * height / width) * 1.08;
  camera.top = halfHeight; camera.bottom = -halfHeight;
  camera.left = -halfHeight * width / height; camera.right = halfHeight * width / height;
  camera.updateProjectionMatrix();
  const target = new THREE.WebGLRenderTarget(width, height);
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const saved = {
    target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()),
    alpha: renderer.getClearAlpha(), viewport: renderer.getViewport(new THREE.Vector4()),
    scissor: renderer.getScissor(new THREE.Vector4()), scissorTest: renderer.getScissorTest(),
    clipping: renderer.clippingPlanes, shadows: renderer.shadowMap.enabled, autoClear: renderer.autoClear
  };
  const pixels = new Uint8Array(width * height * 4);
  try {
    renderer.setRenderTarget(target);
    renderer.setScissorTest(false);
    renderer.setClearColor('#000000', 0);
    renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];
    renderer.shadowMap.enabled = false;
    renderer.autoClear = true;
    renderer.render(preview, camera);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  } finally {
    renderer.setRenderTarget(saved.target);
    renderer.setClearColor(saved.color, saved.alpha);
    renderer.setViewport(saved.viewport);
    renderer.setScissor(saved.scissor);
    renderer.setScissorTest(saved.scissorTest);
    renderer.clippingPlanes = saved.clipping;
    renderer.shadowMap.enabled = saved.shadows;
    renderer.autoClear = saved.autoClear;
    target.dispose();
  }
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = context2d(canvas);
  const image = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    image.data.set(pixels.subarray((height - y - 1) * width * 4, (height - y) * width * 4), y * width * 4);
  }
  ctx.putImageData(image, 0, 0);
  let left = width, top = height, right = -1, bottom = -1;
  for (let index = 3; index < image.data.length; index += 4) {
    if (!image.data[index]) continue;
    const x = (index - 3) / 4 % width, y = Math.floor((index - 3) / 4 / width);
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left || bottom < top) throw new Error('真实舰船预览为空，无法显示编队。');
  const cropped = document.createElement('canvas');
  cropped.width = right - left + 9; cropped.height = bottom - top + 9;
  context2d(cropped).drawImage(canvas, left, top, right - left + 1, bottom - top + 1,
    4, 4, right - left + 1, bottom - top + 1);
  return cropped;
}
