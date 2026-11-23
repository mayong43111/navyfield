import type { Ammunition, ShellType, Side, WeaponDefinition, WeaponId } from '../domain/battle.ts';
import type { TargetContent, TargetShip } from '../domain/target-content.ts';

// A numeric compatibility view for existing presentation. All physical resources remain
// in target groups; these hull-derived points are not fetched from visual model nodes.
export function createTargetGunDefinitions(content: TargetContent, ship: TargetShip, side: Side,
  installed: readonly boolean[], shellType: ShellType): WeaponDefinition[] {
  const weapon = content.weapons[ship.main_weapon_id]!;
  if (weapon.kind !== 'gun') return [];
  return Array.from({ length: ship.main_mounts }, (_, mount) => {
    const ammunition: Ammunition = { selected: 'A', lockers: {
      A: { shellType, remaining: weapon.ammo_per_barrel }, B: { shellType, remaining: 0 } } };
    return { id: `${side}-main-${mount}` as WeaponId, rear: mount >= Math.ceil(ship.main_mounts / 2),
      mount: { x: 0, y: ship.beam_u, z: ship.length_u * (0.5 - (mount + 1) / (ship.main_mounts + 1)) },
      pivot: { x: 0, y: 0, z: 0 },
      muzzles: Array.from({ length: ship.main_barrels }, (_, barrel) => ({ x: barrel - (ship.main_barrels - 1) / 2, y: 0, z: 0 })),
      reloadSeconds: weapon.reload_s, ballistics: { speed: weapon.muzzle_u_s,
        maxAngle: weapon.max_elevation_deg * Math.PI / 180 }, power: { he: weapon.damage, apBonus: 0 },
      installed: installed[mount] ?? false, ammunition };
  });
}
