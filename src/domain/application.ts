import type { BattleConfig, BattleEvent, DeepReadonly, Observation } from './battle.ts';
import type { PortObservation } from './port.ts';

export type Screen = 'home' | 'warzone' | 'prepare' | 'briefing' | 'battle' | 'results' | 'yard';
export interface ApplicationState {
  screen: Screen; port: PortObservation; battle: Observation | null;
  config: DeepReadonly<BattleConfig> | null; message: string;
}
export interface ApplicationUpdate { state: Readonly<ApplicationState>; events: readonly DeepReadonly<BattleEvent>[] }
