import type { GameContent } from './content.ts';
import { ApplicationController } from './controller.ts';
import { LocalBattleSession } from '../adapters/local/battle-session.ts';
import { createModelBattleConfig } from '../adapters/local/battle-config.ts';
import { createGamePort, launchError } from '../adapters/local/port-content.ts';
import { createBattleView } from '../presentation/battle-view.ts';
import { createLobby } from '../ui/lobby-controller.ts';
import { createBattleHud } from '../ui/battle-hud.ts';
import { createAmmunitionController } from '../ui/ammunition-controller.ts';
import { createShipyardController } from '../ui/shipyard-controller.ts';
import { createBattleControls } from '../ui/battle-controls.ts';
import { createOverlays } from '../ui/overlays.ts';
import { tacticalMapScale } from '../ui/tactical-map.ts';
import { bindBattleKeyboard } from '../input/battle-input.ts';
import { bindBattlePointer } from '../input/battle-pointer.ts';
import { MAX_SPEED, RELOAD_SECONDS } from '../simulation/navigation.ts';
import type { ApplicationState } from '../domain/application.ts';

export function startApplication(canvas: HTMLCanvasElement, status: HTMLElement, content: GameContent): () => void {
  const view = createBattleView(canvas, content.models), port = createGamePort(content.originalData, view.contract);
  const initial = port.observe().active; view.selectVessel(initial.id, initial.typeId);
  const application = new ApplicationController(port, (state, deployment) => {
    return createModelBattleConfig(content.originalData, content.models, { typeId: state.active.typeId,
      bulgeLevel: state.active.bulgeLevel, weapons: state.active.weapons,
      ammunition: structuredClone(state.active.guns.map(g => g.ammunition)) },
    deployment, crypto.getRandomValues(new Uint32Array(1))[0]!);
  }, config => new LocalBattleSession(config));
  const state = () => application.observe(), message = (text: string) => application.setMessage(text);
  const hud = createBattleHud();
  const ammunition = createAmmunitionController({ data: content.originalData, state, contract: view.contract,
    command: command => application.portCommand(command), message });
  const overlays = createOverlays(ammunition.pins);
  const shipyard = createShipyardController({ data: content.originalData, matches: content.shipModelMatches,
    state, contract: view.contract, preview: view.preview, command: command => application.portCommand(command),
    durability: hud.durability, protection: hud.protection, message });
  const lobby = createLobby((screen, deployment) => {
    application.navigate(screen, deployment);
    if (deployment) overlays.deployment(deployment.team, deployment.slot);
  }, content.land, view.preview, () => ({ name: port.observe().active.name, typeId: port.observe().active.typeId }),
  content.originalData, typeId => launchError(content.originalData, port.observe(), view.contract(port.observe().active.typeId), typeId));
  const power = (step: number) => {
    const current = state(); if (current.screen !== 'battle' || current.battle?.combat.result) return;
    application.send({ type: 'power', step });
    const throttle = current.battle?.ships.find(s => s.side === 'player')?.navigation.throttle ?? 0;
    message(`发动机动力 ${Math.round(Math.max(-0.3, Math.min(1, throttle + step)) * 100)}%`);
  };
  const controls = createBattleControls({ navigate: screen => application.navigate(screen),
    fire: () => application.fire(), tda: () => application.toggleTDA(), power });
  const pointer = bindBattlePointer({ canvas, map: overlays.map, isBattle: () => state().screen === 'battle',
    blocked: [hud.mapPanel, hud.enginePanel, hud.resultPanel],
    scale: () => tacticalMapScale(state().config?.layout ?? null), world: view.waterPoint, message,
    order: (button, point) => {
      if (state().battle?.combat.result) return;
      application.send(button === 0 ? { type: 'aim', point } : { type: 'route', point });
      message(button === 0 ? '瞄准点已锁定 · 空格齐射' : '航线已设定 · F/V切换手动推进');
    }
  });
  const keys = new Set<string>();
  const unbindKeyboard = bindBattleKeyboard({ keys, isBattle: () => state().screen === 'battle',
    enabled: event => ['battle', 'yard'].includes(state().screen) && !shipyard.dialogOpen() &&
      !(state().screen === 'yard' && event.code === 'Space' && event.target instanceof HTMLButtonElement),
    send: command => application.send(command), clearPointer: pointer.clear,
    action: code => {
      if (code === 'Space') application.fire();
      if (code === 'ControlLeft' || code === 'ControlRight') application.toggleTDA();
      if (code === 'KeyY' && state().screen === 'battle') application.toggleLockers();
      if (code === 'KeyC') {
        view.returnCamera(); pointer.clear();
        if (state().screen === 'battle') message('视角已返回本舰 · 边缘移屏 / C回舰');
      }
      if (code === 'KeyR') { application.reset(); if (state().screen === 'yard') view.resetPortView(); }
    }
  });
  let previous: Readonly<ApplicationState> | null = null;
  const unsubscribe = application.subscribe(update => {
    const active = update.state.port.active; view.selectVessel(active.id, active.typeId);
    if (!previous || previous.screen !== update.state.screen || previous.config !== update.state.config) {
      view.show(update.state.screen, update.state.config, update.state.battle);
      hud.resultPanel.hidden = true; lobby.show(update.state.screen); keys.clear(); pointer.clear();
    }
    previous = update.state;
    ammunition.render(update.state); shipyard.render(update.state); controls.render(update.state);
    if (update.state.battle) for (const event of update.events) {
      view.present(event, update.state.battle); if (event.type === 'result') { keys.clear(); pointer.clear(); }
    }
  });
  let lastTime = performance.now(), frameId = 0;
  const visibility = () => { lastTime = performance.now(); application.advance(0, document.hidden); pointer.clear(); };
  document.addEventListener('visibilitychange', visibility);
  function frame(now: number): void {
    const seconds = Math.max(0, (now - lastTime) / 1000); lastTime = now;
    application.advance(seconds, document.hidden);
    const current = state(), rendered = view.render(current.battle, current.port.active.mount,
      document.hidden ? 0 : Math.min(seconds, 0.1), pointer.read());
    if (rendered.browsing) message('浏览远处 · C返回本舰');
    if (current.battle) hud.battle(current.battle);
    const guns = current.battle?.ships.find(s => s.side === 'player')?.weapons ?? current.port.active.guns;
    hud.navigation(rendered.navigation, current.screen === 'yard', guns.map((gun, index) => ({
      reload: gun.reload, reloadSeconds: current.config?.ships.find(s => s.side === 'player')?.weapons[index]?.reloadSeconds ??
        content.originalData.guns.find(g => g.id === current.port.active.weapons[index])?.reloadSeconds ?? RELOAD_SECONDS
    })), MAX_SPEED);
    overlays.render(current, rendered);
    status.textContent = current.screen !== 'battle' && current.screen !== 'yard' ? lobby.getStatus() : current.message ||
      (current.port.active.weapons.some(w => w !== null) ? '左键锁定瞄准 · 右键航线 · 空格齐射 · F加速/V减速' : '未装备主炮 · 请在船厂配置');
    frameId = requestAnimationFrame(frame);
  }
  application.navigate('warzone'); frameId = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(frameId); document.removeEventListener('visibilitychange', visibility);
    unbindKeyboard(); pointer.dispose(); unsubscribe(); application.end(); view.dispose();
  };
}
