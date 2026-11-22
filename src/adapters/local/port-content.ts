import type { OriginalData } from '../../original-data.ts';
import { findOriginalShip, YAMATO_ID, MUSASHI_ID } from '../../original-data.ts';
import type { DeepReadonly } from '../../domain/battle.ts';
import type { PortObservation, VesselVisualContract } from '../../domain/port.ts';
import { createOwnedShip } from '../../game/port-state.ts';
import { PortController } from '../../game/port-controller.ts';
import { resolveHullWeapons, validatePortGun } from './port-loadout.ts';
import { gunBallistics, shellPower } from './legacy-numbers.ts';

export function createGamePort(data: OriginalData, contract: (typeId: string) => DeepReadonly<VesselVisualContract>): PortController {
  return new PortController(['大和', '武藏'].map((name, index) => createOwnedShip(`berth-${index}`, name,
    index ? MUSASHI_ID : YAMATO_ID, Array.from({ length: 3 }, () => 'nf-gun-3-341'))), {
    refit: (typeId, previous) => {
      const vessel = findOriginalShip(data, typeId);
      if (!vessel.available || vessel.durability === null) throw new Error('此舰型的完整资料尚未取得。');
      const model = contract(typeId);
      return { name: vessel.name, weapons: resolveHullWeapons(data, vessel, model.mounts.map(m => m.barrelCount), previous, model.modelKey) };
    },
    validateGun: (typeId, index, gunId) => {
      const mount = contract(typeId).mounts[index];
      if (!mount) throw new Error('该舰没有可配置的主炮');
      validatePortGun(data, typeId, index, mount.barrelCount, gunId);
    }
  });
}
export function launchError(data: OriginalData, port: PortObservation, model: DeepReadonly<VesselVisualContract>, typeId: string): string | null {
  if (typeId !== port.active.typeId) return '单舰对战使用所选舰，请先在船坞为该舰配置主炮，再重新进入房间。';
  if (model.modelKey === 'yorktown') return '约克镇航母外观已接入，但舰载机战斗尚未实现，当前不能出击。';
  if (!port.active.weapons.some(id => {
    const gun = data.guns.find(g => g.id === id);
    return gun && shellPower(data, gun) !== null && gunBallistics(gun) !== null;
  })) return '请先在船坞装备有弹药资料的主炮，再出击。';
  return null;
}
