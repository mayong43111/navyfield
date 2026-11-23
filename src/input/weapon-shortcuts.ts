import type { BattleCommand, DeepReadonly } from '../domain/battle.ts';
import type { TargetContent, TargetControlState } from '../domain/target-content.ts';

export function dispatchWeaponShortcut(code: string, control: DeepReadonly<TargetControlState> | undefined,
  content: TargetContent, send: (command: BattleCommand) => void): boolean {
  if (!['KeyC', 'KeyZ', 'KeyX'].includes(code)) return false;
  const group = control?.groups.find(g => g.side === 'player' && g.slot === control.selectedSlot);
  if (!control || !group || group.control !== 'manual' || content.weapons[group.weaponId]?.kind !== 'gun') return true;
  send({ type: 'fire-hold', enabled: false });
  if (code === 'KeyC') {
    const battery = control.selectedBattery === 'all' ? 'fore' : control.selectedBattery === 'fore' ? 'aft' : 'all';
    send({ type: 'weapon-battery', battery });
  } else if (code === 'KeyZ') send({ type: 'weapon-ammo-cycle' });
  else send({ type: 'firing-pattern', pattern: group.pattern === 'salvo' ? 'gradual' : 'salvo' });
  return true;
}
