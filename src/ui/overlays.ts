import { element, context2d } from '../ui.ts';
import type { ApplicationState } from '../domain/application.ts';
import type { ViewFrame, Projection } from '../presentation/battle-view.ts';
import { paintTacticalMap } from './tactical-map.ts';

export function createOverlays(pins: () => readonly HTMLElement[]) {
  const ship = element('ship-tag', HTMLDivElement), enemy = element('ally-tag', HTMLDivElement);
  const aim = element('aim-label', HTMLDivElement), departure = element('yard-depart', HTMLButtonElement);
  const map = element('minimap', HTMLCanvasElement), context = context2d(map);
  const position = (label: HTMLElement, projection: Projection) => {
    label.style.left = `${projection.x}px`; label.style.top = `${projection.y}px`;
    label.style.visibility = projection.visible ? 'visible' : 'hidden';
  };
  function render(state: Readonly<ApplicationState>, frame: ViewFrame): void {
    ship.querySelector('b')!.textContent = `◆ ${state.port.active.name}`;
    enemy.querySelector('b')!.textContent = `◆ 敌舰 · ${state.port.active.name}`;
    position(ship, frame.ship); position(enemy, frame.enemy); position(aim, frame.aimLabel);
    if (state.screen === 'battle') aim.textContent =
      `目标 ${Math.hypot(frame.aim.x - frame.navigation.x, frame.aim.z - frame.navigation.z).toFixed(0)} 单位`;
    if (state.screen === 'yard') {
      position(departure, frame.departure);
      for (const [index, pin] of pins().entries()) if (frame.pins[index]) position(pin, frame.pins[index]!);
    }
    paintTacticalMap(context, { battle: state.screen === 'battle', layout: state.config?.layout ?? null,
      observation: state.battle, navigation: frame.navigation, aim: frame.aim, corners: frame.corners });
  }
  function deployment(team: 'alpha' | 'bravo', slot: number): void {
    ship.querySelector('span')!.textContent = `${team === 'alpha' ? '甲' : '乙'}-${String(slot + 1).padStart(3, '0')}`;
  }
  return { render, deployment, map };
}
