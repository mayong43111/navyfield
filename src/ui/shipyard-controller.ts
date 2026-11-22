import type { OriginalData } from '../original-data.ts';
import { findOriginalShip, nationNames, shipClassNames } from '../original-data.ts';
import { element, renderShipTypes } from '../ui.ts';
import type { ApplicationState } from '../domain/application.ts';
import type { DeepReadonly } from '../domain/battle.ts';
import type { PortCommand, VesselVisualContract } from '../domain/port.ts';
import { bulgeCapacity } from '../adapters/local/legacy-numbers.ts';
import { MAX_SPEED } from '../simulation/navigation.ts';
import { renderBerths } from './berth-list.ts';

export function createShipyardController(options: {
  data: OriginalData; matches: Parameters<typeof renderShipTypes>[2]; state: () => Readonly<ApplicationState>;
  contract: (typeId: string) => DeepReadonly<VesselVisualContract>; preview: (typeId: string) => string;
  command: (command: PortCommand) => void;
  durability: (current: number, maximum: number) => void; protection: (current: number, maximum: number) => void;
  message: (message: string) => void;
}) {
  const hullType = element('yard-ship-type', HTMLSelectElement), bulgeLevel = element('yard-bulge-level', HTMLInputElement);
  const dialog = element('berth-dialog', HTMLDialogElement), search = element('berth-search', HTMLInputElement);
  let displayed = '';
  function berths(): void {
    const state = options.state().port;
    const count = renderBerths(element('berth-list', HTMLDivElement), state.ships.map(s => s.name), state.activeIndex, search.value, index => {
      dialog.close();
      if (options.state().screen !== 'yard' || index === state.activeIndex) return;
      options.command({ type: 'select-berth', index }); options.message(`${options.state().port.active.name} · 停泊`);
    });
    element('berth-result', HTMLParagraphElement).textContent = count ? `${count} / ${state.ships.length} 个泊位` : '没有匹配的泊位';
  }
  function render(state: Readonly<ApplicationState>): void {
    const active = state.port.active, key = `${active.id}:${active.typeId}:${active.bulgeLevel}:${state.screen}`;
    if (displayed === key) return;
    displayed = key;
    const vessel = findOriginalShip(options.data, active.typeId), model = options.contract(active.typeId);
    const protection = bulgeCapacity(options.data, vessel.nation, active.bulgeLevel);
    if (protection === null) throw new Error('该舰防雷装甲资料未取得');
    if (vessel.durability === null) throw new Error('舰体耐久资料缺失。');
    bulgeLevel.value = String(active.bulgeLevel); hullType.value = vessel.id;
    hullType.dataset['modelMatched'] = String(options.matches.has(vessel.id));
    element('yard-vessel', HTMLElement).textContent = active.name;
    element('yard-vessel-class', HTMLElement).textContent = `${nationNames[vessel.nation]} · ${shipClassNames[vessel.shipClass] ?? '其他'}`;
    element('yard-portrait', HTMLImageElement).src = options.preview(vessel.id);
    const particulars = element('yard-particulars', HTMLElement); particulars.replaceChildren();
    for (const [label, value] of [
      ['舰体耐久', vessel.raw['ShipDurabillity']], ['等级', vessel.raw['ShipLevel']],
      ['标准排水', vessel.raw['ShipDisplacementStandard']], ['最大排水', vessel.raw['ShipDisplacementMaximum']],
      ['转向性能', vessel.raw['ShipTurningForce']], ['结构强度', vessel.raw['ShipStructuralStrength']],
      ['超速比例', vessel.raw['ShipOverheatRatio']], ['主炮位', String(vessel.rMounts.length)], ['舷侧/甲板', '未配置'],
      ['船体外形', model.modelName], ['显示舰长', `${model.dimensions.length} 游戏单位`], ['史实舰长', '未接入'],
      ['航速上限', `${MAX_SPEED} 单位/秒`], ['防雷防护', String(protection)]
    ]) {
      const row = document.createElement('div'), term = document.createElement('dt'), detail = document.createElement('dd');
      term.textContent = label!; detail.textContent = value ?? '—'; row.append(term, detail); particulars.append(row);
    }
    if (!state.battle) { options.durability(vessel.durability, vessel.durability); options.protection(protection, protection); }
    berths();
  }
  renderShipTypes(hullType, options.data.ships, options.matches);
  hullType.addEventListener('change', () => options.command({ type: 'equip-hull', typeId: hullType.value }));
  bulgeLevel.addEventListener('input', () => bulgeLevel.setCustomValidity(''));
  bulgeLevel.addEventListener('change', () => {
    const level = bulgeLevel.valueAsNumber;
    if (!Number.isInteger(level) || level < 0 || level > 10) {
      bulgeLevel.setCustomValidity('防雷装甲档位须为0至10的整数'); bulgeLevel.reportValidity(); return;
    }
    options.command({ type: 'bulge', level });
  });
  element('berth-open', HTMLButtonElement).addEventListener('click', () => {
    search.value = ''; berths(); dialog.showModal(); search.focus();
  });
  search.addEventListener('input', berths);
  element('berth-close', HTMLButtonElement).addEventListener('click', () => dialog.close());
  return { render, dialogOpen: () => dialog.open };
}
