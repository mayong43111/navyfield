import * as THREE from 'three';
import type { ShipInstance } from './yamato.ts';
import type { ShipModelId } from '../../domain/battle.ts';

/** An explicit collision-volume marker, not a substitute historical ship model. */
export function createMissingModel(id: string, name: string, length: number, beam: number): ShipInstance {
  const ship = new THREE.Group();
  const height = Math.max(6, beam * 0.4);
  const box = new THREE.Mesh(new THREE.BoxGeometry(beam, height, length),
    new THREE.MeshBasicMaterial({ color: '#e0a84c', wireframe: true }));
  box.position.y = height / 2; ship.add(box);
  const funnel = new THREE.Object3D(); funnel.position.y = height; ship.add(funnel);
  return { ship, turrets: [], funnel, modelKey: `missing:${id}` as ShipModelId,
    modelName: `${name} · 模型缺失（定位框，非真实舰外形）`,
    dimensions: { length, beam, height }, maxHeight: height };
}
