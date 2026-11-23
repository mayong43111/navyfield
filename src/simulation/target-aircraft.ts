import type { NavigationState, Point, Side } from '../domain/battle.ts';
import type { AircraftState, TargetContent } from '../domain/target-content.ts';

export interface TargetAircraftAction {
  plane: AircraftState; kind: 'drop' | 'recover'; fraction: number; position: Point;
}

// Releases and recovery are scheduled, not immediately committed: an earlier
// projectile arrival in this same fixed step must still be able to shoot down a plane.
export function moveTargetAircraft(content: TargetContent, aircraft: AircraftState[],
  navigation: (side: Side) => NavigationState, beam: (side: Side) => number, dt: number): TargetAircraftAction[] {
  const actions: TargetAircraftAction[] = [];
  for (const plane of aircraft) {
    if (plane.hp <= 0) continue;
    const outbound = plane.phase === 'outbound', nav = navigation(outbound ? plane.target : plane.owner);
    const weapon = content.weapons[plane.weaponId]!, fall = Math.sqrt(2 * plane.position.y / content.rules.gravity);
    const aim = { x: nav.x + (outbound ? Math.sin(nav.heading) * nav.speed * fall : 0),
      z: nav.z + (outbound ? Math.cos(nav.heading) * nav.speed * fall : 0) };
    const dx = aim.x - plane.position.x, dz = aim.z - plane.position.z, distance = Math.hypot(dx, dz);
    const before = { ...plane.position }, travel = weapon.travel_u_s * dt;
    plane.velocity = { x: dx / Math.max(distance, 1e-9) * weapon.travel_u_s, y: 0,
      z: dz / Math.max(distance, 1e-9) * weapon.travel_u_s };
    plane.position.x += plane.velocity.x * dt; plane.position.z += plane.velocity.z * dt;
    const threshold = outbound ? weapon.travel_u_s * fall : beam(plane.owner);
    if (distance <= threshold + travel && (!outbound || !plane.dropped)) {
      const fraction = Math.max(0, Math.min(1, (distance - threshold) / travel));
      actions.push({ plane, kind: outbound ? 'drop' : 'recover', fraction,
        position: { x: before.x + (plane.position.x - before.x) * fraction, y: before.y,
          z: before.z + (plane.position.z - before.z) * fraction } });
    }
  }
  return actions;
}
