import * as THREE from 'three';
import type { Observation, Side } from '../../domain/battle.ts';

export interface VisualWeaponGroup {
  slot: string;
  bankId: string | null;
  weaponId: string;
  control: 'manual' | 'automatic';
  bearing: number;
  mounts: { group: THREE.Object3D; pivot: THREE.Object3D; barrels: THREE.Object3D[];
    muzzles: THREE.Object3D[]; baseYaw: number }[];
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function named(root: THREE.Object3D, name: unknown): THREE.Object3D {
  const result = typeof name === 'string' ? root.getObjectByName(name) : undefined;
  if (!result) throw new Error(`辅助武器节点无效：${String(name)}`);
  return result;
}
function nodes(root: THREE.Object3D, names: unknown): THREE.Object3D[] {
  if (!Array.isArray(names)) throw new Error('辅助武器节点列表无效');
  return names.map(name => named(root, name));
}

export function bindVisualWeaponGroups(ship: THREE.Object3D): VisualWeaponGroup[] {
  const metadata: unknown = ship.userData['visualWeaponGroups'];
  if (metadata === undefined) return [];
  if (!Array.isArray(metadata)) throw new Error('辅助武器元数据无效');
  return metadata.filter(entry => record(entry) && entry['slot'] !== 'main').map(entry => {
    if (!record(entry) || typeof entry['slot'] !== 'string' || typeof entry['weaponId'] !== 'string' ||
      !['manual', 'automatic'].includes(String(entry['control'])) || !Array.isArray(entry['mounts'])) {
      throw new Error('辅助武器控制合同无效');
    }
    const mounts = entry['mounts'].map(value => {
      if (!record(value) || typeof value['baseYaw'] !== 'number' || !Number.isFinite(value['baseYaw'])) {
        throw new Error('辅助武器炮座参数无效');
      }
      const group = named(ship, value['loadedNode']), pivot = named(ship, value['loadedPivot']);
      const barrels = nodes(ship, value['loadedBarrelNodes']), muzzles = nodes(ship, value['loadedMuzzleNames']);
      if (pivot.parent !== group || barrels.length !== muzzles.length || barrels.length === 0 ||
        barrels.some((barrel, i) => barrel.parent !== pivot || muzzles[i]?.parent !== barrel)) {
        throw new Error('辅助武器层级无效');
      }
      group.rotation.y = value['baseYaw'];
      return { group, pivot, barrels, muzzles, baseYaw: value['baseYaw'] };
    });
    const bearing = entry['bearingDeg'] ?? 0;
    if (typeof bearing !== 'number' || !Number.isFinite(bearing)) throw new Error('自动炮组方位无效');
    return { slot: entry['slot'], bankId: typeof entry['bankId'] === 'string' ? entry['bankId'] : null,
      weaponId: entry['weaponId'], control: entry['control'] as 'manual' | 'automatic',
      bearing: THREE.MathUtils.degToRad(bearing), mounts };
  });
}

export function updateVisualWeaponGroups(rigs: readonly VisualWeaponGroup[], side: Side, observation: Observation): void {
  const ship = observation.ships.find(state => state.side === side);
  if (!ship) return;
  for (const rig of rigs) {
    const state = observation.target?.groups.find(group => group.side === side && group.weaponId === rig.weaponId &&
      (rig.bankId ? group.id === `${side}-${rig.bankId}` : group.slot === rig.slot && group.control === rig.control));
    const target = state?.targetId ? observation.aircraft?.find(plane => plane.id === state.targetId)?.position ??
      observation.ships.find(other => other.id === state.targetId)?.navigation : undefined;
    const manualTarget = side === 'player' ? observation.aim : observation.ships.find(other => other.side === 'player')?.navigation;
    for (const mount of rig.mounts) {
      mount.group.userData['enabled'] = state?.enabled ?? false;
      mount.group.rotation.y = state?.enabled ? rig.control === 'automatic' ? rig.bearing + state.yaw :
        manualTarget ? Math.atan2(manualTarget.x - ship.navigation.x, manualTarget.z - ship.navigation.z) - ship.navigation.heading : mount.baseYaw : mount.baseYaw;
      const height = target && 'y' in target ? target.y : 0;
      mount.pivot.rotation.x = state?.enabled && state.mode === 'air' && target ?
        -Math.atan2(height - mount.group.position.y, Math.hypot(target.x - ship.navigation.x, target.z - ship.navigation.z)) : 0;
    }
  }
}
