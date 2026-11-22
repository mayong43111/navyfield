import { RELOAD_SECONDS } from './navigation.ts';

import type { Ammunition, ShellType, GunState } from '../domain/battle.ts';
export type { Locker, ShellType, Ammunition, GunState } from '../domain/battle.ts';
export type FiringSide = 'front' | 'both' | 'rear';

export interface Magazine {
  shellType: ShellType;
  remaining: number;
}

export function createAmmunition(): Ammunition {
  return {
    selected: 'A',
    lockers: { A: { shellType: 'HE', remaining: 60 }, B: { shellType: 'AP', remaining: 60 } }
  };
}

export function takeAmmunition(ammunition: Ammunition, count: number): ShellType | null {
  if (!Number.isInteger(count) || count <= 0) throw new RangeError('Shell count must be a positive integer');
  const magazine = ammunition.lockers[ammunition.selected];
  if (magazine.remaining < count) return null;
  magazine.remaining -= count;
  return magazine.shellType;
}

export function includesWeapon(side: FiringSide, rear: boolean): boolean {
  return side === 'both' || (side === 'rear') === rear;
}

export function fireGun(gun: GunState, count: number, reloadSeconds = RELOAD_SECONDS):
  { fired: true; shellType: ShellType } | { fired: false; reason: 'loading' | 'empty' } {
  if (!Number.isFinite(reloadSeconds) || reloadSeconds <= 0) throw new RangeError('Reload time must be positive and finite');
  if (gun.reload > 0) return { fired: false, reason: 'loading' };
  const shellType = takeAmmunition(gun.ammunition, count);
  if (shellType === null) return { fired: false, reason: 'empty' };
  gun.reload = reloadSeconds;
  return { fired: true, shellType };
}
