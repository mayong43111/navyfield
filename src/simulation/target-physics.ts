import type { NavigationState, Point, ShellType } from '../domain/battle.ts';
import type { TargetArmor, TargetRules, TargetShell, TargetShip, TargetWeapon } from '../domain/target-content.ts';

export const degrees = (radians: number): number => radians * 180 / Math.PI;
export const radians = (degrees: number): number => degrees * Math.PI / 180;
export const angleDelta = (a: number, b: number): number => ((a - b + Math.PI * 3) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
export function targetRange(weapon: TargetWeapon, rules: TargetRules): number {
  return weapon.kind === 'gun' ? weapon.muzzle_u_s ** 2 * Math.sin(radians(2 * weapon.max_elevation_deg)) / rules.gravity : weapon.range_u;
}
export interface TargetTrajectory { velocity: Point; flight: number; elevation: number }
export function targetTrajectory(from: Point, to: Point, speed: number, gravity: number,
  maximumElevation: number): TargetTrajectory | null {
  const x = to.x - from.x, z = to.z - from.z, y = to.y - from.y, distance = Math.hypot(x, z);
  if (distance < 1e-8 || speed <= 0) return null;
  const discriminant = speed ** 4 - gravity * (gravity * distance ** 2 + 2 * y * speed ** 2);
  if (discriminant < 0) return null;
  const elevation = Math.atan((speed ** 2 - Math.sqrt(discriminant)) / (gravity * distance));
  if (elevation < -Math.PI / 2 || elevation > radians(maximumElevation) + 1e-9) return null;
  const horizontal = speed * Math.cos(elevation);
  return { velocity: { x: x / distance * horizontal, y: speed * Math.sin(elevation), z: z / distance * horizontal },
    flight: distance / horizontal, elevation };
}
export function targetIntercept(from: Point, target: Point, motion: Point, speed: number,
  gravity: number, maxElevation: number): TargetTrajectory | null {
  const equation = (t: number): number => (target.x - from.x + motion.x * t) ** 2 +
    (target.z - from.z + motion.z * t) ** 2 + (target.y - from.y + motion.y * t + gravity * t * t / 2) ** 2 - speed * speed * t * t;
  const limit = 2 * speed / gravity, scans = 256;
  let previous = 1e-6, old = equation(previous);
  for (let index = 1; index <= scans; index++) {
    const t = limit * index / scans, value = equation(t);
    if (old >= 0 && value <= 0) {
      let low = previous, high = t;
      for (let i = 0; i < 48; i++) { const mid = (low + high) / 2; if (equation(mid) > 0) low = mid; else high = mid; }
      const flight = (low + high) / 2;
      const velocity = { x: (target.x - from.x + motion.x * flight) / flight,
        y: (target.y - from.y + motion.y * flight + gravity * flight * flight / 2) / flight,
        z: (target.z - from.z + motion.z * flight) / flight };
      const elevation = Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z));
      return elevation <= radians(maxElevation) + 1e-9 ? { velocity, flight, elevation } : null;
    }
    previous = t; old = value;
  }
  return null;
}
export function targetDispersion(from: Point, target: Point, weapon: TargetWeapon, random: () => number): Point {
  const dx = target.x - from.x, dz = target.z - from.z, distance = Math.hypot(dx, dz), radius = Math.sqrt(random()), angle = random() * Math.PI * 2;
  const along = radius * Math.cos(angle) * (weapon.dispersion_long_base_u + distance * weapon.dispersion_long_ratio);
  const cross = radius * Math.sin(angle) * (weapon.dispersion_cross_base_u + distance * weapon.dispersion_cross_ratio);
  return { x: target.x + dx / distance * along - dz / distance * cross, y: target.y,
    z: target.z + dz / distance * along + dx / distance * cross };
}
export function targetDamage(weapon: TargetWeapon, shell: TargetShell, armor: TargetArmor,
  distance: number, obliquity: number, rules: TargetRules): { damage: number; zone: 'belt' | 'deck'; outcome: string } {
  const angle = degrees(0.5 * Math.asin(Math.min(1, distance * rules.gravity / weapon.muzzle_u_s ** 2)));
  const zone = angle >= rules.deck_threshold_deg ? 'deck' : 'belt';
  const thickness = armor[`${zone}_mm`], normalAngle = zone === 'deck' ? 90 - angle : obliquity;
  let fraction = 1, outcome = 'penetration';
  if (shell.id === 'HE') { fraction = Math.max(rules.he_min_fraction, 1 / (1 + thickness / armor.he_resistance_mm)); outcome = 'blast'; }
  else if (normalAngle >= shell.ricochet_deg) { fraction = shell.nonpenetration_fraction; outcome = 'ricochet'; }
  else {
    const penetration = weapon.penetration_mm * shell.penetration_multiplier *
      (1 - rules.penetration_range_loss * distance / targetRange(weapon, rules));
    if (thickness / Math.max(0.01, Math.cos(radians(normalAngle))) > penetration) { fraction = shell.nonpenetration_fraction; outcome = 'blocked'; }
    else if (thickness < rules.overpenetration_armor_ratio * weapon.penetration_mm * shell.penetration_multiplier) {
      fraction = shell.overpenetration_fraction; outcome = 'overpenetration';
    }
  }
  return { damage: Math.floor(weapon.damage * shell.damage_multiplier * fraction + 0.5), zone, outcome };
}
export function targetNavigation(state: NavigationState, ship: TargetShip, throttle: number, rudder: number,
  dt: number, width: number, height: number): void {
  state.throttle = Math.max(-0.3, Math.min(1, throttle));
  const target = state.throttle * ship.speed_u_s;
  state.speed += Math.sign(target - state.speed) * Math.min(Math.abs(target - state.speed), ship.acceleration_u_s2 * dt);
  state.heading += rudder * Math.abs(state.speed) / ship.turn_radius_u * dt;
  state.x = Math.max(-width / 2 + ship.length_u / 2, Math.min(width / 2 - ship.length_u / 2, state.x + Math.sin(state.heading) * state.speed * dt));
  state.z = Math.max(-height / 2 + ship.length_u / 2, Math.min(height / 2 - ship.length_u / 2, state.z + Math.cos(state.heading) * state.speed * dt));
}
export function shellAllowed(policy: string, type: ShellType): boolean { return policy === 'AP_HE' || type === 'HE'; }
