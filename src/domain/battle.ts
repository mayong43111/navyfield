export type ShipDefinitionId = string & { readonly __kind: 'ship-definition' };
export type ShipId = string & { readonly __kind: 'ship-instance' };
export type ShipModelId = string & { readonly __kind: 'ship-model' };
export type WeaponId = string & { readonly __kind: 'weapon-instance' };
export type ProjectileId = string & { readonly __kind: 'projectile' };
export type EventId = string & { readonly __kind: 'event' };
export type Side = 'player' | 'enemy';
export type ShellType = 'HE' | 'AP';
export type Locker = 'A' | 'B';
export interface Point { x: number; y: number; z: number }
export interface NavigationState { x: number; z: number; heading: number; speed: number; throttle: number }
export interface NavigationRoute { target: { x: number; z: number }; turn: number; remainingArc: number }
export interface Ammunition {
  selected: Locker;
  lockers: Record<Locker, { shellType: ShellType; remaining: number }>;
}
export interface GunState { ammunition: Ammunition; reload: number }
export interface CombatShip {
  hp: number; maxHp: number; belt: number; deck: number; shots: number; hits: number;
  damage: number; sinking: number; protection: number; maxProtection: number;
}
export type BattleResult = 'victory' | 'defeat' | 'draw';
export interface CombatState { player: CombatShip; enemy: CombatShip; result: BattleResult | null }
export interface ShellPower { he: number; apBonus: number }
export interface GunBallistics { speed: number; maxAngle: number }
export interface WeaponDefinition {
  id: WeaponId;
  rear: boolean;
  mount: Point;
  pivot: Point;
  muzzles: Point[];
  reloadSeconds: number | null;
  ballistics: GunBallistics | null;
  power: ShellPower | null;
  installed: boolean;
  ammunition: Ammunition;
}
export interface ShipDefinition {
  id: ShipId;
  definitionId: ShipDefinitionId;
  side: Side;
  hp: number;
  protection: number;
  dimensions: { beam: number; length: number; height: number };
  spawn: NavigationState;
  weapons: WeaponDefinition[];
}
export interface SpawnRegion {
  team: 'alpha' | 'bravo'; zone: number; minX: number; maxX: number; minZ: number; maxZ: number;
}
export interface BattleLayout { range: number; gap: number; width: number; height: number; regions: SpawnRegion[] }
export interface BattleConfig {
  rulesVersion: 'single-ship-v1';
  seed: number;
  ships: ShipDefinition[];
  layout: BattleLayout;
  aim: Point;
}
export interface WeaponState extends GunState {
  id: WeaponId; yaw: number; elevation: number; recoil: number;
  aimState: 'limited' | 'turning' | 'aligned';
}
export interface ShipState {
  id: ShipId; side: Side; navigation: NavigationState; weapons: WeaponState[];
  route: NavigationRoute | null;
}
export interface ProjectileState {
  id: ProjectileId; owner: Side; position: Point; velocity: Point;
  shellType: ShellType; power: ShellPower; elevation: number;
}
export interface WorldState {
  tick: number; randomState: number; ships: ShipState[]; projectiles: ProjectileState[];
  combat: CombatState; aim: Point; tda: boolean; drive: number; rudder: number; resultSeconds: number;
}
export type DeepReadonly<T> = T extends string | number | boolean | null | undefined ? T :
  T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
export type Observation = DeepReadonly<WorldState>;
export type BattleCommand =
  | { type: 'steer'; drive: number; rudder: number }
  | { type: 'power'; step: number }
  | { type: 'aim'; point: Point }
  | { type: 'route'; point: { x: number; z: number } }
  | { type: 'tda'; enabled: boolean }
  | { type: 'locker'; weapon: number; locker: Locker }
  | { type: 'shell-type'; weapon: number; locker: Locker; shellType: ShellType }
  | { type: 'fire' };
export type BattleEvent = { id: EventId; tick: number } & (
  | { type: 'launched'; projectile: DeepReadonly<ProjectileState>; weapon: number }
  | { type: 'fired'; owner: Side; weapon: number; position: Point }
  | { type: 'impact'; owner: Side; target: Side; position: Point; shellType: ShellType; damage: number }
  | { type: 'splash'; position: Point; shellType: ShellType; projectileId: ProjectileId }
  | { type: 'sunk'; side: Side }
  | { type: 'result'; result: BattleResult }
  | { type: 'message'; message: string }
  | { type: 'rejected'; command: BattleCommand['type']; message: string }
);
export interface SessionUpdate { observation: Observation; events: readonly DeepReadonly<BattleEvent>[] }
export interface BattleSession {
  readonly config: DeepReadonly<BattleConfig>;
  send(command: BattleCommand, tick?: number): void;
  observe(): Observation;
  subscribe(listener: (update: SessionUpdate) => void): () => void;
  advance(seconds: number): void;
  pause(paused: boolean): void;
  end(): void;
  readonly status: 'running' | 'paused' | 'ended';
}
