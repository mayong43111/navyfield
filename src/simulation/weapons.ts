import type { DeepReadonly, WeaponDefinition, WeaponState, NavigationState, Point } from '../domain/battle.ts';
import { turretCanAim, wrapAngle, lowArcElevation } from './navigation.ts';
import { ballisticVelocity } from './combat.ts';

export function localPoint(pose: NavigationState, point: Point): Point {
  const dx = point.x - pose.x, dz = point.z - pose.z;
  return { x: dx * Math.cos(pose.heading) - dz * Math.sin(pose.heading), y: point.y,
    z: dx * Math.sin(pose.heading) + dz * Math.cos(pose.heading) };
}

export function worldPoint(pose: NavigationState, point: Point): Point {
  return { x: pose.x + point.x * Math.cos(pose.heading) + point.z * Math.sin(pose.heading),
    y: point.y, z: pose.z - point.x * Math.sin(pose.heading) + point.z * Math.cos(pose.heading) };
}

export function muzzlePoints(pose: NavigationState, definition: DeepReadonly<WeaponDefinition>,
  state: WeaponState): Point[] {
  return definition.muzzles.map(point => {
    const x = point.x + definition.pivot.x;
    const y = point.y * Math.cos(state.elevation) + point.z * Math.sin(state.elevation) + definition.pivot.y;
    const z = point.z * Math.cos(state.elevation) - point.y * Math.sin(state.elevation) + definition.pivot.z;
    return worldPoint(pose, {
      x: definition.mount.x + x * Math.cos(state.yaw) + z * Math.sin(state.yaw),
      y: definition.mount.y + y,
      z: definition.mount.z - x * Math.sin(state.yaw) + z * Math.cos(state.yaw)
    });
  });
}

export function muzzleCenter(pose: NavigationState, definition: DeepReadonly<WeaponDefinition>,
  state: WeaponState): Point {
  const points = muzzlePoints(pose, definition, state);
  return { x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
    z: points.reduce((sum, p) => sum + p.z, 0) / points.length };
}

export function aimWeapon(pose: NavigationState, definition: DeepReadonly<WeaponDefinition>,
  state: WeaponState, target: Point, dt: number, accelerated: boolean): void {
  const local = localPoint(pose, target);
  const desired = Math.atan2(local.x - definition.mount.x, local.z - definition.mount.z);
  const canAim = turretCanAim(desired, definition.rear);
  if (canAim) {
    const step = dt * (accelerated ? 2.1 : 0.7);
    state.yaw += Math.max(-step, Math.min(step, wrapAngle(desired - state.yaw)));
    const pivot = worldPoint(pose, { x: definition.mount.x, y: definition.mount.y + definition.pivot.y,
      z: definition.mount.z });
    const elevation = definition.ballistics
      ? lowArcElevation(Math.hypot(target.x - pivot.x, target.z - pivot.z), pivot.y - target.y,
        definition.ballistics.speed) : null;
    if (elevation !== null) state.elevation = elevation;
  }
  const muzzle = muzzleCenter(pose, definition, state);
  const velocity = definition.ballistics ? ballisticVelocity(muzzle, target, definition.ballistics.speed) : null;
  const reachable = velocity && definition.ballistics &&
    Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z)) <= definition.ballistics.maxAngle;
  state.aimState = !canAim || !reachable ? 'limited' :
    Math.abs(wrapAngle(desired - state.yaw)) > 0.08 ? 'turning' : 'aligned';
}
