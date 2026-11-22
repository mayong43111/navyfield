import { findOriginalShip, originalNumber } from '../../original-data.ts';
import type { OriginalData, OriginalGun, OriginalShip } from '../../original-data.ts';

function compatible(gun: OriginalGun | undefined, vessel: OriginalShip, mount: number, tubes: number): gun is OriginalGun {
  return gun !== undefined && gun.mountGroup === String(tubes).padStart(2, '0') &&
    (gun.nation === vessel.nation || gun.nation === 0) &&
    (originalNumber(gun.raw['space']) ?? Infinity) <= (vessel.rMounts[mount] ?? 0);
}

export function resolveHullWeapons(data: OriginalData, vessel: OriginalShip, barrelCounts: readonly number[],
  previous: readonly (string | null)[], modelKey: string): (string | null)[] {
  const defaults: Record<string, string> = { bismarck: 'nf-gun-4-393', california: 'nf-gun-1-42' };
  return barrelCounts.map((count, index) => {
    const old = data.guns.find(gun => gun.id === previous[index]);
    if (compatible(old, vessel, index, count)) return old.id;
    const preferred = data.guns.find(gun => gun.id === defaults[modelKey]);
    return compatible(preferred, vessel, index, count) ? preferred.id : null;
  });
}

export function validatePortGun(data: OriginalData, typeId: string, mount: number, tubes: number, gunId: string): void {
  if (!gunId) return;
  if (!compatible(data.guns.find(gun => gun.id === gunId), findOriginalShip(data, typeId), mount, tubes)) {
    throw new Error('该炮型不符合主炮位的国家或容量要求。');
  }
}
