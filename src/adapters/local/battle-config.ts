import { Vector3 } from 'three';
import type { ShipInstance } from '../../yamato.ts';
import type { OriginalData } from '../../original-data.ts';
import { findOriginalShip } from '../../original-data.ts';
import type { BattleConfig, ShipDefinition, ShipDefinitionId, ShipId, WeaponId, Side, Ammunition } from '../../domain/battle.ts';
import type { BattleDeployment } from '../../domain/deployment.ts';
import { gunBallistics, shellPower, bulgeCapacity } from './legacy-numbers.ts';
import { createBattleLayout, deploymentPoses } from '../../simulation/combat.ts';
import { ballisticRange } from '../../simulation/navigation.ts';
import { createAmmunition } from '../../simulation/ammunition.ts';
import { createShip } from '../../ships.ts';

export interface BattleLoadout {
  typeId: string;
  bulgeLevel: number;
  weapons: readonly (string | null)[];
  ammunition: readonly Ammunition[];
}

export function createModelBattleConfig(data: OriginalData, models: Parameters<typeof createShip>[0],
  loadout: BattleLoadout, deployment: BattleDeployment, seed: number): BattleConfig {
  return createLocalBattleConfig(data, createShip(models, loadout.typeId), createShip(models, loadout.typeId),
    loadout, deployment, seed);
}

// Stage-one compatibility boundary: resolve legacy tables and model node contracts ONCE.
// These copied numbers, not scene transforms, define the battle thereafter.
export function createLocalBattleConfig(data: OriginalData, player: ShipInstance, enemy: ShipInstance,
  loadout: BattleLoadout, deployment: BattleDeployment, seed: number): BattleConfig {
  const vessel = findOriginalShip(data, loadout.typeId);
  const protection = bulgeCapacity(data, vessel.nation, loadout.bulgeLevel);
  if (vessel.durability === null || vessel.durability <= 0 || protection === null) {
    throw new Error('无法建立战斗：舰体耐久或防雷资料缺失');
  }
  let maximumHeight = 1;
  const definition = (instance: ShipInstance, side: Side): ShipDefinition => {
    const position = instance.ship.position.clone(), rotation = instance.ship.rotation.clone();
    try {
      instance.ship.position.set(0, 0, 0); instance.ship.rotation.set(0, 0, 0);
      instance.ship.updateMatrixWorld(true);
      return { id: side as ShipId, definitionId: loadout.typeId as ShipDefinitionId, side,
        hp: vessel.durability!, protection, dimensions: { ...instance.dimensions },
        spawn: { x: 0, z: 0, heading: 0, speed: 0, throttle: 0 },
        weapons: instance.turrets.map((turret, index) => {
          const weaponId = loadout.weapons[index];
          if (weaponId === undefined) throw new Error('配装与主炮位数量不一致');
          const gun = weaponId === null ? null : data.guns.find(gun => gun.id === weaponId);
          if (weaponId !== null && !gun) throw new Error(`炮型资料不存在：${weaponId}`);
          const pivot = turret.elevation.getWorldPosition(new Vector3());
          for (const muzzle of turret.muzzles) maximumHeight = Math.max(maximumHeight,
            1 + pivot.y + pivot.distanceTo(muzzle.getWorldPosition(new Vector3())));
          const ammunition = side === 'enemy' ? createAmmunition() : structuredClone(loadout.ammunition[index]);
          if (!ammunition) throw new Error('主炮弹仓配置缺失');
          ammunition.lockers.A.remaining = ammunition.lockers.B.remaining = 60;
          const point = (p: Vector3) => ({ x: p.x, y: p.y, z: p.z });
          return { id: `${side}-gun-${index}` as WeaponId, installed: gun !== null, rear: turret.rear,
            mount: point(turret.group.position), pivot: point(turret.elevation.position),
            muzzles: turret.muzzles.map(node =>
              point(turret.elevation.worldToLocal(node.getWorldPosition(new Vector3())))),
            reloadSeconds: gun?.reloadSeconds ?? null,
            ballistics: gun ? gunBallistics(gun) : null, power: gun ? shellPower(data, gun) : null, ammunition };
        }) };
    } finally {
      instance.ship.position.copy(position); instance.ship.rotation.copy(rotation);
      instance.ship.updateMatrixWorld(true);
    }
  };
  const ships = [definition(player, 'player'), definition(enemy, 'enemy')];
  const range = Math.max(...ships.flatMap(s => s.weapons.map(w => w.ballistics
    ? ballisticRange(maximumHeight, w.ballistics.maxAngle, w.ballistics.speed) : 0)));
  if (!(range > 0)) throw new Error('无法建立战斗：没有可用的主炮弹道资料（舰载机战斗尚未实现）');
  const layout = createBattleLayout(range, deployment.slot), poses = deploymentPoses(deployment, layout);
  ships[0]!.spawn = poses.player; ships[1]!.spawn = poses.enemy;
  return { rulesVersion: 'single-ship-v1', seed, ships, layout,
    aim: { x: poses.player.x + Math.sin(poses.player.heading) * range * 0.5, y: 0.5, z: poses.player.z } };
}
