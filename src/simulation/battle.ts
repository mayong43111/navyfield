import type { BattleCommand, BattleConfig, BattleEvent, DeepReadonly, EventId, ProjectileId,
  ProjectileState, ShipState, Side, WorldState, Point, Locker, ShellType } from '../domain/battle.ts';
import { freezeConfig } from './config.ts';
import { advanceNavigation, advanceRoute, createRoute, ballisticRange, GRAVITY } from './navigation.ts';
import { createCombat, applyImpact, resolveBattle, enemyCourse, leadTarget, ballisticVelocity,
  dispersedTarget, hullIntersection } from './combat.ts';
import { fireGun } from './ammunition.ts';
import { aimWeapon, muzzleCenter, muzzlePoints } from './weapons.ts';
import { nextRandom } from './random.ts';

export const STEP_SECONDS = 1 / 30;
type EventPayload = BattleEvent extends infer E ? E extends BattleEvent ? Omit<E, 'id' | 'tick'> : never : never;
interface FireIntent { aim: Point; magazines: { locker: Locker; shellType: ShellType }[] }
const lockerName = { A: '甲', B: '乙' };
const shellName = { HE: '高爆弹', AP: '穿甲弹' };

export class BattleSimulation {
  readonly config: DeepReadonly<BattleConfig>;
  readonly state: WorldState;
  private nextProjectile = 0;
  private nextEvent = 0;
  private events: BattleEvent[] = [];

  constructor(input: BattleConfig) {
    this.config = freezeConfig(input);
    const player = this.config.ships.find(s => s.side === 'player')!;
    const enemy = this.config.ships.find(s => s.side === 'enemy')!;
    const combat = createCombat(player.hp, enemy.hp, player.protection);
    combat.enemy.protection = combat.enemy.maxProtection = enemy.protection;
    this.state = { tick: 0, randomState: input.seed >>> 0, combat, aim: { ...this.config.aim }, tda: false,
      drive: 0, rudder: 0, resultSeconds: 0, projectiles: [],
      ships: this.config.ships.map(definition => ({ id: definition.id, side: definition.side,
        navigation: { ...definition.spawn }, route: null,
        weapons: definition.weapons.map(w => ({ id: w.id, yaw: w.rear ? Math.PI : 0, elevation: 0,
          recoil: 0, aimState: 'turning', reload: definition.side === 'enemy' ? 7 : 0,
          ammunition: structuredClone(w.ammunition) })) })) };
  }

  private emit(event: EventPayload): void {
    this.events.push({ ...event, id: `event-${this.nextEvent++}` as EventId, tick: this.state.tick });
  }
  private random = (): number => {
    const next = nextRandom(this.state.randomState);
    this.state.randomState = next.state;
    return next.value;
  };
  private ship(side: Side): ShipState { return this.state.ships.find(s => s.side === side)!; }

  private command(command: BattleCommand): boolean {
    const player = this.ship('player');
    if (this.state.combat.result) {
      this.emit({ type: 'rejected', command: command.type, message: '战斗已经结束' });
      return false;
    }
    switch (command.type) {
      case 'steer':
        if (![command.drive, command.rudder].every(v => Number.isFinite(v) && Math.abs(v) <= 1)) {
          throw new RangeError('航行输入无效');
        }
        this.state.drive = command.drive; this.state.rudder = command.rudder;
        if (command.drive || command.rudder) player.route = null;
        break;
      case 'power':
        if (!Number.isFinite(command.step)) throw new RangeError('动力指令无效');
        player.navigation.throttle = Math.max(-0.3, Math.min(1, player.navigation.throttle + command.step));
        player.route = null;
        break;
      case 'aim':
        if (!Object.values(command.point).every(Number.isFinite)) throw new RangeError('瞄准点无效');
        this.state.aim = { ...command.point, y: 0.5 };
        break;
      case 'route': player.route = createRoute(player.navigation, command.point); break;
      case 'tda':
        if (typeof command.enabled !== 'boolean') throw new RangeError('炮塔加速指令无效');
        this.state.tda = command.enabled; break;
      case 'locker':
      case 'shell-type': {
        const weapon = player.weapons[command.weapon];
        if (!weapon || !['A', 'B'].includes(command.locker)) throw new RangeError('主炮或弹仓不存在');
        if (command.type === 'locker') weapon.ammunition.selected = command.locker;
        else {
          if (!['HE', 'AP'].includes(command.shellType)) throw new RangeError('弹种无效');
          weapon.ammunition.lockers[command.locker].shellType = command.shellType;
        }
        break;
      }
      case 'fire': return true;
      default: throw new Error('未知战斗命令');
    }
    return false;
  }

  private fire(side: Side, index: number, target: Point,
    magazine?: FireIntent['magazines'][number]): { count: number; message: string } {
    const ship = this.ship(side), weapon = ship.weapons[index]!;
    const definition = this.config.ships.find(s => s.side === side)!.weapons[index]!;
    const prefix = `${index + 1}号炮`;
    if (!definition.installed) return { count: 0, message: `${prefix}未装备` };
    if (!definition.power) return { count: 0, message: `${prefix}弹药资料未取得，不能开火` };
    if (!definition.ballistics || definition.reloadSeconds === null) {
      return { count: 0, message: `${prefix}弹道资料未取得，不能开火` };
    }
    const firingState = { ...weapon };
    aimWeapon(ship.navigation, definition, firingState, target, 0, false);
    if (firingState.aimState !== 'aligned') return { count: 0, message: '' };
    const gun = magazine ? { reload: weapon.reload, ammunition: structuredClone(weapon.ammunition) } : weapon;
    if (magazine) {
      gun.ammunition.selected = magazine.locker;
      gun.ammunition.lockers[magazine.locker].shellType = magazine.shellType;
    }
    const shot = fireGun(gun, definition.muzzles.length, definition.reloadSeconds);
    const description = `${prefix}${lockerName[gun.ammunition.selected]}仓`;
    if (!shot.fired) return { count: 0, message: `${description} ${shot.reason === 'empty' ? '弹仓备弹不足' : '正在装填'}` };
    if (magazine) {
      weapon.reload = gun.reload;
      weapon.ammunition.lockers[magazine.locker].remaining = gun.ammunition.lockers[magazine.locker].remaining;
    }
    for (const muzzle of muzzlePoints(ship.navigation, definition, firingState)) {
      const range = ballisticRange(muzzle.y - target.y, definition.ballistics.maxAngle, definition.ballistics.speed);
      const velocity = ballisticVelocity(muzzle,
        dispersedTarget(muzzle, target, this.random, range * (1 - 1e-9)), definition.ballistics.speed);
      if (!velocity) throw new Error('炮弹目标超出弹道范围');
      const projectile: ProjectileState = { id: `projectile-${this.nextProjectile++}` as ProjectileId, owner: side,
        position: muzzle, velocity, shellType: side === 'enemy' ? 'HE' : shot.shellType,
        power: { ...definition.power }, elevation: Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z)) };
      this.state.projectiles.push(projectile);
      this.state.combat[side].shots++;
      this.emit({ type: 'launched', projectile: structuredClone(projectile), weapon: index });
    }
    weapon.recoil = 1.8;
    this.emit({ type: 'fired', owner: side, weapon: index,
      position: muzzleCenter(ship.navigation, definition, firingState) });
    return { count: definition.muzzles.length, message: `${description} ${shellName[shot.shellType]}` };
  }

  step(commands: readonly BattleCommand[] = []): BattleEvent[] {
    this.events = [];
    this.state.tick++;
    const fireOrders: FireIntent[] = [];
    for (const command of commands) {
      try {
        if (this.command(command)) fireOrders.push({ aim: { ...this.state.aim },
          magazines: this.ship('player').weapons.map(weapon => {
            const locker = weapon.ammunition.selected;
            return { locker, shellType: weapon.ammunition.lockers[locker].shellType };
          }) });
      }
      catch (error) {
        this.emit({ type: 'rejected', command: command.type,
          message: error instanceof Error ? error.message : String(error) });
      }
    }
    const before = this.state.ships.map(s => ({ ...s.navigation }));
    const dt = STEP_SECONDS, state = this.state;
    const player = this.ship('player'), enemy = this.ship('enemy');
    if (!state.combat.result) {
      if (player.route) {
        if (advanceRoute(player.navigation, player.route, dt)) {
          player.route = null; this.emit({ type: 'message', message: '已到达航点' });
        }
      } else advanceNavigation(player.navigation, state.drive, state.rudder, dt);
      const course = enemyCourse(enemy.navigation, player.navigation);
      enemy.navigation.throttle = course.throttle;
      advanceNavigation(enemy.navigation, 0, course.rudder, dt);
    }
    for (const ship of state.ships) {
      const definition = this.config.ships.find(s => s.id === ship.id)!;
      for (const [index, weapon] of ship.weapons.entries()) {
        weapon.reload = Math.max(0, weapon.reload - dt);
        weapon.recoil = Math.max(0, weapon.recoil - dt * 3);
        if (state.combat.result) continue;
        const profile = definition.weapons[index]!;
        const target = ship.side === 'player' ? state.aim : leadTarget(
          muzzleCenter(ship.navigation, profile, weapon), player.navigation, profile.ballistics?.speed);
        aimWeapon(ship.navigation, profile, weapon, target, dt, ship.side === 'player' && state.tda);
        if (ship.side === 'enemy') this.fire('enemy', index, target);
      }
    }
    for (const order of fireOrders) {
      let count = 0;
      const fired: string[] = [], blocked: string[] = [];
      for (const index of player.weapons.keys()) {
        const result = this.fire('player', index, order.aim, order.magazines[index]);
        count += result.count;
        if (result.message) (result.count ? fired : blocked).push(result.message);
      }
      this.emit({ type: 'message', message: count
        ? `${count} 发 · ${fired.join(' · ')}${blocked.length ? ` · ${blocked.join(' · ')}` : ''}`
        : blocked.join(' · ') || '所选炮塔正在转向或目标超出射界，请稍候 / 改变瞄准方向' });
    }
    const survivors: ProjectileState[] = [];
    for (const projectile of state.projectiles) {
      const from = { ...projectile.position }, to = projectile.position;
      to.x += projectile.velocity.x * dt; to.z += projectile.velocity.z * dt;
      to.y += projectile.velocity.y * dt - 0.5 * GRAVITY * dt * dt;
      projectile.velocity.y -= GRAVITY * dt;
      const target = projectile.owner === 'player' ? enemy : player;
      const targetIndex = state.ships.indexOf(target);
      const collision = !state.combat.result && state.combat[target.side].hp > 0 ? hullIntersection(from, to,
        before[targetIndex]!, target.navigation, this.config.ships.find(s => s.id === target.id)!.dimensions) : null;
      const water = to.y <= 0 ? from.y / (from.y - to.y) : Infinity;
      const fraction = collision !== null && collision <= water ? collision : water;
      if (fraction === Infinity) { survivors.push(projectile); continue; }
      const position = { x: from.x + (to.x - from.x) * fraction,
        y: from.y + (to.y - from.y) * fraction, z: from.z + (to.z - from.z) * fraction };
      if (collision !== null && collision <= water) {
        const damage = applyImpact(state.combat, projectile.owner, projectile.power,
          projectile.shellType, projectile.elevation);
        if (damage) this.emit({ type: 'impact', owner: projectile.owner, target: target.side,
          shellType: projectile.shellType, position, damage });
      } else this.emit({ type: 'splash', shellType: projectile.shellType,
        position: { ...position, y: 0.5 }, projectileId: projectile.id });
    }
    state.projectiles = survivors;
    const priorResult = state.combat.result;
    const result = resolveBattle(state.combat);
    for (const ship of state.ships) {
      const combat = state.combat[ship.side];
      if (combat.hp <= 0) {
        if (combat.sinking === 0) this.emit({ type: 'sunk', side: ship.side });
        combat.sinking += dt;
      }
      if (result) { ship.route = null; ship.navigation.speed = ship.navigation.throttle = 0; }
    }
    if (result) {
      state.drive = state.rudder = 0; state.resultSeconds += dt;
      if (!priorResult) this.emit({ type: 'result', result });
    }
    return this.events;
  }
}
