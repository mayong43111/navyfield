import type { ShellType } from '../domain/battle.ts';
import type { TargetContent, TargetGroupDefinition, TargetMode, TargetWeaponGroupState } from '../domain/target-content.ts';
import { shellAllowed } from './target-physics.ts';

export function createTargetGroup(content: TargetContent, definition: TargetGroupDefinition,
  initialReload: number): TargetWeaponGroupState {
  const weapon = content.weapons[definition.weaponId]!, control = content.controls[definition.controlId]!;
  const availableModes = control.available_modes.split('|') as TargetMode[];
  const mode = availableModes[0]!;
  return { id: definition.id, side: definition.side, slot: definition.slot, weaponId: weapon.id,
    control: control.control, mounts: definition.mounts, barrels: definition.barrels, mode, availableModes,
    shellType: definition.initialShellType, surfaceShellType: definition.initialShellType, pattern: 'salvo', enabled: true,
    switchReadyAt: 0, nextRequestAt: initialReload, cursor: 0, yaw: 0, targetId: null, lockReadyAt: 0,
    aircraftAvailable: weapon.kind === 'aircraft' ? content.ships[control.ship_id]!.aircraft_capacity : 0,
    aircraftLost: 0,
    tubes: Array.from({ length: definition.mounts * definition.barrels }, (_, index) => ({
      mount: Math.floor(index / definition.barrels), barrel: index % definition.barrels,
      remaining: definition.installedMounts[Math.floor(index / definition.barrels)] ? weapon.ammo_per_barrel : 0,
      readyAt: initialReload })) };
}
export function targetMode(content: TargetContent, group: TargetWeaponGroupState) {
  const mode = Object.values(content.weapon_modes).find(m => m.weapon_id === group.weaponId && m.mode === group.mode);
  if (!mode) throw new Error('该物理炮组不支持当前用途');
  return mode;
}
export function setTargetMode(content: TargetContent, definition: TargetGroupDefinition,
  group: TargetWeaponGroupState, mode: TargetMode, time: number): boolean {
  if (group.control !== 'manual' || !group.availableModes.includes(mode)) throw new Error('该炮位不开放手动用途切换');
  if (group.mode === mode) return false;
  group.mode = mode;
  group.shellType = mode === 'air' ? 'HE' : group.surfaceShellType;
  group.switchReadyAt = time + content.controls[definition.controlId]!.mode_switch_s;
  return true;
}
export function setTargetShell(content: TargetContent, definition: TargetGroupDefinition,
  group: TargetWeaponGroupState, type: ShellType, time: number): boolean {
  if (group.control !== 'manual' || content.weapons[group.weaponId]!.kind !== 'gun') throw new Error('该武器没有手动AP/HE炮弹');
  if (!['AP', 'HE'].includes(type) || !shellAllowed(targetMode(content, group).shell_policy, type) || (group.mode === 'air' && type !== 'HE')) {
    throw new Error('当前用途不支持该弹种（对空固定HE定时引信）');
  }
  if (type === group.shellType) return false;
  group.shellType = type;
  if (group.mode === 'surface') group.surfaceShellType = type;
  group.switchReadyAt = time + content.controls[definition.controlId]!.mode_switch_s;
  return true;
}
export function readyTargetTubes(content: TargetContent, definition: TargetGroupDefinition,
  group: TargetWeaponGroupState, mount: number | null, time: number): number[] {
  if (time + 1e-9 < group.switchReadyAt) throw new Error('用途或弹种切换中');
  if (time + 1e-9 < group.nextRequestAt) throw new Error('发射节拍或初始整备等待中');
  const candidates = group.tubes.map((tube, index) => ({ tube, index })).filter(({ tube }) =>
    definition.installedMounts[tube.mount] && (mount === null || tube.mount === mount));
  if (!candidates.length) throw new Error('选中炮座未装备');
  const ready = (index: number): boolean => group.tubes[index]!.remaining > 0 && group.tubes[index]!.readyAt <= time + 1e-9;
  if (group.pattern === 'salvo') {
    if (candidates.some(({ index }) => !ready(index))) throw new Error('所选炮管缺弹或正在装填，不能退化为少管齐射');
    return candidates.map(({ index }) => index);
  }
  const selected = new Set(candidates.map(({ index }) => index));
  for (let offset = 0; offset < group.tubes.length; offset++) {
    const index = (group.cursor + offset) % group.tubes.length;
    if (selected.has(index) && ready(index)) return [index];
  }
  throw new Error('所选炮管缺弹或正在装填');
}
export function consumeTargetTubes(content: TargetContent, group: TargetWeaponGroupState,
  indices: readonly number[], time: number): void {
  const reload = content.weapons[group.weaponId]!.reload_s;
  for (const index of indices) { const tube = group.tubes[index]!; tube.remaining--; tube.readyAt = time + reload; }
  group.cursor = (indices[indices.length - 1]! + 1) % group.tubes.length;
  group.nextRequestAt = time + reload / group.tubes.length;
}
export function setTargetAutomatic(group: TargetWeaponGroupState, enabled: boolean): void {
  if (group.control !== 'automatic' || typeof enabled !== 'boolean') throw new Error('该炮位不是自动炮组');
  if (enabled !== group.enabled) { group.enabled = enabled; group.targetId = null; group.lockReadyAt = 0; }
}
