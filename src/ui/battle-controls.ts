import { element } from '../ui.ts';
import type { ApplicationState, Screen } from '../domain/application.ts';

export function createBattleControls(actions: {
  navigate: (screen: Screen) => void; fire: () => void; tda: () => void; power: (step: number) => void;
  resupply: () => void; returnCamera?: () => void;
}) {
  const app = element('app', HTMLElement), tda = element('tda', HTMLButtonElement);
  const listeners: Array<() => void> = [];
  const click = (id: string, action: () => void) => {
    const button = element(id, HTMLButtonElement);
    button.addEventListener('click', action); listeners.push(() => button.removeEventListener('click', action));
  };
  click('battle-exit', () => actions.navigate('yard'));
  click('battle-result-exit', () => actions.navigate('yard'));
  click('yard-depart', () => actions.navigate('briefing'));
  click('yard-resupply', actions.resupply);
  click('fire', actions.fire);
  click('tda', actions.tda);
  click('camera-return', () => actions.returnCamera?.());
  click('power-up', () => actions.power(0.1));
  click('power-down', () => actions.power(-0.1));
  function render(state: Readonly<ApplicationState>): void {
    app.dataset['mode'] = state.screen;
    const enabled = state.battle?.tda ?? false;
    tda.setAttribute('aria-pressed', String(enabled)); tda.setAttribute('aria-label', `炮塔转动加速，${enabled ? '开启' : '关闭'}`);
  }
  return { render, dispose: () => { for (const off of listeners) off(); } };
}
