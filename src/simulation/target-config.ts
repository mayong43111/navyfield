import type { BattleConfig, DeepReadonly, ShipDefinition } from '../domain/battle.ts';
import { createTargetGunDefinitions } from './target-ship-definition.ts';
import { targetRange } from './target-physics.ts';
import { parseTargetContent } from '../domain/target-content.ts';
import { freeze } from './config.ts';

export function freezeTargetConfig(input: BattleConfig): DeepReadonly<BattleConfig> {
  if (input.rulesVersion !== 'target-v1.3.0' || !input.target || !Number.isInteger(input.seed) ||
    input.seed < 0 || input.seed > 0xffffffff || input.ships.length !== 2 ||
    new Set(input.ships.map(s => s.side)).size !== 2 || new Set(input.ships.map(s => s.id)).size !== 2) throw new Error('目标1v1战斗配置无效');
  const content = parseTargetContent(input.target.content), room = content.rooms.duel!;
  if (input.target.roomId !== 'duel' || input.layout.width !== room.map_width_u || input.layout.height !== room.map_height_u ||
    ![input.aim.x, input.aim.y, input.aim.z].every(Number.isFinite)) throw new Error('目标地图必须读取duel房间');
  const ships: ShipDefinition[] = input.ships.map(ship => {
    const source = content.ships[ship.definitionId];
    if (!source || ship.hp !== source.hp || ship.protection !== source.bulge_hp ||
      ship.dimensions.length !== source.length_u || ship.dimensions.beam !== source.beam_u ||
      ![ship.spawn.x, ship.spawn.z, ship.spawn.heading, ship.spawn.speed, ship.spawn.throttle].every(Number.isFinite)) throw new Error('目标舰船数值与CSV不一致');
    return { id: ship.id, definitionId: ship.definitionId, side: ship.side, hp: source.hp, protection: source.bulge_hp,
      dimensions: { length: source.length_u, beam: source.beam_u, height: source.beam_u },
      spawn: { x: ship.spawn.x, z: ship.spawn.z, heading: ship.spawn.heading,
        speed: ship.spawn.speed, throttle: ship.spawn.throttle }, weapons: [] };
  }).sort((a, b) => (a.side === 'player' ? 0 : 1) - (b.side === 'player' ? 0 : 1));
  const ids = new Set<string>();
  const groups = input.target.groups.map(group => {
    const control = content.controls[group.controlId], weapon = content.weapons[group.weaponId];
    const ship = ships.find(s => s.side === group.side), source = ship && content.ships[ship.definitionId];
    const bank = group.bankId === null ? null : content.automation[group.bankId];
    if (!group.id || ids.has(group.id) || !control || !weapon || !source || control.ship_id !== source.id ||
      control.slot !== group.slot || group.id !== `${group.side}-${bank ? bank.id : group.slot}` ||
      bank && group.slot !== (bank.role === 'aa' ? 'light_aa' : 'secondary') || group.bankId !== null && !bank ||
      (control.control === 'automatic') !== (bank !== null) || !['AP', 'HE'].includes(group.initialShellType) ||
      weapon.kind !== 'gun' && group.initialShellType !== 'HE' ||
      group.installedMounts.length !== group.mounts || !group.installedMounts.every(v => typeof v === 'boolean') ||
      (bank ? bank.weapon_id !== weapon.id || bank.mounts !== group.mounts || bank.barrels !== group.barrels || bank.ship_id !== source.id :
        group.slot === 'light_aa' || group.weaponId !== source[`${group.slot}_weapon_id`] ||
        group.mounts !== source[`${group.slot}_mounts`] || group.barrels !== source[`${group.slot}_barrels`])) throw new Error('目标物理炮组配置无效');
    ids.add(group.id);
    return { id: group.id, side: group.side, slot: group.slot, weaponId: group.weaponId, controlId: group.controlId,
      mounts: group.mounts, barrels: group.barrels, installedMounts: [...group.installedMounts],
      initialShellType: group.initialShellType, bankId: group.bankId };
  });
  const expected = new Set<string>();
  for (const ship of ships) {
    const source = content.ships[ship.definitionId]!;
    for (const slot of ['main', 'secondary'] as const) {
      const control = content.controls[`${source.id}:${slot}`];
      if (source[`${slot}_weapon_id`] && control?.control !== 'automatic') expected.add(`${ship.side}-${slot}`);
    }
    for (const bank of Object.values(content.automation).filter(bank => bank.ship_id === source.id)) {
      expected.add(`${ship.side}-${bank.id}`);
    }
    const main = groups.find(group => group.side === ship.side && group.slot === 'main');
    if (!main) throw new Error('目标主武器组缺失');
    ship.weapons = createTargetGunDefinitions(content, source, ship.side, main.installedMounts, main.initialShellType);
  }
  if (expected.size !== ids.size || [...expected].some(id => !ids.has(id))) throw new Error('目标物理炮组集合不完整');
  return freeze({ rulesVersion: 'target-v1.3.0', seed: input.seed, ships,
    layout: { range: targetRange(content.weapons[content.ships[ships[0]!.definitionId]!.main_weapon_id]!, content.rules),
      gap: room.center_gap_u, width: room.map_width_u, height: room.map_height_u,
      regions: (['alpha', 'bravo'] as const).map(team => {
        const center = (team === 'alpha' ? -1 : 1) * room.center_gap_u / 2;
        return { team, zone: 0, minX: center - room.spawn_width_u / 2, maxX: center + room.spawn_width_u / 2,
          minZ: -room.spawn_height_u / 2, maxZ: room.spawn_height_u / 2 };
      }) }, aim: { x: input.aim.x, y: input.aim.y, z: input.aim.z },
    target: { content, roomId: 'duel', groups } } as BattleConfig);
}
