import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function createShipyard(surface: THREE.Texture): THREE.Group {
  const yard = new THREE.Group();
  yard.name = 'Shipyard';
  const concrete = new THREE.MeshStandardMaterial({ color: '#e2e4e3', map: surface, roughness: 1 });
  const basin = new THREE.MeshStandardMaterial({ color: '#525853', map: surface, roughness: 1 });
  const wall = new THREE.MeshStandardMaterial({ color: '#9b9787', roughness: 1 });
  const steel = new THREE.MeshStandardMaterial({ color: '#414e50', roughness: 0.8 });
  const roof = new THREE.MeshStandardMaterial({ color: '#657170', roughness: 0.9 });
  const timber = new THREE.MeshStandardMaterial({ color: '#867459', roughness: 1 });
  const paint = new THREE.MeshStandardMaterial({ color: '#d0cab0', roughness: 1 });
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();

  function box(x: number, y: number, z: number, width: number, height: number, length: number,
    material: THREE.Material, yaw = 0, roll = 0): void {
    const geometry = new THREE.BoxGeometry(width, height, length);
    geometry.rotateZ(roll);
    geometry.rotateY(yaw);
    geometry.translate(x, y, z);
    if (material === concrete || material === basin) {
      const positions = geometry.getAttribute('position');
      const uv = geometry.getAttribute('uv');
      for (let index = 0; index < positions.count; index++) {
        uv.setXY(index, positions.getX(index) / 25, positions.getZ(index) / 25);
      }
    }
    const parts = batches.get(material);
    if (parts) parts.push(geometry);
    else batches.set(material, [geometry]);
  }

  // Four quays leave an actual open berth rather than a slab intersecting the hull.
  for (const side of [-1, 1]) {
    box(side * 642, -8, 0, 1200, 12, 2400, concrete);
    box(0, -8, side * 790, 84, 12, 1200, concrete);
    box(side * 41, -7, 0, 2, 10, 380, wall);
  }
  box(0, -12.4, 0, 80, 1.2, 380, basin);
  for (const end of [-1, 1]) box(0, -7, end * 190, 84, 10, 3, wall);
  for (let z = -110; z <= 110; z += 20) box(0, -11.3, z, 10, 1.1, 3, timber);

  for (const side of [-1, 1]) {
    for (const x of [63, 68, 210, 215]) box(side * x, -1.9, 0, 0.5, 0.2, 660, steel);
    for (let z = -320; z <= 320; z += 8) {
      for (const x of [65.5, 212.5]) box(side * x, -1.94, z, 8, 0.12, 0.65, timber);
    }
    for (let z = -170; z <= 170; z += 22) {
      box(side * 45, -0.6, z, 1.4, 2.8, 1.4, steel);
      box(side * 45, 0.5, z, 3, 0.5, 1.4, steel);
      box(side * 49, -1.85, z, 0.3, 0.15, 12, paint);
    }
    for (let z = -270; z <= 270; z += 60) {
      box(side * 112, -1.86, z, 0.35, 0.15, 24, paint);
    }
    for (const [index, z] of [-280, -170, -45, 85, 230, 350].entries()) {
      const x = side * (125 + index % 3 * 20);
      const width = 34 + index % 2 * 12;
      const length = 24 + index % 3 * 8;
      box(x, 5, z, width, 14, length, wall);
      for (const slope of [-1, 1]) {
        box(x + slope * width / 4, 14, z, width / 2 + 3, 1.4, length + 4, roof, 0, -slope * 0.22);
      }
      box(x, 4, z + length / 2 + 0.2, width * 0.7, 2.2, 0.5, steel);
      box(x, 1, z + length / 2 + 0.4, 7, 6, 0.6, steel);
      box(x + side * 12, 19, z - 6, 3, 12, 3, wall);
      for (let crate = 0; crate < 4; crate++) {
        box(side * (85 + crate % 2 * 8), 0.5 + Math.floor(crate / 2) * 3, z + crate * 8, 7, 5, 6, timber);
      }
      box(side * 155, -0.7, z + 40, 7, 2.6, 15, roof);
      for (const axle of [-4, 4]) box(side * 155, -1.3, z + 40 + axle, 8, 1.6, 1.6, steel);
    }
    for (const z of [-148, 145]) {
      const x = side * 80;
      box(x, -0.5, z, 22, 3, 14, steel);
      for (const leg of [-1, 1]) box(x + leg * 8, 17, z, 2.5, 36, 3, roof);
      box(x, 35, z, 20, 3, 8, steel);
      box(x - side * 8, 32, z, 10, 8, 9, wall);
      box(x - side * 24, 41, z, 54, 2, 3, roof);
      box(x - side * 24, 43.5, z, 54, 0.7, 0.7, steel);
      for (let strut = 0; strut < 6; strut++) {
        box(x - side * (strut * 8), 42, z, 0.8, 4, 0.8, steel);
      }
      box(x - side * 48, 32, z, 0.35, 18, 0.35, steel);
      box(x - side * 48, 22.5, z, 2, 1, 2, steel);
    }
  }
  for (const [material, parts] of batches) {
    const geometry = mergeGeometries(parts);
    if (!geometry) throw new Error('Cannot assemble shipyard scenery geometry');
    parts.forEach(part => part.dispose());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = material !== concrete && material !== basin;
    mesh.receiveShadow = true;
    yard.add(mesh);
  }
  return yard;
}
