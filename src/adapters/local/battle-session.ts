import type { BattleCommand, BattleConfig, BattleSession, Observation, SessionUpdate } from '../../domain/battle.ts';
import { BattleSimulation, STEP_SECONDS } from '../../simulation/battle.ts';
import { freeze } from '../../simulation/config.ts';

export class LocalBattleSession implements BattleSession {
  private readonly simulation: BattleSimulation;
  private accumulator = 0;
  private pending = new Map<number, BattleCommand[]>();
  private listeners = new Set<(update: SessionUpdate) => void>();
  private current: Observation;
  private phase: BattleSession['status'] = 'running';
  constructor(config: BattleConfig) {
    this.simulation = new BattleSimulation(config);
    this.current = freeze(structuredClone(this.simulation.state));
  }
  get status(): BattleSession['status'] { return this.phase; }
  get config() { return this.simulation.config; }
  observe(): Observation { return this.current; }
  send(command: BattleCommand, tick = this.current.tick + 1): void {
    if (this.phase === 'ended') throw new Error('战斗会话已经结束');
    if (!Number.isSafeInteger(tick) || tick <= this.current.tick) throw new RangeError('指令时刻必须是未来模拟步');
    const commands = this.pending.get(tick) ?? [];
    commands.push(structuredClone(command));
    this.pending.set(tick, commands);
  }
  subscribe(listener: (update: SessionUpdate) => void): () => void {
    if (this.phase === 'ended') throw new Error('战斗会话已经结束');
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  advance(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('会话时间无效');
    if (this.phase !== 'running') return;
    this.accumulator += seconds;
    // Catch up all elapsed simulation time; never silently discard a stalled frame.
    while (this.phase === 'running' && this.accumulator + 1e-10 >= STEP_SECONDS) {
      const tick = this.simulation.state.tick + 1;
      const events = this.simulation.step(this.pending.get(tick) ?? []);
      this.pending.delete(tick);
      this.accumulator = Math.max(0, this.accumulator - STEP_SECONDS);
      this.current = freeze(structuredClone(this.simulation.state));
      const update = freeze({ observation: this.current, events });
      for (const listener of this.listeners) listener(update);
    }
  }
  pause(paused: boolean): void {
    if (this.phase === 'ended') throw new Error('战斗会话已经结束');
    this.phase = paused ? 'paused' : 'running';
  }
  end(): void { this.phase = 'ended'; this.pending.clear(); this.listeners.clear(); }
}
