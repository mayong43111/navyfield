import { element } from '../ui.ts';
import type { ApplicationState } from '../domain/application.ts';
import type { TargetContent } from '../domain/target-content.ts';
import { gaugeArtwork } from './instrument-art.ts';

export function createTargetInstruments(content: TargetContent) {
  const console = element('battle-gun-console', HTMLDivElement);
  const banks = element('station-banks', HTMLDivElement);
  const bearings = console.querySelector<HTMLElement>('.bearing-stack')!;
  const gauges = ['front', 'rear'].map((name, index) => {
    const needle = element(`r-${name}-elevation`, HTMLElement), label = element(`r-${name}-angle`, HTMLElement);
    const face = needle.parentElement!;
    face.classList.add('engraved-gauge'); face.insertAdjacentHTML('afterbegin', gaugeArtwork('angle', `target-angle-${index}`));
    face.setAttribute('role', 'meter'); face.setAttribute('aria-label', `${index ? '后' : '前'}主炮仰角`);
    face.setAttribute('aria-valuemin', '0');
    return { face, needle, label };
  });
  let key = '';
  const stations: { root: HTMLElement; needle: HTMLElement; state: HTMLElement; ammo: HTMLElement }[] = [];
  function render(state: Readonly<ApplicationState>): void {
    console.hidden = state.screen !== 'battle' || !state.battle?.target;
    if (console.hidden) return;
    const battle = state.battle!, group = battle.target!.groups.find(g => g.side === 'player' && g.slot === 'main');
    if (!group) { console.hidden = true; return; }
    const weapon = content.weapons[group.weaponId]!, ship = content.ships[state.port.active.typeId]!;
    const definition = state.config?.target?.groups.find(g => g.id === group.id);
    const time = battle.tick / content.rules.simulation_hz;
    const nextKey = `${ship.id}:${group.weaponId}:${group.mounts}`;
    if (key !== nextKey) {
      key = nextKey; banks.replaceChildren(); stations.length = 0;
      for (let mount = 0; mount < group.mounts; mount++) {
        const root = document.createElement('div'); root.className = 'weapon-bank target-station';
        root.innerHTML = `<div class="dial station-dial engraved-gauge" role="meter" aria-label="主武器 ${mount + 1} 装填进度">${gaugeArtwork('reload', `target-reload-${mount}`)}<i></i><span class="instrument-state"></span></div><b>R${mount + 1}</b><small></small>`;
        banks.append(root);
        stations.push({ root, needle: root.querySelector('i')!, state: root.querySelector('span.instrument-state')!, ammo: root.querySelector('small')! });
      }
    }
    const observations = battle.ships.find(s => s.side === 'player')?.weapons ?? [];
    const guns = weapon.kind === 'gun'; bearings.hidden = !guns;
    banks.style.marginLeft = guns ? '' : '0';
    banks.style.gridTemplateColumns = `repeat(${Math.max(1, group.mounts)}, minmax(0, 1fr))`;
    element('app', HTMLElement).style.setProperty('--battle-gun-width', `${Math.min(520, (guns ? 78 : 18) + group.mounts * 96)}px`);
    console.setAttribute('aria-label', `${weapon.name} · 装填与共享备弹`);
    stations.forEach((station, mount) => {
      const tubes = group.tubes.filter(t => t.mount === mount), installed = definition?.installedMounts[mount] !== false;
      station.root.hidden = !installed;
      const reload = Math.max(0, ...tubes.map(t => t.readyAt - time));
      const progress = Math.max(0, Math.min(1, 1 - reload / weapon.reload_s));
      station.needle.style.transform = `rotate(${-130 + progress * 260}deg)`;
      const meter = station.needle.parentElement!;
      meter.setAttribute('aria-valuemin', '0'); meter.setAttribute('aria-valuemax', '100');
      meter.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
      station.state.textContent = reload > 0 ? `${reload.toFixed(1)}s` : '就绪';
      station.ammo.textContent = weapon.kind === 'aircraft' ? `可用 ${group.aircraftAvailable} 架` : `${group.shellType} · ${tubes.reduce((sum, t) => sum + t.remaining, 0)} 发`;
    });
    gauges.forEach((gauge, index) => {
      const mount = observations.findIndex((_, i) => (i >= Math.ceil(group.mounts / 2)) === !!index && definition?.installedMounts[i] !== false);
      gauge.face.hidden = !guns || mount < 0;
      const angle = (observations[mount]?.elevation ?? 0) * 180 / Math.PI;
      gauge.label.textContent = `${angle.toFixed(1)}°`; gauge.needle.style.transform = `rotate(${-130 + angle / 90 * 260}deg)`;
      gauge.face.setAttribute('aria-valuemax', String(weapon.max_elevation_deg)); gauge.face.setAttribute('aria-valuenow', angle.toFixed(1));
    });
    const panel = document.querySelector<HTMLElement>('.weapon-panel')!;
    panel.querySelector('h2')!.textContent = weapon.name;
    panel.querySelector('svg')!.setAttribute('hidden', '');
    const labels = panel.querySelectorAll('dt'), values = panel.querySelectorAll('dd');
    labels[0]!.textContent = '类型'; values[0]!.textContent = { gun: '舰炮', torpedo: '鱼雷', aircraft: '舰载机', aa: '防空炮' }[weapon.kind];
    labels[1]!.textContent = '配置'; values[1]!.textContent = `${group.mounts} × ${group.barrels}`;
    element('reload', HTMLElement).textContent = `${weapon.reload_s} 秒 / 管`;
  }
  return { render };
}
