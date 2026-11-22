import { SHELL_SPEED, wrapAngle, lowArcElevation } from './navigation.ts';
import type { NavigationState } from './navigation.ts';
import type { ShellType } from './ammunition.ts';
import { FORMATION_COLUMNS, FORMATION_PAGE_SIZE } from '../domain/deployment.ts';
import type { BattleDeployment } from '../domain/deployment.ts';

import type { Side, BattleResult, Point, CombatShip, CombatState, ShellPower, SpawnRegion, BattleLayout } from '../domain/battle.ts';
export type { Side, BattleResult, Point, CombatShip, CombatState, ShellPower, GunBallistics, SpawnRegion, BattleLayout } from '../domain/battle.ts';

export function createBattleLayout(range: number, maximumSlot = 0): BattleLayout {
  if (!Number.isFinite(range) || range <= 0 || !Number.isSafeInteger(maximumSlot) || maximumSlot < 0) {
    throw new RangeError('战场射程或阵位无效');
  }
  const rows = (Math.floor(maximumSlot / (FORMATION_PAGE_SIZE * 2)) + 1) *
    FORMATION_PAGE_SIZE / FORMATION_COLUMNS;
  const width = (FORMATION_COLUMNS - 1) * 300 + 400, height = (rows - 1) * 300 + 400;
  const gap = range * 10;
  const regions: SpawnRegion[] = [];
  for (const team of ['alpha', 'bravo'] as const) {
    for (const zone of [0, 1]) {
      regions.push({ team, zone, minX: team === 'alpha' ? -gap / 2 - width : gap / 2,
        maxX: team === 'alpha' ? -gap / 2 : gap / 2 + width,
        minZ: zone === 0 ? -height - 300 : 300, maxZ: zone === 0 ? -300 : height + 300 });
    }
  }
  return { range, gap, width: gap + width * 2 + 800, height: height * 2 + 1400, regions };
}

export function deploymentPoses(deployment: BattleDeployment, layout: BattleLayout): { player: NavigationState; enemy: NavigationState } {
  if (!Number.isSafeInteger(deployment.slot) || deployment.slot < 0 ||
    (deployment.team !== 'alpha' && deployment.team !== 'bravo')) throw new RangeError('出击阵位无效');
  const zone = Math.floor(deployment.slot / FORMATION_PAGE_SIZE) % 2;
  const row = Math.floor(deployment.slot / (FORMATION_PAGE_SIZE * 2)) * FORMATION_PAGE_SIZE / FORMATION_COLUMNS +
    Math.floor(deployment.slot % FORMATION_PAGE_SIZE / FORMATION_COLUMNS);
  const pose = (team: 'alpha' | 'bravo', column: number, row: number): NavigationState => {
    const sign = team === 'alpha' ? -1 : 1;
    const region = layout.regions.find(region => region.team === team && region.zone === zone);
    if (!region) throw new Error('战场出生区缺失');
    const x = sign * (layout.gap / 2 + 200 + column * 300);
    const z = (zone === 0 ? -1 : 1) * (500 + row * 300);
    if (x < region.minX || x > region.maxX || z < region.minZ || z > region.maxZ) {
      throw new RangeError('阵位超出预计算出生区');
    }
    return { x, z, heading: -sign * Math.PI / 2, speed: 0, throttle: 0 };
  };
  return { player: pose(deployment.team, deployment.slot % FORMATION_COLUMNS, row),
    enemy: pose(deployment.team === 'alpha' ? 'bravo' : 'alpha', 0, 0) };
}

export function sinkingPose(seconds: number): { depth: number; roll: number; pitch: number; visible: boolean } {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('沉没时间无效');
  const t = Math.min(18, seconds);
  const smooth = (duration: number): number => {
    const p = Math.min(1, t / duration);
    return p * p * (3 - 2 * p);
  };
  return { depth: -0.4 * t - 0.2 * Math.max(0, t - 3) ** 2,
    roll: 0.9 * smooth(9), pitch: 0.18 * smooth(12), visible: seconds < 18 };
}

export function createCombat(playerHp: number, enemyHp: number, protection = 0): CombatState {
  if (!Number.isFinite(protection) || protection < 0) throw new RangeError('防雷防护值无效');
  const vessel = (hp: number): CombatShip => {
    if (!Number.isFinite(hp) || hp <= 0) throw new RangeError('舰体耐久必须为正数');
    return { hp, maxHp: hp, belt: 0, deck: 0, shots: 0, hits: 0, damage: 0, sinking: 0,
      protection, maxProtection: protection };
  };
  return { player: vessel(playerHp), enemy: vessel(enemyHp), result: null };
}

export function impactDamage(power: ShellPower, type: ShellType, armor: number): number {
  if (![power.he, power.apBonus, armor].every(value => Number.isFinite(value) && value >= 0)) {
    throw new RangeError('弹药或护甲数值无效');
  }
  const energy = power.he * (type === 'AP' ? 1 + power.apBonus * 0.1 : 1);
  const resistance = armor / (type === 'AP' ? 100 * (1 + power.apBonus) : 100);
  return Math.round(energy / (1 + resistance));
}

export function applyImpact(state: CombatState, owner: Side, power: ShellPower, type: ShellType,
  elevation: number): number {
  if (state.result) return 0;
  if (!Number.isFinite(elevation) || Math.abs(elevation) > Math.PI / 2) throw new RangeError('命中角度无效');
  const attacker = state[owner], target = state[owner === 'player' ? 'enemy' : 'player'];
  if (target.hp <= 0) return 0;
  const damage = Math.min(target.hp, impactDamage(power, type,
    elevation >= Math.PI / 6 ? target.deck : target.belt));
  target.hp -= damage;
  attacker.hits++;
  attacker.damage += damage;
  return damage;
}

export function resolveBattle(state: CombatState): BattleResult | null {
  if (!state.result) {
    state.result = state.player.hp <= 0 && state.enemy.hp <= 0 ? 'draw'
      : state.enemy.hp <= 0 ? 'victory' : state.player.hp <= 0 ? 'defeat' : null;
  }
  return state.result;
}

// Relative motion and slab clipping prevent fast shells tunnelling through a moving hull.
export function hullIntersection(from: Point, to: Point, start: NavigationState,
  end: NavigationState, dimensions = { beam: 38, length: 263, height: 16 }): number | null {
  if (![dimensions.beam, dimensions.length, dimensions.height].every(value => Number.isFinite(value) && value > 0)) {
   throw new RangeError('舰体碰撞尺寸无效');
  }
  const local = (point: Point, pose: NavigationState): Point => {
    const dx = point.x - pose.x, dz = point.z - pose.z;
    return { x: dx * Math.cos(pose.heading) - dz * Math.sin(pose.heading),
      y: point.y, z: dx * Math.sin(pose.heading) + dz * Math.cos(pose.heading) };
  };
  const a = local(from, start), b = local(to, end);
  let enter = 0, exit = 1;
  for (const [axis, min, max] of [['x', -dimensions.beam / 2, dimensions.beam / 2], ['y', 0, dimensions.height],
    ['z', -dimensions.length / 2, dimensions.length / 2]] as const) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-9) {
      if (a[axis] < min || a[axis] > max) return null;
    } else {
      const first = (min - a[axis]) / delta, last = (max - a[axis]) / delta;
      enter = Math.max(enter, Math.min(first, last));
      exit = Math.min(exit, Math.max(first, last));
      if (enter > exit) return null;
    }
  }
  return enter;
}

export function ballisticVelocity(from: Point, target: Point, speed = SHELL_SPEED): Point | null {
  const dx = target.x - from.x, dz = target.z - from.z, distance = Math.hypot(dx, dz);
  if (distance < 1) return null;
  const angle = lowArcElevation(distance, from.y - target.y, speed);
  if (angle === null) return null;
  const horizontal = speed * Math.cos(angle);
  return { x: dx / distance * horizontal, y: speed * Math.sin(angle), z: dz / distance * horizontal };
}

export function dispersedTarget(from: Point, target: Point, random: () => number,
  maximumDistance = Infinity): Point {
  if (Number.isNaN(maximumDistance) || maximumDistance <= 0) throw new RangeError('散布射程无效');
  const dx = target.x - from.x, dz = target.z - from.z, distance = Math.hypot(dx, dz);
  const forwardX = distance > 0 ? dx / distance : 1, forwardZ = distance > 0 ? dz / distance : 0;
  const r = Math.sqrt(random()), angle = random() * Math.PI * 2;
  const along = Math.cos(angle) * r * (28 + distance * 0.07);
  const across = Math.sin(angle) * r * (14 + distance * 0.025);
  const x = target.x + forwardX * along - forwardZ * across;
  const z = target.z + forwardZ * along + forwardX * across;
  const scatteredDistance = Math.hypot(x - from.x, z - from.z);
  const scale = scatteredDistance > maximumDistance ? maximumDistance / scatteredDistance : 1;
  return { x: from.x + (x - from.x) * scale, y: target.y, z: from.z + (z - from.z) * scale };
}

export function enemyCourse(enemy: NavigationState, player: NavigationState): { rudder: number; throttle: number } {
  const dx = player.x - enemy.x, dz = player.z - enemy.z, distance = Math.hypot(dx, dz);
  const bearing = Math.atan2(dx, dz);
  const desired = distance > 490 ? bearing : distance < 270 ? bearing + Math.PI : bearing + Math.PI / 2;
  return { rudder: Math.max(-1, Math.min(1, wrapAngle(desired - enemy.heading) * 3)),
    throttle: distance > 490 ? 0.8 : 0.35 };
}

export function leadTarget(from: Point, target: NavigationState, speed = SHELL_SPEED): Point {
  let time = Math.hypot(target.x - from.x, target.z - from.z) / speed;
  let point: Point = { x: target.x, y: 0.5, z: target.z };
  for (let i = 0; i < 4; i++) {
    point = { x: target.x + Math.sin(target.heading) * target.speed * time, y: 0.5,
      z: target.z + Math.cos(target.heading) * target.speed * time };
    const velocity = ballisticVelocity(from, point, speed);
    if (!velocity) break;
    time = Math.hypot(point.x - from.x, point.z - from.z) / Math.hypot(velocity.x, velocity.z);
  }
  return point;
}
