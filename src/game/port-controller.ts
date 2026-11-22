import type { OwnedShip } from './port-state.ts';
import { refitHull } from './port-state.ts';
import type { PortCommand, PortContent, PortInventory, PortObservation } from '../domain/port.ts';
import { freeze } from '../simulation/config.ts';
import { createAmmunition } from '../simulation/ammunition.ts';

export class PortController {
  private ships: OwnedShip[];
  private activeIndex = 0;
  private listeners = new Set<(state: PortObservation) => void>();
  private current: PortObservation;
  private content: PortContent;
  constructor(ships: OwnedShip[], content: PortContent) {
    if (!ships.length) throw new Error('港口至少需要一艘舰艇');
    this.ships = structuredClone(ships);
    this.content = content;
    this.current = this.snapshot();
  }
  private snapshot(): PortObservation {
    return freeze(structuredClone({ ships: this.ships, activeIndex: this.activeIndex, active: this.ships[this.activeIndex]! }));
  }
  observe(): PortObservation { return this.current; }
  subscribe(listener: (state: PortObservation) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private publish(): void {
    this.current = this.snapshot();
    for (const listener of this.listeners) listener(this.current);
  }
  send(command: PortCommand): void {
    const active = this.ships[this.activeIndex]!;
    const gun = (index: number) => {
      if (!Number.isSafeInteger(index) || !active.guns[index]) throw new RangeError('主炮位不存在');
      return active.guns[index]!;
    };
    switch (command.type) {
      case 'select-berth':
        if (!Number.isSafeInteger(command.index) || !this.ships[command.index]) throw new RangeError('泊位不存在');
        this.activeIndex = command.index; break;
      case 'select-weapon': gun(command.index); active.mount = command.index; break;
      case 'bulge':
        if (!Number.isInteger(command.level) || command.level < 0 || command.level > 10) throw new RangeError('防雷装甲档位须为0至10的整数');
        active.bulgeLevel = command.level; break;
      case 'equip-hull': {
        const replacement = this.content.refit(command.typeId, active.weapons);
        refitHull(active, command.typeId, replacement.name, replacement.weapons); break;
      }
      case 'equip-gun':
        gun(active.mount); this.content.validateGun(active.typeId, active.mount, command.gunId);
        active.weapons[active.mount] = command.gunId || null; active.guns[active.mount]!.reload = 0; break;
      case 'locker':
        if (command.locker !== 'A' && command.locker !== 'B') throw new RangeError('弹仓不存在');
        gun(command.weapon).ammunition.selected = command.locker; break;
      case 'shell-type':
        if (!['A', 'B'].includes(command.locker) || !['HE', 'AP'].includes(command.shellType)) throw new RangeError('弹仓或弹种无效');
        gun(command.weapon).ammunition.lockers[command.locker].shellType = command.shellType; break;
      case 'reset-ammunition':
        for (const control of active.guns) { control.ammunition = createAmmunition(); control.reload = 0; }
        active.mount = 0; break;
      default: throw new Error('未知港口指令');
    }
    this.publish();
  }
  acceptBattleInventory(inventory: PortInventory): void {
    const active = this.ships[this.activeIndex]!;
    if (inventory.length !== active.guns.length) throw new Error('战斗弹仓与港口主炮位数量不一致');
    active.guns = inventory.map(gun => ({ ammunition: structuredClone(gun.ammunition), reload: 0 }));
    this.publish();
  }
}
