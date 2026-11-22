import type { BattleCommand, BattleConfig, BattleEvent, BattleSession, DeepReadonly, Locker } from '../domain/battle.ts';
import type { ApplicationState, ApplicationUpdate } from '../domain/application.ts';
export type { ApplicationState, ApplicationUpdate } from '../domain/application.ts';
import type { PortCommand, PortObservation } from '../domain/port.ts';
import type { Screen, BattleDeployment } from '../game/lobby-state.ts';
import { PortController } from '../game/port-controller.ts';
import { freeze } from '../simulation/config.ts';

export class ApplicationController {
  private session: BattleSession | null = null;
  private screen: Screen = 'warzone';
  private message = '';
  private listeners = new Set<(update: ApplicationUpdate) => void>();
  readonly port: PortController;
  private battleConfig: (port: PortObservation, deployment: BattleDeployment) => BattleConfig;
  private sessionFactory: (config: BattleConfig) => BattleSession;
  constructor(port: PortController,
    battleConfig: (port: PortObservation, deployment: BattleDeployment) => BattleConfig,
    sessionFactory: (config: BattleConfig) => BattleSession) {
    this.port = port; this.battleConfig = battleConfig; this.sessionFactory = sessionFactory;
    port.subscribe(() => this.publish());
  }
  observe(): Readonly<ApplicationState> {
    return freeze({ screen: this.screen, port: this.port.observe(), battle: this.session?.observe() ?? null,
      config: this.session?.config ?? null, message: this.message });
  }
  subscribe(listener: (update: ApplicationUpdate) => void): () => void {
    this.listeners.add(listener); return () => this.listeners.delete(listener);
  }
  private publish(events: readonly DeepReadonly<BattleEvent>[] = []): void {
    const update = freeze({ state: this.observe(), events });
    for (const listener of this.listeners) listener(update);
  }
  setMessage(message: string): void { this.message = message; this.publish(); }
  navigate(next: Screen, deployment?: BattleDeployment): void {
    if (next === 'battle' && !deployment) throw new Error('出击缺少所选舰阵位');
    const session = next === 'battle' ? this.sessionFactory(this.battleConfig(this.port.observe(), deployment!)) : null;
    const inventory = this.session?.observe().ships.find(s => s.side === 'player')?.weapons;
    this.session?.end(); this.session = null;
    if (inventory) this.port.acceptBattleInventory(inventory);
    this.screen = next; this.session = session; this.message = next === 'yard' ? '右键旋转，滚轮缩放' : '';
    session?.subscribe(update => {
      for (const event of update.events) {
        if (event.type === 'message' || event.type === 'rejected') this.message = event.message;
        if (event.type === 'impact') this.message = event.owner === 'player'
          ? `命中敌舰 · 伤害 ${event.damage}` : `本舰中弹 · 损失 ${event.damage}`;
      }
      if (update.observation.combat.result) {
        this.message = update.observation.combat.result === 'victory' ? '敌舰已击沉' :
          update.observation.combat.result === 'defeat' ? '本舰已沉没' : '双方舰艇均已沉没';
      }
      this.publish(update.events);
    });
    this.publish();
  }
  advance(seconds: number, paused: boolean): void {
    this.session?.pause(paused); this.session?.advance(paused ? 0 : seconds);
  }
  send(command: BattleCommand): void {
    if (this.screen === 'battle') this.session?.send(command);
  }
  portCommand(command: PortCommand): void {
    if (command.type === 'select-weapon') { this.port.send(command); return; }
    if (this.screen === 'battle' && (command.type === 'locker' || command.type === 'shell-type')) {
      this.send(command); return;
    }
    if (this.screen !== 'yard') throw new Error('配装只能在船坞修改');
    this.port.send(command);
  }
  fire(): void {
    if (this.screen !== 'battle') {
      this.setMessage(this.screen === 'yard' ? '舰艇停泊中' : '当前页面不可开炮 · 请进入战斗'); return;
    }
    this.send({ type: 'fire' });
  }
  toggleTDA(): void {
    if (!this.session || this.session.observe().combat.result) return;
    const enabled = !this.session.observe().tda;
    this.send({ type: 'tda', enabled }); this.setMessage(enabled ? '炮塔加速开启' : '炮塔加速关闭');
  }
  toggleLockers(): void {
    const state = this.session?.observe();
    const weapons = state?.ships.find(s => s.side === 'player')?.weapons;
    if (!weapons?.length) throw new Error('No selected weapon bank');
    const reference = weapons[this.port.observe().active.mount] ?? weapons[0]!;
    const locker: Locker = reference.ammunition.selected === 'A' ? 'B' : 'A';
    for (const weapon of weapons.keys()) this.send({ type: 'locker', weapon, locker });
    this.setMessage(`炮组已切换至${locker === 'A' ? '甲' : '乙'}仓`);
  }
  reset(): void {
    if (this.screen === 'battle') { this.setMessage('战斗中不能重置舰艇'); return; }
    if (this.screen === 'yard') { this.port.send({ type: 'reset-ammunition' }); this.navigate('yard'); }
  }
  end(): void { this.session?.end(); this.session = null; this.listeners.clear(); }
}
