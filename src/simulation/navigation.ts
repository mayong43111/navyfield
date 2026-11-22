export const MAX_SPEED = 14;
export const RELOAD_SECONDS = 3;
export const SHELL_SPEED = 200;
export const GRAVITY = 16;

import type { NavigationState, NavigationRoute } from '../domain/battle.ts';
export type { NavigationState, NavigationRoute } from '../domain/battle.ts';

export function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function advanceNavigation(state: NavigationState, drive: number, rudder: number, dt: number): void {
  state.throttle = Math.max(-0.3, Math.min(1, state.throttle + drive * dt * 0.24));
  const desired = state.throttle * MAX_SPEED;
  state.speed += (desired - state.speed) * (1 - Math.exp(-dt * 0.32));
  state.heading = wrapAngle(state.heading + rudder * 0.085 * (state.speed / MAX_SPEED) * dt);
  state.x += Math.sin(state.heading) * state.speed * dt;
  state.z += Math.cos(state.heading) * state.speed * dt;
}

export function createRoute(state: NavigationState, target: { x: number; z: number }): NavigationRoute {
  if (![target.x, target.z].every(Number.isFinite)) throw new RangeError('航点无效');
  const radius = MAX_SPEED / 0.085;
  let best: NavigationRoute | null = null, bestLength = Infinity;
  for (const turn of [-1, 1]) {
    const centerX = state.x + turn * radius * Math.cos(state.heading);
    const centerZ = state.z - turn * radius * Math.sin(state.heading);
    const dx = target.x - centerX, dz = target.z - centerZ, distance = Math.hypot(dx, dz);
    if (distance < radius) continue;
    const bearing = Math.atan2(dx, dz), offset = Math.acos(radius / distance);
    for (const angle of [bearing - offset, bearing + offset]) {
      const tangentX = centerX + radius * Math.sin(angle), tangentZ = centerZ + radius * Math.cos(angle);
      const departure = Math.atan2(target.x - tangentX, target.z - tangentZ);
      if (Math.abs(wrapAngle(departure - angle - turn * Math.PI / 2)) > 1e-6) continue;
      const delta = turn * (angle - state.heading + turn * Math.PI / 2);
      let arc = ((delta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      if (Math.PI * 2 - arc < 1e-9) arc = 0;
      const length = radius * arc + Math.hypot(target.x - tangentX, target.z - tangentZ);
      if (length < bestLength) {
        bestLength = length;
        best = { target: { ...target }, turn, remainingArc: arc };
      }
    }
  }
  if (Math.hypot(target.x - state.x, target.z - state.z) <= 20) {
    return { target: { ...target }, turn: 0, remainingArc: 0 };
  }
  if (!best) throw new Error('无法规划舰船转向航线');
  return best;
}

export function advanceRoute(state: NavigationState, route: NavigationRoute, dt: number): boolean {
  const target = route.target;
  const dx = target.x - state.x, dz = target.z - state.z, distance = Math.hypot(dx, dz);
  if (distance <= 20) {
    state.throttle = state.speed = 0;
    return true;
  }
  if (route.remainingArc > 1e-9) {
    state.throttle = 0.8;
    const nextSpeed = state.speed + (state.throttle * MAX_SPEED - state.speed) * (1 - Math.exp(-dt * 0.32));
    const step = 0.085 * (nextSpeed / MAX_SPEED) * dt;
    const before = state.heading;
    advanceNavigation(state, 0, step > 0 ? route.turn * Math.min(1, route.remainingArc / step) : 0, dt);
    route.remainingArc = Math.max(0, route.remainingArc - Math.abs(wrapAngle(state.heading - before)));
    return false;
  }
  const turn = wrapAngle(Math.atan2(dx, dz) - state.heading);
  state.throttle = Math.min(0.8, distance * 0.1 / MAX_SPEED);
  advanceNavigation(state, 0, Math.max(-1, Math.min(1, turn * 3)), dt);
  return false;
}

export function turretCanAim(yaw: number, rear: boolean): boolean {
  const relative = wrapAngle(yaw - (rear ? Math.PI : 0));
  return Math.abs(relative) <= Math.PI * 0.72;
}

export function ballisticRange(height: number, maxAngle: number, speed = SHELL_SPEED): number {
  if (![height, maxAngle, speed].every(Number.isFinite) || height < 0 ||
    maxAngle <= 0 || maxAngle > Math.PI / 2 || speed <= 0) throw new RangeError('弹道参数无效');
  const angle = Math.min(maxAngle, Math.atan(speed / Math.sqrt(speed * speed + 2 * GRAVITY * height)));
  const vertical = speed * Math.sin(angle);
  return speed * Math.cos(angle) * (vertical + Math.sqrt(vertical * vertical + 2 * GRAVITY * height)) / GRAVITY;
}

export function lowArcElevation(distance: number, height: number, speed = SHELL_SPEED): number | null {
  if (![distance, height, speed].every(Number.isFinite) || speed <= 0) throw new RangeError('弹道参数无效');
  const v2 = speed * speed;
  const discriminant = v2 * v2 - GRAVITY * (GRAVITY * distance * distance - 2 * height * v2);
  if (discriminant < 0 || distance < 1) return null;
  return Math.atan((v2 - Math.sqrt(discriminant)) / (GRAVITY * distance));
}
