import type { TargetContent } from '../../domain/target-content.ts';
import { PortController } from '../../game/port-controller.ts';
import { createOwnedShip } from '../../game/port-state.ts';

export function createTargetPort(content: TargetContent): PortController {
  const weapons = (id: string) => {
    const ship = content.ships[id];
    if (!ship) throw new Error(`舰型不存在：${id}`);
    return content.weapons[ship.main_weapon_id]!.kind === 'aircraft' ? [] : Array<string>(ship.main_mounts).fill(ship.main_weapon_id);
  };
  return new PortController(Object.values(content.ships).map(ship =>
    createOwnedShip(`berth-${ship.id}`, ship.name, ship.id, weapons(ship.id))), {
    refit(id) {
      const ship = content.ships[id];
      if (!ship) throw new Error(`舰型不存在：${id}`);
      return { name: ship.name, weapons: weapons(id) };
    },
    validateGun(id, mount, gunId) {
      const ship = content.ships[id];
      if (!ship || mount >= ship.main_mounts || (gunId && gunId !== ship.main_weapon_id)) {
        throw new Error('目标版舰船只能装备统一数据声明的主武器');
      }
    }
  });
}
