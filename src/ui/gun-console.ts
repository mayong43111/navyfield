import type { Locker } from '../domain/battle.ts';
import type { PortInventory, VesselVisualContract } from '../domain/port.ts';
import type { DeepReadonly } from '../domain/battle.ts';
import { element } from '../ui.ts';
import { gaugeArtwork, magazineArtwork, selectorArtwork } from './instrument-art.ts';

export type GunBank = ReturnType<typeof buildGunBanks>[number];

export function buildGunBanks(options: {
  mounts: DeepReadonly<VesselVisualContract>['mounts']; controls: () => PortInventory;
  select: (index: number) => void; locker: (index: number, locker: Locker) => void;
  refresh: () => void; message: (text: string) => void;
}) {
  const yardPins = element('yard-mount-pins', HTMLDivElement);
  const yardEquipment = element('yard-equipment', HTMLTableSectionElement);
  const stationBanks = element('station-banks', HTMLDivElement);
  yardPins.replaceChildren(); yardEquipment.replaceChildren(); stationBanks.replaceChildren();
  element('yard-gun-count', HTMLElement).textContent = `${options.mounts.length} 座主炮`;
  return options.mounts.map((turret, index) => {
    const pin = document.createElement('button');
    pin.className = 'mount yard-mount-pin'; pin.dataset['mount'] = String(index); pin.type = 'button';
    pin.textContent = `${index + 1}`; pin.setAttribute('aria-label', `舰上主炮 ${index + 1} 挂点`);
    yardPins.append(pin);
    const row = document.createElement('tr');
    row.innerHTML = `<td><button class="mount" data-mount="${index}" type="button" aria-label="装备表主炮 ${index + 1}"><b>${index + 1}号</b> ${turret.barrelCount === 2 ? '双联装' : turret.barrelCount === 3 ? '三联装' : `${turret.barrelCount}管`}主炮</button></td><td><span id="yard-gun-${index}-a"></span><span id="yard-gun-${index}-b"></span></td>`;
    yardEquipment.append(row);
    const mount = row.querySelector<HTMLButtonElement>('.mount');
    if (!mount) throw new Error(`Missing shipyard main gun entry: ${index}`);
    const container = document.createElement('div');
    container.className = 'weapon-bank'; container.dataset['weapon'] = String(index);
    container.innerHTML = `
      <button class="dial station-dial engraved-gauge" type="button" aria-label="选择主炮 ${index + 1} 弹仓" aria-pressed="false">
        ${gaugeArtwork('reload', `reload-${index}`)}
        <span class="instrument-state" id="gun-${index}-state">就绪</span>
        <i id="gun-${index}-reload"></i>
      </button>
      <div class="magazine-readout engraved-magazine">
        ${magazineArtwork(`magazine-${index}`)}
        <span class="station-number">R${index + 1}</span>
        <button class="magazine-toggle" type="button" aria-label="主炮 ${index + 1} 切换 甲乙弹仓">
          ${selectorArtwork()}<span id="gun-${index}-locker">甲</span>
        </button>
        <div><button class="locker-row" data-locker="A" type="button" aria-label="主炮 ${index + 1} 选择 A 弹仓" aria-pressed="true">A <b id="gun-${index}-a">0060</b></button>
        <button class="locker-row" data-locker="B" type="button" aria-label="主炮 ${index + 1} 选择 B 弹仓" aria-pressed="false">B <b id="gun-${index}-b">0060</b></button></div>
      </div>`;
    stationBanks.append(container);
    const dial = container.querySelector<HTMLButtonElement>('.station-dial');
    const toggle = container.querySelector<HTMLButtonElement>('.magazine-toggle');
    if (!dial || !toggle) throw new Error(`Missing weapon controls: ${index}`);
    const control = options.controls()[index];
    if (!control) throw new Error('主炮观察/港口弹仓缺失');
    const bank = {
      index, turret, get control() { return options.controls()[index]!; }, dial, toggle, pin, mount, row, container,
      yardCounts: { A: element(`yard-gun-${index}-a`, HTMLElement), B: element(`yard-gun-${index}-b`, HTMLElement) },
      toggleLabel: element(`gun-${index}-locker`, HTMLElement), state: element(`gun-${index}-state`, HTMLElement),
      needle: element(`gun-${index}-reload`, HTMLElement),
      counts: { A: element(`gun-${index}-a`, HTMLElement), B: element(`gun-${index}-b`, HTMLElement) },
      lockers: container.querySelectorAll<HTMLButtonElement>('[data-locker]')
    };
    const chooseLocker = (locker: Locker) => {
      options.select(index);
      options.locker(index, locker);
      options.refresh();
    };
    for (const button of [pin, mount, dial]) button.addEventListener('click', () => {
      options.select(index); options.refresh();
    });
    toggle.addEventListener('click', () => {
      const locker = bank.control.ammunition.selected === 'A' ? 'B' : 'A';
      chooseLocker(locker);
      const type = bank.control.ammunition.lockers[locker].shellType;
      options.message(`${index + 1}号炮 · ${locker === 'A' ? '甲' : '乙'}仓 · ${type === 'HE' ? '高爆弹' : '穿甲弹'}`);
    });
    bank.lockers.forEach(button => {
      const locker = button.dataset['locker'];
      if (locker !== 'A' && locker !== 'B') throw new Error('Invalid shot locker control');
      button.addEventListener('click', () => chooseLocker(locker));
    });
    return bank;
  });
}
