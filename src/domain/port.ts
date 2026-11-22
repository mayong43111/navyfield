import type { DeepReadonly, GunState, Locker, ShellType, ShipId, ShipDefinitionId, ShipModelId } from './battle.ts';

export interface OwnedShip {
  id: ShipId; typeId: ShipDefinitionId; name: string;
  weapons: (string | null)[]; guns: GunState[]; bulgeLevel: number; mount: number;
}

export interface VesselVisualContract {
  modelKey: ShipModelId;
  modelName: string;
  dimensions: { length: number; beam: number; height: number };
  mounts: { rear: boolean; barrelCount: number }[];
}
export type PortObservation = DeepReadonly<{ ships: OwnedShip[]; activeIndex: number; active: OwnedShip }>;
export type PortCommand =
  | { type: 'select-berth'; index: number }
  | { type: 'select-weapon'; index: number }
  | { type: 'bulge'; level: number }
  | { type: 'equip-hull'; typeId: string }
  | { type: 'equip-gun'; gunId: string }
  | { type: 'locker'; weapon: number; locker: Locker }
  | { type: 'shell-type'; weapon: number; locker: Locker; shellType: ShellType }
  | { type: 'reset-ammunition' };
export interface PortContent {
  refit(typeId: string, previous: readonly (string | null)[]): { name: string; weapons: (string | null)[] };
  validateGun(typeId: string, mount: number, gunId: string): void;
}
export type PortInventory = readonly DeepReadonly<GunState>[];
