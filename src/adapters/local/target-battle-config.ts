import type { Ammunition, BattleConfig, ShipDefinition, ShipDefinitionId, ShipId, Side } from '../../domain/battle.ts';
import { createTargetGunDefinitions } from '../../simulation/target-ship-definition.ts';
import type { BattleDeployment } from '../../domain/deployment.ts';
import type { TargetContent, TargetGroupDefinition } from '../../domain/target-content.ts';
import { parseTargetContent } from '../content/target-content.ts';
import { targetRange } from '../../simulation/target-physics.ts';

export interface TargetBattleLoadout {
  typeId: string; bulgeLevel: number; weapons: readonly (string | null)[]; ammunition: readonly Ammunition[];
}
export function createTargetBattleConfig(input: TargetContent, loadout: TargetBattleLoadout,
  deployment: BattleDeployment, seed: number): BattleConfig {
  const content = parseTargetContent(input), ship = content.ships[loadout.typeId];
  if (!ship) throw new Error(`目标舰型不存在：${loadout.typeId}`);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !['alpha', 'bravo'].includes(deployment.team) ||
    !Number.isInteger(deployment.slot) || deployment.slot < 0 || deployment.slot >= 48 ||
    !Number.isInteger(loadout.bulgeLevel) || loadout.bulgeLevel < 0) throw new RangeError('目标部署或配装无效');
  const mainWeapon = content.weapons[ship.main_weapon_id]!;
  if (loadout.weapons.length !== ship.main_mounts && !(mainWeapon.kind === 'aircraft' && loadout.weapons.length === 0)) {
    throw new Error('目标主武器配装数量与CSV物理炮位不符');
  }
  if (loadout.weapons.some(id => id !== null && id !== ship.main_weapon_id)) throw new Error('目标版只接受该舰CSV声明的主武器');
  const room = content.rooms.duel!, groups: TargetGroupDefinition[] = [];
  const range = targetRange(mainWeapon, content.rules);
  const regions = (['alpha', 'bravo'] as const).map(team => {
    const center = (team === 'alpha' ? -1 : 1) * room.center_gap_u / 2;
    return { team, zone: 0, minX: center - room.spawn_width_u / 2, maxX: center + room.spawn_width_u / 2,
      minZ: -room.spawn_height_u / 2, maxZ: room.spawn_height_u / 2 };
  });
  const definition = (side: Side): ShipDefinition => {
    const team = side === 'player' ? deployment.team : deployment.team === 'alpha' ? 'bravo' : 'alpha';
    const region = regions.find(r => r.team === team)!;
    const margin = content.rules.spawn_edge_margin, spacing = content.rules.spawn_spacing;
    const columns = Math.floor((room.spawn_width_u - margin * 2) / spacing) + 1;
    const rows = Math.floor((room.spawn_height_u - margin * 2) / spacing) + 1;
    const index = deployment.slot % (columns * rows);
    const spawn = { x: region.minX + margin + (index % columns) * spacing,
      z: region.minZ + margin + Math.floor(index / columns) * spacing,
      heading: team === 'alpha' ? Math.PI / 2 : -Math.PI / 2, speed: ship.initial_speed_u_s,
      throttle: ship.initial_speed_u_s / ship.speed_u_s };
    const initialShellType = loadout.ammunition[0]?.lockers[loadout.ammunition[0].selected].shellType ?? 'HE';
    for (const slot of ['main', 'secondary'] as const) {
      const id = ship[`${slot}_weapon_id`], control = content.controls[`${ship.id}:${slot}`];
      if (!id || !control || control.control === 'automatic') continue;
      const mounts = ship[`${slot}_mounts`];
      groups.push({ id: `${side}-${slot}`, side, slot, weaponId: id, controlId: control.id,
        mounts, barrels: ship[`${slot}_barrels`], initialShellType: slot === 'main' ? initialShellType : 'HE',
        installedMounts: Array.from({ length: mounts }, (_, mount) => side === 'enemy' || slot !== 'main' ||
          mainWeapon.kind === 'aircraft' || loadout.weapons[mount] !== null), bankId: null });
    }
    for (const bank of Object.values(content.automation).filter(b => b.ship_id === ship.id)) {
      const slot = bank.role === 'aa' ? 'light_aa' : 'secondary';
      groups.push({ id: `${side}-${bank.id}`, side, slot, weaponId: bank.weapon_id,
        controlId: `${ship.id}:${slot}`, mounts: bank.mounts, barrels: bank.barrels,
        installedMounts: Array(bank.mounts).fill(true), initialShellType: 'HE', bankId: bank.id });
    }
    return { id: side as ShipId, definitionId: ship.id as ShipDefinitionId, side, hp: ship.hp,
      protection: ship.bulge_hp, dimensions: { length: ship.length_u, beam: ship.beam_u, height: ship.beam_u }, spawn,
      weapons: createTargetGunDefinitions(content, ship, side,
        groups.find(group => group.side === side && group.slot === 'main')!.installedMounts, initialShellType) };
  };
  const ships = [definition('player'), definition('enemy')];
  return { rulesVersion: content.rulesVersion, seed, ships,
    layout: { range, gap: room.center_gap_u, width: room.map_width_u, height: room.map_height_u, regions },
    aim: { x: ships[1]!.spawn.x, y: 0.5, z: ships[1]!.spawn.z }, target: { content, roomId: 'duel', groups } };
}
