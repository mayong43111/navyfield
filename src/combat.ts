export * from './simulation/combat.ts';
export { gunBallistics, shellPower, bulgeCapacity } from './adapters/local/legacy-numbers.ts';
import { dispersedTarget as numericDispersedTarget } from './simulation/combat.ts';
import type { Point } from './domain/battle.ts';

export function dispersedTarget(from: Point, target: Point, random: () => number = Math.random,
  maximumDistance = Infinity): Point {
  return numericDispersedTarget(from, target, random, maximumDistance);
}
