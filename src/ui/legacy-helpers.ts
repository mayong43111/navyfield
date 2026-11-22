import type { GunState } from '../ammunition.ts';
import { nationNames, shipClassNames } from '../adapters/content/legacy-data.ts';
import type { OriginalShip } from '../adapters/content/legacy-data.ts';
import { modelStatusRank } from '../adapters/content/ship-catalog.ts';
import type { ShipModelStatus } from '../adapters/content/ship-catalog.ts';
const modelStatusLabels = { integrated: '已接入', downloaded: '已下载', link_only: '来源匹配' };

export function renderShipTypes(select: HTMLSelectElement, ships: readonly OriginalShip[],
  matches: ReadonlyMap<string, ShipModelStatus>): void {
  const document = select.ownerDocument;
  select.replaceChildren();
  for (const matched of [true, false]) {
    for (const [nation, name] of nationNames.entries()) {
      const vessels = ships.filter(ship => ship.nation === nation && matches.has(ship.id) === matched);
      if (!vessels.length) continue;
      vessels.sort((a, b) => (modelStatusRank[matches.get(b.id) ?? 'link_only'])
        - (modelStatusRank[matches.get(a.id) ?? 'link_only']));
      const group = document.createElement('optgroup');
      group.label = `${name} · ${matched ? '已匹配' : '未匹配'}`;
      group.dataset['modelMatched'] = String(matched);
      for (const vessel of vessels) {
        const status = matches.get(vessel.id);
        const option = document.createElement('option');
        option.value = vessel.id;
        option.textContent = `${vessel.name} · ${shipClassNames[vessel.shipClass] ?? '其他'} · ${status ? modelStatusLabels[status] : '未匹配'}`;
        option.dataset['modelMatched'] = String(matched);
        option.disabled = !vessel.available || vessel.durability === null;
        group.append(option);
      }
      select.append(group);
    }
  }
}

export function element<T extends HTMLElement>(id: string, constructor: { new(): T }): T {
  const result = document.getElementById(id);
  if (!(result instanceof constructor)) throw new Error(`Missing UI element: ${id}`);
  return result;
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Cannot initialize 2D reference graphics');
  return context;
}

export function gunReadout(gun: GunState, barrelCount: number, reloadSeconds: number | null,
  aim: 'limited' | 'turning' | 'aligned'): { status: string; canFire: boolean; progress: number } {
  if (reloadSeconds === null) return { status: '未装备', canFire: false, progress: 0 };
  if (!Number.isFinite(reloadSeconds) || reloadSeconds <= 0 ||
    !Number.isInteger(barrelCount) || barrelCount <= 0 ||
    !Number.isFinite(gun.reload) || gun.reload < 0) throw new RangeError('Invalid gun display state');
  const progress = Math.max(0, Math.min(1, 1 - gun.reload / reloadSeconds));
  const status = gun.reload > 0 ? `装填 ${gun.reload.toFixed(1)}s`
    : gun.ammunition.lockers[gun.ammunition.selected].remaining < barrelCount ? '缺弹'
    : aim === 'limited' ? '射界受限'
    : aim === 'turning' ? '转炮瞄准' : '就绪';
  return { status, canFire: status === '就绪', progress };
}
