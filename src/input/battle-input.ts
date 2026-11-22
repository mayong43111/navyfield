import type { BattleCommand } from '../domain/battle.ts';

export function steeringCommand(keys: ReadonlySet<string>): BattleCommand {
  return { type: 'steer', drive: Number(keys.has('KeyF')) - Number(keys.has('KeyV')),
    rudder: Number(keys.has('KeyD')) - Number(keys.has('KeyA')) };
}

export function bindBattleKeyboard(options: {
  keys: Set<string>;
  isBattle: () => boolean;
  enabled: (event: KeyboardEvent) => boolean;
  send: (command: BattleCommand) => void;
  action: (code: string) => void;
  clearPointer: () => void;
}): () => void {
  const steer = () => { if (options.isBattle()) options.send(steeringCommand(options.keys)); };
  const keydown = (event: KeyboardEvent) => {
    if (!options.enabled(event)) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.matches('input, select, textarea') || target.isContentEditable)) return;
    if (['Space', 'KeyF', 'KeyV', 'KeyA', 'KeyD', 'KeyC', 'KeyR', 'KeyY', 'ControlLeft', 'ControlRight'].includes(event.code)) event.preventDefault();
    const changed = !options.keys.has(event.code);
    options.keys.add(event.code);
    if (changed && ['KeyF', 'KeyV', 'KeyA', 'KeyD'].includes(event.code)) steer();
    if (!event.repeat) options.action(event.code);
  };
  const keyup = (event: KeyboardEvent) => {
    if (options.keys.delete(event.code) && ['KeyF', 'KeyV', 'KeyA', 'KeyD'].includes(event.code)) steer();
  };
  const clear = () => { options.keys.clear(); steer(); options.clearPointer(); };
  const visibility = () => { if (document.hidden) clear(); };
  window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
  window.addEventListener('blur', clear); document.addEventListener('visibilitychange', visibility);
  return () => {
    window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup);
    window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', visibility);
  };
}
