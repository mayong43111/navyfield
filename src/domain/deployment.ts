// Preserve the current single-ship deployment mapping; fleet formation is deferred.
export const FORMATION_COLUMNS = 6;
export const FORMATION_PAGE_SIZE = 48;
export interface BattleDeployment { team: 'alpha' | 'bravo'; slot: number }
