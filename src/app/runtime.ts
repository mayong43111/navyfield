import type { GameContent } from './content.ts';
import { ApplicationController } from './controller.ts';
import { LocalBattleSession } from '../adapters/local/battle-session.ts';
import { createTargetBattleConfig } from '../adapters/local/target-battle-config.ts';
import { createTargetPort } from '../adapters/local/target-port-content.ts';
import { createShip } from '../ships.ts';
import { createMissingModel } from '../presentation/ships/missing-model.ts';
import { createBattleView } from '../presentation/battle-view.ts';
import { createLobby } from '../ui/lobby-controller.ts';
import { createBattleHud } from '../ui/battle-hud.ts';
import { createTargetWeaponPanel } from '../ui/target-weapons.ts';
import '../ui/target-weapons.css';
import { createShipyardController } from '../ui/shipyard-controller.ts';
import { createBattleControls } from '../ui/battle-controls.ts';
import { createOverlays } from '../ui/overlays.ts';
import { tacticalMapScale } from '../ui/tactical-map.ts';
import { bindBattleKeyboard } from '../input/battle-input.ts';
import { bindBattlePointer } from '../input/battle-pointer.ts';
import type { VesselVisualContract } from '../domain/port.ts';
import type { ApplicationState } from '../domain/application.ts';

export function startApplication(canvas: HTMLCanvasElement, status: HTMLElement, content: GameContent): () => void {
  const vessel = (typeId: string) => {
    const ship = content.target.ships[typeId];
    if (!ship) throw new Error(`舰型不存在：${typeId}`);
    const entry = content.modelCatalog.targetModels.find(model => model.shipId === typeId);
    if (!entry?.runtimeAsset) return createMissingModel(typeId, ship.name, ship.length_u, ship.beam_u);
    const visual = createShip(content.models, entry.modelId);
    const description = entry.status === 'local_original' ? '自研低模（非精确史实）' : '现有参考模型（上游权利待核）';
    return { ...visual, modelName: `${ship.name} · ${description}` };
  };
  const view = createBattleView(canvas, content.models, vessel), port = createTargetPort(content.target);
  const contract = (typeId: string): VesselVisualContract => {
    const ship = content.target.ships[typeId]!, visual = view.contract(typeId);
    return { ...visual, dimensions: { length: ship.length_u, beam: ship.beam_u, height: ship.beam_u },
      mounts: Array.from({ length: ship.main_mounts }, (_, i) => ({ rear: i >= Math.ceil(ship.main_mounts / 2), barrelCount: ship.main_barrels })) };
  };
  const initial = port.observe().active; view.selectVessel(initial.id, initial.typeId);
  const application = new ApplicationController(port, (state, deployment) => {
    return createTargetBattleConfig(content.target, { typeId: state.active.typeId,
      bulgeLevel: state.active.bulgeLevel, weapons: state.active.weapons,
      ammunition: structuredClone(state.active.guns.map(g => g.ammunition)) },
    deployment, crypto.getRandomValues(new Uint32Array(1))[0]!);
  }, config => new LocalBattleSession(config));
  const state = () => application.observe(), message = (text: string) => application.setMessage(text);
  const hud = createBattleHud();
  const ammunition = createTargetWeaponPanel({ content: content.target, state,
    send: command => application.send(command), portCommand: command => application.portCommand(command) });
  const overlays = createOverlays(ammunition.pins);
  const shipyard = createShipyardController({ data: content.originalData, matches: content.shipModelMatches,
    state, contract, preview: view.preview, command: command => application.portCommand(command),
    durability: hud.durability, protection: hud.protection, message,
    protectionValue: id => content.target.ships[id]!.bulge_hp,
    particulars: id => {
      const ship = content.target.ships[id]!, armor = content.target.armor[ship.armor_id]!, profile = content.target.profiles[id]!;
      const banks = Object.values(content.target.automation).filter(bank => bank.ship_id === id);
      return [['舰体耐久', String(ship.hp)], ['定位', profile.role], ['优势', profile.strength], ['代价', profile.weakness],
        ['航速/初速', `${ship.speed_u_s}/${ship.initial_speed_u_s} u/s`], ['加速度', `${ship.acceleration_u_s2} u/s²`],
        ['转弯半径', `${ship.turn_radius_u} u`], ['舷侧/甲板', `${armor.belt_mm}/${armor.deck_mm} 抽象mm`],
        ['舰长/舰宽', `${ship.length_u}/${ship.beam_u} 压缩u（非米）`], ['主武器', `${content.target.weapons[ship.main_weapon_id]!.name} ${ship.main_mounts}×${ship.main_barrels}`],
        ['第二武器', ship.secondary_weapon_id ? `${content.target.weapons[ship.secondary_weapon_id]!.name} ${ship.secondary_mounts}×${ship.secondary_barrels}` : '无'],
        ['自动小AA', banks.filter(b => b.role === 'aa').map(b => `${content.target.weapons[b.weapon_id]!.name} ${b.mounts}×${b.barrels}`).join(' / ') || '无'],
        ['航空容量', String(ship.aircraft_capacity)], ['防雷防护', String(ship.bulge_hp)], ['模型状态', vessel(id).modelName]];
    } });
  const bulgeInput = document.getElementById('yard-bulge-level') as HTMLInputElement;
  bulgeInput.disabled = true; bulgeInput.title = '目标版防雷防护由舰船统一数据固定，不使用旧版档位倍率';
  const lobby = createLobby((screen, deployment) => {
    application.navigate(screen, deployment);
    if (deployment) overlays.deployment(deployment.team, deployment.slot);
  }, content.land, view.preview, () => ({ name: port.observe().active.name, typeId: port.observe().active.typeId }),
  content.originalData, typeId => {
    const index = port.observe().ships.findIndex(ship => ship.typeId === typeId);
    if (index < 0) return '所选舰不在港口，请先在船坞选择该舰';
    port.send({ type: 'select-berth', index }); return null;
  }, { room: content.target.rooms.duel! });
  const power = (step: number) => {
    const current = state(); if (current.screen !== 'battle' || current.battle?.combat.result) return;
    application.send({ type: 'power', step });
    const throttle = current.battle?.ships.find(s => s.side === 'player')?.navigation.throttle ?? 0;
    message(`发动机动力 ${Math.round(Math.max(-0.3, Math.min(1, throttle + step)) * 100)}%`);
  };
  const controls = createBattleControls({ navigate: screen => application.navigate(screen),
    fire: () => application.fire(), tda: () => application.toggleTDA(), power });
  const pointer = bindBattlePointer({ canvas, map: overlays.map, isBattle: () => state().screen === 'battle',
    blocked: [hud.mapPanel, hud.enginePanel, hud.resultPanel, ammunition.panel],
    scale: () => tacticalMapScale(state().config?.layout ?? null),
    world: (x, y) => {
      const control = state().battle?.target;
      const group = control?.groups.find(g => g.side === 'player' && g.slot === control.selectedSlot);
      return view.aimPoint(x, y, group?.mode === 'air' ? ammunition.aimHeight() : 0);
    }, message,
    order: (button, point) => {
      if (state().battle?.combat.result) return;
      const control = state().battle?.target;
      const group = control?.groups.find(g => g.side === 'player' && g.slot === control.selectedSlot);
      application.send(button === 0 ? { type: 'aim', point: { ...point, y: group?.mode === 'air' ? ammunition.aimHeight() : 0.5 } } : { type: 'route', point });
      message(button === 0 ? '预瞄点已设定 · 空格开火 / 按住渐次' : '航线已设定 · F/V切换手动推进');
    }
  });
  const keys = new Set<string>();
  const unbindKeyboard = bindBattleKeyboard({ keys, isBattle: () => state().screen === 'battle',
    enabled: event => ['battle', 'yard'].includes(state().screen) && !shipyard.dialogOpen() &&
      !(state().screen === 'yard' && event.code === 'Space' && event.target instanceof HTMLButtonElement),
    send: command => application.send(command), clearPointer: pointer.clear,
    release: code => { if (code === 'Space') ammunition.stop(); },
    clearActions: ammunition.stop,
    action: code => {
      if (code === 'Space') {
        const control = state().battle?.target;
        const group = control?.groups.find(g => g.side === 'player' && g.slot === control.selectedSlot);
        if (group?.control === 'manual' && group.pattern === 'gradual') application.send({ type: 'fire-hold', enabled: true });
        else application.fire();
      }
      if (code === 'ControlLeft' || code === 'ControlRight') application.toggleTDA();
      if (code === 'KeyY' && state().screen === 'battle') {
        const control = state().battle?.target;
        const group = control?.groups.find(g => g.side === 'player' && g.slot === control.selectedSlot);
        if (group?.mode === 'surface') application.send({ type: 'shell-type', weapon: 0, locker: 'A', shellType: group.shellType === 'AP' ? 'HE' : 'AP' });
      }
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
  const visibility = () => { lastTime = performance.now(); ammunition.stop(); application.advance(0, document.hidden); pointer.clear(); };
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
        content.originalData.guns.find(g => g.id === current.port.active.weapons[index])?.reloadSeconds ?? 1
    })), content.target.ships[current.port.active.typeId]!.speed_u_s);
    overlays.render(current, rendered);
    status.textContent = current.screen !== 'battle' && current.screen !== 'yard' ? lobby.getStatus() : current.message ||
      (current.port.active.weapons.some(w => w !== null) ? '左键锁定瞄准 · 右键航线 · 空格齐射 · F加速/V减速' : '未装备主炮 · 请在船厂配置');
    frameId = requestAnimationFrame(frame);
  }
  application.navigate('warzone'); frameId = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(frameId); document.removeEventListener('visibilitychange', visibility);
    unbindKeyboard(); pointer.dispose(); unsubscribe(); application.end(); ammunition.dispose(); lobby.dispose(); view.dispose();
  };
}
