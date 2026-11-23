import type { OriginalData } from '../../original-data.ts';
import type { TargetContent } from '../../domain/target-content.ts';
import { loadJsonResource } from './resource-loader.ts';

const dataUrl = new URL('../../../content/data/ships/target.json', import.meta.url).href;
export { parseTargetContent } from '../../domain/target-content.ts';
import { parseTargetContent } from '../../domain/target-content.ts';

export async function loadTargetContent(): Promise<TargetContent> {
  return parseTargetContent(await loadJsonResource(dataUrl));
}

// Nation IDs are the existing OriginalData contract: USA=1, Japan=3, Germany=4.
const nations: Record<string, number> = { scout_dd: 3, escort_dd: 1, fast_cl: 1, support_cl: 1,
  heavy_ca: 4, california: 1, bismarck: 4, yamato: 3, torpedo_dd: 3, torpedo_ca: 3, yorktown: 1, light_cv: 1 };
export function createTargetOriginalData(content: TargetContent): OriginalData {
  const ships = Object.values(content.ships).map(ship => ({ id: ship.id, name: ship.name,
    originalName: ship.name, nation: nations[ship.id]!, shipClass: ship.class, source: ship.source,
    available: true, raw: { ShipDurabillity: String(ship.hp), ShipLevel: String(ship.phase),
      ShipName2: ship.name, ShipType: `(${ship.class})`, ShipRMount: Array(ship.main_mounts).fill(ship.main_barrels).join('/'),
      targetMainWeaponId: ship.main_weapon_id, targetClass: ship.class }, durability: ship.hp,
    level: ship.phase, standardDisplacement: null, maximumDisplacement: null,
    rMounts: Array.from({ length: ship.main_mounts }, () => ship.main_barrels) }));
  const guns = Object.values(content.weapons).map(weapon => {
    const mounts = new Set(Object.values(content.ships).filter(s => s.main_weapon_id === weapon.id).map(s => s.main_barrels));
    return { id: weapon.id, nation: 0, mountGroup: String([...mounts][0] ?? 1).padStart(2, '0'),
      shellKey: weapon.id, source: weapon.source, reloadSeconds: weapon.reload_s,
      raw: { name: weapon.name, reloadSeconds: String(weapon.reload_s), space: String([...mounts][0] ?? 1),
        targetKind: weapon.kind, damage: String(weapon.damage), muzzle_u_s: String(weapon.muzzle_u_s),
        range_u: String(weapon.range_u), penetration_mm: String(weapon.penetration_mm),
        ammo_per_barrel: String(weapon.ammo_per_barrel) } };
  });
  return { ships, guns, armor: [], shells: [], capturedAt: '', version: content.rulesVersion, failureCount: 0 };
}
