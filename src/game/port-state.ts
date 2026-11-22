import type { ShipDefinitionId, ShipId } from '../domain/battle.ts';
import type { OwnedShip } from '../domain/port.ts';
export type { OwnedShip } from '../domain/port.ts';
import { createAmmunition } from '../simulation/ammunition.ts';

export function createOwnedShip(id: string, name: string, typeId: string, weapons: readonly (string | null)[]): OwnedShip {
  if (!id || !name || !typeId) throw new Error('港口舰艇标识缺失');
  return { id: id as ShipId, typeId: typeId as ShipDefinitionId, name, weapons: [...weapons],
    guns: weapons.map(() => ({ ammunition: createAmmunition(), reload: 0 })), bulgeLevel: 1, mount: 0 };
}

export function refitHull(ship: OwnedShip, typeId: string, name: string, weapons: readonly (string | null)[]): void {
  const replacement = createOwnedShip(ship.id, name, typeId, weapons);
  Object.assign(ship, replacement, { bulgeLevel: ship.bulgeLevel });
}
