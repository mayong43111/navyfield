import type { BattleConfig, DeepReadonly } from '../domain/battle.ts';

export function freeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

export function freezeConfig(input: BattleConfig): DeepReadonly<BattleConfig> {
  const config = structuredClone(input);
  const positive = (value: number): boolean => Number.isFinite(value) && value > 0;
  if (config.rulesVersion !== 'single-ship-v1' || !Number.isInteger(config.seed) ||
    config.seed < 0 || config.seed > 0xffffffff) throw new RangeError('战斗版本或随机种子无效');
  if (config.ships.length !== 2 || new Set(config.ships.map(s => s.id)).size !== 2 ||
    !config.ships.some(s => s.side === 'player') || !config.ships.some(s => s.side === 'enemy')) {
    throw new Error('当前规则必须配置独立的本舰与敌舰');
  }
  config.ships.sort((a, b) => (a.side === 'player' ? 0 : 1) - (b.side === 'player' ? 0 : 1));
  if (!Object.values(config.aim).every(Number.isFinite) || !positive(config.layout.range) ||
    !positive(config.layout.width) || !positive(config.layout.height)) throw new RangeError('战场配置无效');
  const weaponIds = new Set<string>();
  for (const ship of config.ships) {
    if (!ship.id || !ship.definitionId || !positive(ship.hp) ||
      !Number.isFinite(ship.protection) || ship.protection < 0 ||
      !Object.values(ship.dimensions).every(positive) ||
      !Object.values(ship.spawn).every(Number.isFinite)) throw new RangeError('舰船数值配置无效');
    for (const weapon of ship.weapons) {
      if (!weapon.id || weaponIds.has(weapon.id)) throw new Error('主炮实例 ID 重复或缺失');
      weaponIds.add(weapon.id);
      if (!weapon.muzzles.length || ![weapon.mount, weapon.pivot, ...weapon.muzzles]
        .every(p => Object.values(p).every(Number.isFinite))) throw new RangeError('主炮数值挂点无效');
      if (weapon.reloadSeconds !== null && !positive(weapon.reloadSeconds)) throw new RangeError('主炮装填无效');
      if (weapon.ballistics && (!positive(weapon.ballistics.speed) || !positive(weapon.ballistics.maxAngle) ||
        weapon.ballistics.maxAngle > Math.PI / 2)) throw new RangeError('主炮弹道无效');
      if (weapon.power && !Object.values(weapon.power).every(v => Number.isFinite(v) && v >= 0)) {
        throw new RangeError('主炮毁伤无效');
      }
      if (!['A', 'B'].includes(weapon.ammunition.selected) ||
        !Object.values(weapon.ammunition.lockers).every(m => ['HE', 'AP'].includes(m.shellType) &&
          Number.isSafeInteger(m.remaining) && m.remaining >= 0)) throw new RangeError('主炮弹仓无效');
    }
  }
  return freeze(config);
}
