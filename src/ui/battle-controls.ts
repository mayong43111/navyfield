import { element } from '../ui.ts';
import type { ApplicationState, Screen } from '../domain/application.ts';

export function createBattleControls(actions: {
  navigate: (screen: Screen) => void; fire: () => void; tda: () => void; power: (step: number) => void;
}) {
  const app = element('app', HTMLElement), tda = element('tda', HTMLButtonElement);
  for (const id of ['battle-exit', 'battle-result-exit', 'yard-depart']) {
    element(id, HTMLButtonElement).addEventListener('click', () => actions.navigate('warzone'));
  }
  element('fire', HTMLButtonElement).addEventListener('click', actions.fire);
  tda.addEventListener('click', actions.tda);
  element('power-up', HTMLButtonElement).addEventListener('click', () => actions.power(0.1));
  element('power-down', HTMLButtonElement).addEventListener('click', () => actions.power(-0.1));
  function render(state: Readonly<ApplicationState>): void {
    app.dataset['mode'] = state.screen;
    const enabled = state.battle?.tda ?? false;
    tda.setAttribute('aria-pressed', String(enabled)); tda.setAttribute('aria-label', `炮塔转动加速，${enabled ? '开启' : '关闭'}`);
  }
  return { render };
}
