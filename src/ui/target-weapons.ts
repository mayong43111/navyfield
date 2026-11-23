import { element } from '../ui.ts';
import type { ApplicationState } from '../domain/application.ts';
import type { BattleCommand } from '../domain/battle.ts';
import type { TargetContent, TargetSlot } from '../domain/target-content.ts';
import type { PortCommand } from '../domain/port.ts';

export function createTargetWeaponPanel(options: {
  content: TargetContent; state: () => Readonly<ApplicationState>;
  send: (command: BattleCommand) => void; portCommand: (command: PortCommand) => void;
}) {
  const root = document.createElement('section'); root.className = 'target-weapons';
  root.setAttribute('aria-label', '目标版武器控制');
  root.innerHTML = `<strong>武器控制 · 共享备弹</strong>
    <label>炮位组<select data-control="slot"><option value="main">主武器</option><option value="secondary">第二武器 / 副炮</option><option value="light_aa">小口径防空</option></select></label>
    <label>炮座<select data-control="mount"></select></label>
    <label>用途<select data-control="mode"><option value="surface">对舰</option><option value="air">手动对空</option></select></label>
    <label>发射<select data-control="pattern"><option value="salvo">齐射</option><option value="gradual">渐次</option></select></label>
    <label>炮弹<select data-control="shell"><option value="HE">HE 高爆</option><option value="AP">AP 穿甲</option></select></label>
    <button data-control="automatic" type="button">自动开关</button>
    <label>对空预瞄高度<input data-control="height" type="number" min="1" max="3000" step="10" value="120"> u</label>
    <button data-control="aircraft" type="button">预瞄最近敌机当前位置</button>
    <button data-control="hold" type="button">按住渐次开火（空格）</button>
    <p data-control="readout" role="status"></p><small>选组/换用途后重新左键预瞄；对空使用HE定时球爆。副炮与自动小AA无需手动开火。</small>`;
  element('app', HTMLElement).append(root);
  const select = (name: string) => root.querySelector<HTMLSelectElement>(`[data-control="${name}"]`)!;
  const slot = select('slot'), mount = select('mount'), mode = select('mode'), pattern = select('pattern'), shell = select('shell');
  const automatic = root.querySelector<HTMLButtonElement>('[data-control="automatic"]')!;
  const height = root.querySelector<HTMLInputElement>('[data-control="height"]')!;
  const aircraft = root.querySelector<HTMLButtonElement>('[data-control="aircraft"]')!;
  const hold = root.querySelector<HTMLButtonElement>('[data-control="hold"]')!;
  const readout = root.querySelector<HTMLElement>('[data-control="readout"]')!;
  const shellA = element('shell-a', HTMLSelectElement), shellB = element('shell-b', HTMLSelectElement);
  shellA.closest('label')!.firstChild!.textContent = '初始弹种 ';
  shellA.setAttribute('aria-label', '出击初始弹种');
  shellB.closest('label')!.hidden = true;
  const gunModel = element('yard-gun-model', HTMLSelectElement);
  let mountKey = '';
  const group = () => { const state = options.state().battle?.target;
    return state?.groups.find(g => g.side === 'player' && g.slot === state.selectedSlot); };
  const stop = () => options.send({ type: 'fire-hold', enabled: false });
  const change = (command: BattleCommand) => { stop(); options.send(command); };
  slot.addEventListener('change', () => change({ type: 'weapon-slot', slot: slot.value as TargetSlot }));
  mount.addEventListener('change', () => change({ type: 'weapon-mount', mount: mount.value === '' ? null : Number(mount.value) }));
  mode.addEventListener('change', () => change({ type: 'weapon-mode', mode: mode.value === 'air' ? 'air' : 'surface' }));
  pattern.addEventListener('change', () => change({ type: 'firing-pattern', pattern: pattern.value === 'gradual' ? 'gradual' : 'salvo' }));
  shell.addEventListener('change', () => change({ type: 'shell-type', weapon: 0, locker: 'A', shellType: shell.value === 'AP' ? 'AP' : 'HE' }));
  automatic.addEventListener('click', () => { const selected = group(); if (selected) options.send({ type: 'automatic', slot: selected.slot, enabled: !selected.enabled }); });
  aircraft.addEventListener('click', () => {
    const state = options.state().battle;
    const player = state?.ships.find(s => s.side === 'player')?.navigation;
    const nearest = state?.aircraft?.filter(a => a.owner === 'enemy').slice().sort((a, b) =>
      Math.hypot(a.position.x - (player?.x ?? 0), a.position.z - (player?.z ?? 0)) -
      Math.hypot(b.position.x - (player?.x ?? 0), b.position.z - (player?.z ?? 0)))[0];
    if (nearest) { height.value = String(Math.round(nearest.position.y)); options.send({ type: 'aim', point: { ...nearest.position } }); }
  });
  hold.addEventListener('pointerdown', event => { if (event.button === 0 && !hold.disabled) { hold.setPointerCapture(event.pointerId); options.send({ type: 'fire-hold', enabled: true }); } });
  hold.addEventListener('pointerup', stop); hold.addEventListener('pointercancel', stop); hold.addEventListener('lostpointercapture', stop);
  window.addEventListener('blur', stop);
  shellA.addEventListener('change', () => {
    const state = options.state(); if (state.screen !== 'yard') return;
    for (const weapon of state.port.active.guns.keys()) options.portCommand({ type: 'shell-type', weapon, locker: 'A', shellType: shellA.value === 'AP' ? 'AP' : 'HE' });
  });
  function render(state: Readonly<ApplicationState>): void {
    root.hidden = state.screen !== 'battle';
    element('battle-gun-console', HTMLDivElement).hidden = true;
    const ship = options.content.ships[state.port.active.typeId]!, weapon = options.content.weapons[ship.main_weapon_id]!;
    gunModel.replaceChildren(new Option(weapon.name, weapon.id)); gunModel.disabled = true;
    shellA.disabled = state.screen !== 'yard' || weapon.kind !== 'gun'; shellB.disabled = true;
    shellA.value = state.port.active.guns[0]?.ammunition.lockers.A.shellType ?? 'HE';
    element('locker-station', HTMLElement).textContent = '逐管共享备弹 · AP/HE不分独立库存';
    element('mount-info', HTMLParagraphElement).textContent = `${ship.main_mounts}座 × ${ship.main_barrels}管 · ${weapon.name}`;
    element('yard-gun-statistics', HTMLParagraphElement).textContent = `固定舰装 · 装填${weapon.reload_s}s · 单发基础伤害${weapon.damage} · 备弹${weapon.ammo_per_barrel}/管 · ${weapon.kind}`;
    const control = state.battle?.target, selected = group(); if (!control || !selected) return;
    slot.value = control.selectedSlot;
    for (const option of slot.options) option.disabled = !control.groups.some(g => g.side === 'player' && g.slot === option.value);
    const key = `${selected.id}:${selected.mounts}`;
    if (key !== mountKey) { mountKey = key; mount.replaceChildren(new Option('全组', ''));
      for (let i = 0; i < selected.mounts; i++) mount.append(new Option(`${i + 1}号座`, String(i))); }
    mount.value = control.selectedMount === null ? '' : String(control.selectedMount);
    const manual = selected.control === 'manual', selectedWeapon = options.content.weapons[selected.weaponId]!;
    mount.disabled = pattern.disabled = !manual || selectedWeapon.kind !== 'gun';
    mode.disabled = !manual || selected.availableModes.length < 2;
    mode.value = selected.mode; pattern.value = selected.pattern; shell.value = selected.shellType;
    for (const option of mode.options) option.disabled = !selected.availableModes.includes(option.value as 'air' | 'surface');
    shell.disabled = !manual || selectedWeapon.kind !== 'gun' || selected.mode === 'air';
    automatic.hidden = manual; automatic.textContent = `自动${selected.enabled ? '启用 → 停火' : '停火 → 启用'}`;
    automatic.setAttribute('aria-pressed', String(selected.enabled));
    height.disabled = aircraft.disabled = !manual || selected.mode !== 'air';
    aircraft.disabled ||= !state.battle?.aircraft?.some(a => a.owner === 'enemy');
    hold.disabled = !manual || selected.pattern !== 'gradual' || !!state.battle?.combat.result;
    const time = (state.battle?.tick ?? 0) / options.content.rules.simulation_hz;
    const lines = control.groups.filter(g => g.side === 'player' && g.slot === selected.slot).map(g => {
      const remain = g.tubes.reduce((sum, tube) => sum + tube.remaining, 0);
      const tubes = g.tubes.map(tube => `${tube.mount + 1}-${tube.barrel + 1}:${tube.remaining}发/${Math.max(0, tube.readyAt - time).toFixed(1)}s`).join(' ');
      return `${options.content.weapons[g.weaponId]!.name} · ${g.control === 'manual' ? '手动' : '自动'} · 余${remain}发${g.aircraftAvailable || g.aircraftLost ? ` · 可用飞机${g.aircraftAvailable}/损失${g.aircraftLost}` : ''}\n${tubes}`;
    });
    readout.textContent = `切换等待${Math.max(0, selected.switchReadyAt - time).toFixed(1)}s · ${control.aimValid ? '预瞄有效' : '请重新预瞄'}\n${lines.join('\n')}`;
  }
  return { render, panel: root, stop, pins: () => [] as HTMLElement[],
    aimHeight: () => { const value = height.valueAsNumber; return Number.isFinite(value) ? Math.max(1, Math.min(3000, value)) : 120; },
    dispose: () => { window.removeEventListener('blur', stop); root.remove(); } };
}
