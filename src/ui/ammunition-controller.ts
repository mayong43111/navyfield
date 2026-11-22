import { element, gunReadout } from '../ui.ts';
import type { OriginalData } from '../original-data.ts';
import { findOriginalShip, originalNumber } from '../original-data.ts';
import type { ApplicationState } from '../domain/application.ts';
import type { DeepReadonly } from '../domain/battle.ts';
import type { PortCommand, VesselVisualContract } from '../domain/port.ts';
import { gunBallistics, shellPower } from '../adapters/local/legacy-numbers.ts';
import { ballisticRange } from '../simulation/navigation.ts';
import { buildGunBanks } from './gun-console.ts';
import type { GunBank } from './gun-console.ts';
import { gaugeArtwork } from './instrument-art.ts';

const lockerName = { A: '甲', B: '乙' }, shellName = { HE: '高爆弹', AP: '穿甲弹' };
export function createAmmunitionController(options: {
  data: OriginalData; state: () => Readonly<ApplicationState>;
  contract: (typeId: string) => DeepReadonly<VesselVisualContract>;
  command: (command: PortCommand) => void; message: (message: string) => void;
}) {
  const shellA = element('shell-a', HTMLSelectElement), shellB = element('shell-b', HTMLSelectElement);
  const gunModel = element('yard-gun-model', HTMLSelectElement), statistics = element('yard-gun-statistics', HTMLParagraphElement);
  const station = element('locker-station', HTMLElement), mountInfo = element('mount-info', HTMLParagraphElement);
  const console = element('battle-gun-console', HTMLDivElement), stationBanks = element('station-banks', HTMLDivElement);
  const app = element('app', HTMLElement), gunStates = document.querySelectorAll<HTMLElement>('.gun-dial span');
  const gauges = [
    { rear: false, needle: element('r-front-elevation', HTMLElement), label: element('r-front-angle', HTMLElement) },
    { rear: true, needle: element('r-rear-elevation', HTMLElement), label: element('r-rear-angle', HTMLElement) }
  ];
  for (const [index, gauge] of gauges.entries()) {
    const face = gauge.needle.parentElement; if (!face) throw new Error('Missing main gun angle gauge');
    face.classList.add('engraved-gauge'); face.insertAdjacentHTML('afterbegin', gaugeArtwork('angle', `angle-${index}`));
    face.insertAdjacentHTML('beforeend', `<span class="angle-caption">R · ${gauge.rear ? '后' : '前'}</span>`);
    face.setAttribute('role', 'meter'); face.setAttribute('aria-label', `R 组${gauge.rear ? '后' : '前'}炮仰角（演示值）`);
    face.setAttribute('aria-valuemin', '0'); face.setAttribute('aria-valuemax', '90');
  }
  let banks: GunBank[] = [], vesselKey = '', magazineKey = '';
  const controls = () => {
    const state = options.state();
    return state.battle?.ships.find(s => s.side === 'player')?.weapons ?? state.port.active.guns;
  };
  const weapon = (index: number) => {
    const id = options.state().port.active.weapons[index];
    if (id === undefined) throw new Error('主炮位不存在');
    if (id === null) return null;
    const gun = options.data.guns.find(g => g.id === id); if (!gun) throw new Error(`炮型资料不存在：${id}`); return gun;
  };
  function refresh(): void {
    const state = options.state(), active = state.port.active, selectedWeapon = active.mount;
    const vessel = findOriginalShip(options.data, active.typeId), selected = banks[selectedWeapon];
    gunModel.replaceChildren(); const empty = document.createElement('option');
    empty.value = ''; empty.textContent = '未装备'; gunModel.append(empty);
    gunModel.disabled = shellA.disabled = shellB.disabled = !selected;
    for (const gun of options.data.guns.filter(g => selected && g.mountGroup === String(selected.turret.barrelCount).padStart(2, '0') &&
      (g.nation === vessel.nation || g.nation === 0))) {
      const option = document.createElement('option'); option.value = gun.id; option.textContent = gun.raw['model']!;
      const space = originalNumber(gun.raw['space']); option.disabled = space === null || space > (vessel.rMounts[selectedWeapon] ?? 0);
      gunModel.append(option);
    }
    const installed = selected ? weapon(selectedWeapon) : null;
    gunModel.value = installed?.id ?? '';
    statistics.textContent = installed ? `基础装填 ${installed.reloadSeconds} 秒 · 转速表值 ${installed.raw['rotationSpeed']} · 炮口速度表值 ${installed.raw['muzzleSpeed']} · 最大仰角 ${installed.raw['maxAngle']}°` : '未装备主炮';
    if (installed) {
      const ballistics = gunBallistics(installed), power = shellPower(options.data, installed);
      statistics.textContent += ballistics ? ` · 水平射程 ${Math.round(ballisticRange(0, ballistics.maxAngle, ballistics.speed))} 游戏单位` : ' · 弹道资料缺失';
      statistics.textContent += ` · 高爆伤害 ${power?.he.toLocaleString('zh-CN') ?? '未取得'} · 穿甲加成 ${power?.apBonus ?? '未取得'}`;
    }
    for (const bank of banks) {
      const ammunition = bank.control.ammunition, gun = weapon(bank.index), selected = bank.index === selectedWeapon;
      bank.container.hidden = gun === null; bank.mount.title = gun?.raw['model'] ?? '未装备';
      bank.dial.title = gun ? `R${bank.index + 1} · ${gun.raw['model']} · 独立装填` : '未装备';
      bank.dial.classList.toggle('active', selected); bank.dial.setAttribute('aria-pressed', String(selected));
      bank.row.classList.toggle('active', selected);
      for (const button of [bank.pin, bank.mount]) { button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected)); }
      bank.toggleLabel.textContent = lockerName[ammunition.selected]; bank.toggle.dataset['locker'] = ammunition.selected;
      for (const locker of ['A', 'B'] as const) {
        const magazine = ammunition.lockers[locker]; bank.counts[locker].textContent = String(magazine.remaining).padStart(4, '0');
        const button = bank.counts[locker].parentElement; if (!button) throw new Error('Missing magazine readout');
        button.title = `${locker} 仓 · ${shellName[magazine.shellType]} · ${magazine.remaining} 发`;
        button.setAttribute('aria-label', `主炮 ${bank.index + 1} 选择 ${button.title}`);
        bank.yardCounts[locker].textContent = `${lockerName[locker]} · ${shellName[magazine.shellType]} ${magazine.remaining}`;
      }
      bank.lockers.forEach(button => {
        const selected = button.dataset['locker'] === ammunition.selected;
        button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
      });
    }
    const count = banks.filter(b => weapon(b.index) !== null).length; console.hidden = count === 0;
    stationBanks.style.gridTemplateColumns = `repeat(${Math.max(1, count)}, minmax(0, 1fr))`;
    app.style.setProperty('--battle-gun-width', `${78 + count * 96}px`);
    for (const gauge of gauges) gauge.needle.parentElement!.hidden = !banks.some(b => b.turret.rear === gauge.rear && weapon(b.index) !== null);
    if (!selected) {
      station.textContent = '无可用主炮'; mountInfo.textContent = options.contract(active.typeId).modelKey === 'yorktown'
        ? '航母外观已接入 · 舰载机战斗尚未实现' : '该模型没有主炮'; return;
    }
    station.textContent = `主炮 ${selectedWeapon + 1} 弹仓`;
    shellA.value = selected.control.ammunition.lockers.A.shellType; shellB.value = selected.control.ammunition.lockers.B.shellType;
    mountInfo.textContent = `${selectedWeapon + 1}号 · ${selected.turret.rear ? '后部主炮' : selectedWeapon === 1 ? '前部背负式主炮' : '前部主炮'}`;
  }
  function render(state: Readonly<ApplicationState>): void {
    const active = state.port.active, key = `${active.id}:${active.typeId}`;
    if (key !== vesselKey) {
      vesselKey = key;
      banks = buildGunBanks({ mounts: options.contract(active.typeId).mounts, controls,
        select: index => options.command({ type: 'select-weapon', index }),
        locker: (weapon, locker) => options.command({ type: 'locker', weapon, locker }), refresh,
        message: options.message });
      magazineKey = '';
    }
    const signature = JSON.stringify([active.mount, active.weapons, controls().map(g => g.ammunition)]);
    if (signature !== magazineKey) { magazineKey = signature; refresh(); }
    for (const bank of banks) {
      const profile = state.config?.ships.find(s => s.side === 'player')?.weapons[bank.index], installed = weapon(bank.index);
      const ballistics = profile ? profile.ballistics : installed ? gunBallistics(installed) : null;
      const weaponState = state.battle?.ships.find(s => s.side === 'player')?.weapons[bank.index];
      const readout = gunReadout(bank.control, bank.turret.barrelCount, installed?.reloadSeconds ?? null, weaponState?.aimState ?? 'limited');
      const label = state.screen === 'yard' ? '停泊' : readout.status;
      if (gunStates[bank.index]) gunStates[bank.index]!.textContent = `${bank.index + 1} ${label}`;
      const power = profile ? profile.power !== null : installed !== null && shellPower(options.data, installed) !== null;
      bank.state.textContent = !installed ? '未装备' : !ballistics ? '弹道资料缺失' : !power ? '弹药资料缺失'
        : state.battle?.combat.result ? '战斗结束' : label;
      bank.dial.classList.toggle('ready', state.screen === 'battle' && !state.battle?.combat.result && power && readout.canFire);
      bank.needle.style.transform = `rotate(${readout.progress * 360}deg)`;
    }
    for (const gauge of gauges) {
      const bank = banks.find(b => b.turret.rear === gauge.rear && weapon(b.index) !== null); if (!bank) continue;
      const elevation = (state.battle?.ships.find(s => s.side === 'player')?.weapons[bank.index]?.elevation ?? 0) * 180 / Math.PI;
      gauge.needle.style.transform = `rotate(${-130 + elevation / 90 * 260}deg)`; gauge.label.textContent = `${Math.round(elevation)}°`;
      gauge.needle.parentElement!.setAttribute('aria-valuenow', elevation.toFixed(1));
    }
  }
  gunModel.addEventListener('change', () => options.command({ type: 'equip-gun', gunId: gunModel.value }));
  for (const [locker, select] of [['A', shellA], ['B', shellB]] as const) select.addEventListener('change', () => {
    const shellType = select.value; if (shellType !== 'HE' && shellType !== 'AP') throw new Error('Invalid shell type');
    const weapon = options.state().port.active.mount;
    options.command({ type: 'shell-type', weapon, locker, shellType });
    options.message(`${weapon + 1}号炮${lockerName[locker]}仓已改装${shellName[shellType]}`);
  });
  return { render, pins: () => banks.map(b => b.pin) };
}
