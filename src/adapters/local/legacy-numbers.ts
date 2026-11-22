import { originalNumber } from '../../original-data.ts';
import type { OriginalData, OriginalGun } from '../../original-data.ts';
import { SHELL_SPEED } from '../../simulation/navigation.ts';
import type { GunBallistics, ShellPower } from '../../simulation/combat.ts';

export function gunBallistics(gun: OriginalGun): GunBallistics | null {
  const muzzle = originalNumber(gun.raw['muzzleSpeed']), angle = originalNumber(gun.raw['maxAngle']);
  if (muzzle === null || angle === null) return null;
  if (muzzle <= 0 || angle <= 0 || angle > 90) throw new RangeError('舰炮弹道资料无效');
  return { speed: SHELL_SPEED * muzzle / 842, maxAngle: angle * Math.PI / 180 };
}

export function bulgeCapacity(data: OriginalData, nation: number, level: number): number | null {
  if (!Number.isInteger(level) || level < 0 || level > 10 || !Number.isInteger(nation) || nation < 0 || nation > 8) {
    throw new RangeError('防雷装甲配置无效');
  }
  if (level === 0) return 0;
  const codes = ['', 'USN', 'RN', 'IJN', 'KM', 'MN', 'USSR', 'RM', 'CN'];
  const table = data.armor.find(table => table.rows.some(row => row.includes('Armor') && row.includes('Bulge')));
  const header = table?.rows.find(row => row.includes('Bulge'));
  const row = table?.rows.find(row => nation === 0 ? row[0] === 'Standard Armor'
    : row[0]?.includes(`(${codes[nation]} Armor)`));
  if (!header || !row) return null;
  const coefficient = originalNumber(row[header.indexOf('Bulge')]);
  return coefficient === null ? null : Math.round(coefficient * level * 50);
}

export function shellPower(data: OriginalData, gun: OriginalGun): ShellPower | null {
  const table = data.shells.find(table => `${table.nation}-${table.calibre}` === gun.shellKey);
  if (!table) return null;
  const header = table.rows.find(row => row.includes('HE Damage') && row.includes('AP Bonus'));
  const he = table.rows.find(row => / HE Shell[ -]Normal$/.test(row[0] ?? ''));
  const ap = table.rows.find(row => / AP Shell$/.test(row[0] ?? ''));
  if (!header || !he || !ap) return null;
  const damage = originalNumber(he[header.indexOf('HE Damage')]);
  const bonus = originalNumber(ap[header.indexOf('AP Bonus')]);
  if (damage === null || bonus === null) return null;
  return { he: damage, apBonus: bonus };
}
