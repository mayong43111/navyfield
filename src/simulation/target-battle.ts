import type { BattleCommand, BattleConfig, BattleEvent, DeepReadonly, EventId, NavigationState, Point,
  ProjectileId, ProjectileState, ShipState, Side, WorldState } from '../domain/battle.ts';
import type { AircraftState, TargetContent, TargetControlState, TargetGroupDefinition, TargetWeaponGroupState } from '../domain/target-content.ts';
import { createCombat, hullIntersection, resolveBattle } from './combat.ts';
import { freezeTargetConfig } from './target-config.ts';
import { moveTargetAircraft, type TargetAircraftAction } from './target-aircraft.ts';
import { createTargetGroup, targetMode, setTargetMode, setTargetShell, readyTargetTubes,
  consumeTargetTubes, setTargetAutomatic, cycleTargetAmmo } from './target-weapons.ts';
import { angleDelta, degrees, radians, targetRange, targetTrajectory, targetIntercept, targetDispersion,
  targetDamage, targetNavigation } from './target-physics.ts';
import { nextRandom } from './random.ts';
import { STEP_SECONDS } from './battle.ts';

type Payload = BattleEvent extends infer E ? E extends BattleEvent ? Omit<E, 'id' | 'tick'> : never : never;
const opponent = (side: Side): Side => side === 'player' ? 'enemy' : 'player';
const interpolate = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

export class TargetBattleSimulation {
  readonly config: DeepReadonly<BattleConfig>;
  readonly state: WorldState;
  private readonly content: TargetContent;
  private readonly definitions: TargetGroupDefinition[];
  private readonly controls: TargetControlState;
  private nextProjectile = 0;
  private nextAircraft = 0;
  private nextEvent = 0;
  private events: BattleEvent[] = [];
  private fires: Record<Side, number[]> = { player: [], enemy: [] };

  constructor(input: BattleConfig) {
    this.config = freezeTargetConfig(input);
    this.content = structuredClone(this.config.target!.content) as TargetContent;
    this.definitions = structuredClone(this.config.target!.groups) as TargetGroupDefinition[];
    const room = this.content.rooms.duel!;
    this.controls = { selectedSlot: 'main', selectedMount: null, selectedBattery: 'all', fireHeld: false, aimValid: false,
      groups: this.definitions.map(d => createTargetGroup(this.content, d, room.initial_reload_s)) };
    const ships = this.config.ships;
    const combat = createCombat(ships[0]!.hp, ships[1]!.hp, ships[0]!.protection);
    combat.enemy.protection = combat.enemy.maxProtection = ships[1]!.protection;
    for (const side of ['player', 'enemy'] as const) {
      const source = this.content.ships[ships.find(s => s.side === side)!.definitionId]!;
      combat[side].belt = this.content.armor[source.armor_id]!.belt_mm;
      combat[side].deck = this.content.armor[source.armor_id]!.deck_mm;
      this.fires[side] = [];
    }
    this.state = { tick: 0, randomState: input.seed >>> 0, combat, aim: { ...this.config.aim },
      tda: false, drive: 0, rudder: 0, resultSeconds: 0, projectiles: [], aircraft: [], target: this.controls,
      ships: ships.map(s => ({ id: s.id, side: s.side, navigation: { ...s.spawn }, route: null,
        weapons: s.weapons.map(w => ({ id: w.id, yaw: w.rear ? Math.PI : 0, elevation: 0,
          recoil: 0, aimState: 'turning', reload: room.initial_reload_s, ammunition: structuredClone(w.ammunition) })) })) };
  }
  private get time(): number { return this.state.tick * STEP_SECONDS; }
  private ship(side: Side): ShipState { return this.state.ships.find(s => s.side === side)!; }
  private source(side: Side) { return this.content.ships[this.config.ships.find(s => s.side === side)!.definitionId]!; }
  private definition(group: TargetWeaponGroupState): TargetGroupDefinition { return this.definitions.find(d => d.id === group.id)!; }
  private selected(): TargetWeaponGroupState {
    const group = this.controls.groups.find(g => g.side === 'player' && g.slot === this.controls.selectedSlot);
    if (!group) throw new Error('该炮位没有装备');
    return group;
  }
  private emit(payload: Payload): void { this.events.push({ ...payload, id: `target-event-${this.nextEvent++}` as EventId, tick: this.state.tick }); }
  private random = (): number => { const result = nextRandom(this.state.randomState); this.state.randomState = result.state; return result.value; };
  private resetHold(): void { this.controls.fireHeld = false; }
  private command(command: BattleCommand): void {
    if (this.state.combat.result) throw new Error('战斗已经结束');
    const player = this.ship('player');
    switch (command.type) {
      case 'steer':
        if (![command.drive, command.rudder].every(v => Number.isFinite(v) && Math.abs(v) <= 1)) throw new Error('航行输入无效');
        this.state.drive = command.drive; this.state.rudder = command.rudder;
        if (command.drive || command.rudder) player.route = null;
        break;
      case 'power':
        if (!Number.isFinite(command.step)) throw new Error('动力输入无效');
        player.navigation.throttle = Math.max(-0.3, Math.min(1, player.navigation.throttle + command.step)); player.route = null;
        break;
      case 'route':
        if (![command.point.x, command.point.z].every(Number.isFinite)) throw new Error('航路无效');
        player.route = { target: { ...command.point }, turn: 0, remainingArc: 0 };
        break;
      case 'aim': {
        if (![command.point.x, command.point.y, command.point.z].every(Number.isFinite)) throw new Error('预瞄无效');
        this.state.aim = { ...command.point };
        this.controls.aimValid = true;
        break;
      }
      case 'tda':
        if (typeof command.enabled !== 'boolean') throw new Error('炮塔指令无效');
        this.state.tda = command.enabled; break;
      case 'weapon-slot': {
        if (!this.controls.groups.some(g => g.side === 'player' && g.slot === command.slot)) throw new Error('该炮位为空');
        if (command.slot !== this.controls.selectedSlot) {
          this.controls.selectedSlot = command.slot; this.controls.selectedMount = null; this.controls.selectedBattery = 'all'; this.controls.aimValid = false; this.resetHold();
        }
        break;
      }
      case 'weapon-mount': {
        const group = this.selected();
        if (group.control !== 'manual' || this.content.weapons[group.weaponId]!.kind !== 'gun' ||
          command.mount !== null && (!Number.isInteger(command.mount) || command.mount < 0 || command.mount >= group.mounts)) throw new Error('手动炮座选择无效');
        if (this.controls.selectedMount !== command.mount || this.controls.selectedBattery !== 'all') {
          this.controls.selectedMount = command.mount; this.controls.selectedBattery = 'all'; this.resetHold();
        }
        break;
      }
      case 'weapon-battery': {
        const group = this.selected();
        if (group.control !== 'manual' || this.content.weapons[group.weaponId]!.kind !== 'gun' ||
          !['all', 'fore', 'aft'].includes(command.battery)) throw new Error('该武器不开放手动前后炮组选择');
        this.controls.selectedBattery = command.battery; this.controls.selectedMount = null; this.resetHold();
        break;
      }
      case 'weapon-ammo-cycle': {
        const group = this.selected();
        if (cycleTargetAmmo(this.content, this.definition(group), group, this.time)) {
          this.controls.aimValid = false; this.resetHold();
        }
        break;
      }
      case 'weapon-mode': {
        const group = this.selected();
        if (setTargetMode(this.content, this.definition(group), group, command.mode, this.time)) {
          this.controls.aimValid = false; this.resetHold();
        }
        break;
      }
      case 'firing-pattern': {
        const group = this.selected();
        if (group.control !== 'manual' || this.content.weapons[group.weaponId]!.kind !== 'gun' ||
          !['salvo', 'gradual'].includes(command.pattern)) throw new Error('该武器不开放舰炮射击方式');
        if (command.pattern !== group.pattern) { group.pattern = command.pattern; this.resetHold(); }
        break;
      }
      case 'automatic': {
        const groups = this.controls.groups.filter(g => g.side === 'player' && g.slot === command.slot);
        if (!groups.length || groups.some(g => g.control !== 'automatic')) throw new Error('该炮位不是自动炮组');
        for (const group of groups) setTargetAutomatic(group, command.enabled);
        break;
      }
      case 'fire-hold': {
        if (typeof command.enabled !== 'boolean') throw new Error('持续开火指令无效');
        const group = this.selected();
        if (command.enabled && (group.control !== 'manual' || group.pattern !== 'gradual' || this.content.weapons[group.weaponId]!.kind !== 'gun')) throw new Error('只有手动舰炮渐次允许按住开火');
        this.controls.fireHeld = command.enabled; break;
      }
      case 'shell-type': {
        const group = this.selected();
        if (!group || !['A', 'B'].includes(command.locker) || !Number.isInteger(command.weapon) || command.weapon < 0 || command.weapon >= group.mounts) throw new Error('主炮或弹仓不存在');
        if (setTargetShell(this.content, this.definition(group), group, command.shellType, this.time)) this.resetHold();
        break;
      }
      case 'locker': {
        const group = this.controls.groups.find(g => g.side === 'player' && g.slot === 'main');
        if (!group || !['A', 'B'].includes(command.locker) || !Number.isInteger(command.weapon) || command.weapon < 0 || command.weapon >= group.mounts) throw new Error('主炮或弹仓不存在');
        // Locker names are a legacy display alias, not a second target ammunition pool.
        const weapon = player.weapons[command.weapon];
        if (!weapon) throw new Error('该主武器没有舰炮弹仓');
        weapon.ammunition.selected = command.locker; break;
      }
      case 'fire': this.manualFire(this.selected(), this.state.aim, this.controls.selectedMount, this.controls.aimValid); break;
      default: throw new Error('未知目标战斗命令');
    }
  }
  private origin(group: TargetWeaponGroupState, mount: number): Point {
    const ship = this.ship(group.side).navigation, source = this.source(group.side);
    const offset = source.length_u * (0.5 - (mount + 1) / (group.mounts + 1));
    return { x: ship.x + Math.sin(ship.heading) * offset, y: source.beam_u,
      z: ship.z + Math.cos(ship.heading) * offset };
  }
  private reachable(group: TargetWeaponGroupState, point: Point, mount: number): void {
    const source = this.source(group.side), origin = this.origin(group, mount), nav = this.ship(group.side).navigation;
    const distance = Math.hypot(point.x - nav.x, point.z - nav.z), weapon = this.content.weapons[group.weaponId]!, mode = targetMode(this.content, group);
    if (distance > this.content.rules.detection_range || (mode.range_u > 0 && distance > mode.range_u) ||
      (weapon.kind !== 'gun' && distance > weapon.range_u)) throw new Error('目标不可见或超出射程');
    // Numeric target mounts use hull-derived positions, not model geometry. A ray through the
    // hull's central deck block is obstructed; broadside fire remains possible from both ends.
    const localForward = (point.x - origin.x) * Math.sin(nav.heading) + (point.z - origin.z) * Math.cos(nav.heading);
    const localAcross = (point.x - origin.x) * Math.cos(nav.heading) - (point.z - origin.z) * Math.sin(nav.heading);
    const offset = source.length_u * (0.5 - (mount + 1) / (group.mounts + 1));
    if (weapon.kind === 'gun' && group.mounts > 1 && offset * localForward < 0 &&
      Math.abs(localAcross) < Math.abs(localForward) * source.beam_u / source.length_u) throw new Error('炮座射线被舰体遮挡');
    if (weapon.kind === 'gun' && !targetTrajectory(origin, point, weapon.muzzle_u_s, this.content.rules.gravity,
      mode.max_elevation_deg || weapon.max_elevation_deg)) throw new Error('低弧弹道不可达或仰角超限');
  }
  private manualFire(group: TargetWeaponGroupState, point: Point, mount: number | null, valid: boolean): void {
    if (group.control !== 'manual') throw new Error('自动炮组不能手动开火');
    if (!valid) throw new Error('请为当前用途重新指定有效预瞄');
    const weapon = this.content.weapons[group.weaponId]!;
    if (group.mode === 'surface' && point.y > this.source(opponent(group.side)).beam_u) throw new Error('对舰用途不能攻击飞机目标');
    if (group.mode === 'air' && (point.y <= 0.5 || !this.state.aircraft!.some(a => a.owner !== group.side && a.hp > 0 &&
      Math.hypot(a.position.x - this.ship(group.side).navigation.x, a.position.z - this.ship(group.side).navigation.z) <= this.content.rules.detection_range))) {
      throw new Error('对空用途需要有效敌机与飞机高度预瞄，不能使用海面点');
    }
    if (weapon.kind === 'aircraft') { this.launchAircraft(group, point); return; }
    const definition = this.definition(group), indices = readyTargetTubes(this.content, definition, group, mount, this.time,
      group.side === 'player' && weapon.kind === 'gun' ? this.controls.selectedBattery : 'all');
    for (const index of indices) this.reachable(group, point, group.tubes[index]!.mount);
    // Precompute every trajectory before changing a single tube's stock or reload deadline.
    const shots = indices.map(index => {
      const origin = this.origin(group, group.tubes[index]!.mount);
      if (weapon.kind === 'torpedo') {
        const distance = Math.hypot(point.x - origin.x, point.z - origin.z);
        if (distance < 1) throw new Error('鱼雷目标过近');
        return { origin: { ...origin, y: 0.5 }, velocity: { x: (point.x - origin.x) / distance * weapon.travel_u_s,
          y: 0, z: (point.z - origin.z) / distance * weapon.travel_u_s }, elevation: 0, flight: 0 };
      }
      const mode = targetMode(this.content, group), ideal = targetTrajectory(origin, point, weapon.muzzle_u_s,
        this.content.rules.gravity, mode.max_elevation_deg || weapon.max_elevation_deg)!;
      const scattered = targetDispersion(origin, point, weapon, this.random);
      // Dispersion changes launch direction, never the authoritative muzzle speed.
      const flight = ideal.flight;
      const raw = { x: (scattered.x - origin.x) / flight, y: ideal.velocity.y, z: (scattered.z - origin.z) / flight };
      const speed = Math.hypot(raw.x, raw.y, raw.z), scale = weapon.muzzle_u_s / speed;
      return { origin, velocity: { x: raw.x * scale, y: raw.y * scale, z: raw.z * scale }, elevation: ideal.elevation, flight };
    });
    consumeTargetTubes(this.content, group, indices, this.time);
    shots.forEach((shot, index) => {
      const mode = targetMode(this.content, group);
      this.launch({ id: this.projectileId(), owner: group.side, position: shot.origin, velocity: shot.velocity,
        shellType: group.shellType, power: { he: weapon.damage, apBonus: 0 }, elevation: shot.elevation,
        kind: weapon.kind === 'torpedo' ? 'torpedo' : 'shell', weaponId: weapon.id, traveled: 0,
        launchPosition: { ...shot.origin }, rangeRemaining: weapon.kind === 'torpedo' ? weapon.range_u : targetRange(weapon, this.content.rules),
        ...(group.mode === 'air' ? { fuseRemaining: shot.flight, burstRadius: mode.burst_radius_u, damageMultiplier: mode.damage_multiplier } : {}) },
      group.tubes[indices[index]!]!.mount);
    });
  }
  private projectileId(): ProjectileId { return `target-projectile-${this.nextProjectile++}` as ProjectileId; }
  private launch(projectile: ProjectileState, mount: number): void {
    this.state.projectiles.push(projectile); this.state.combat[projectile.owner].shots++;
    this.emit({ type: 'launched', projectile: structuredClone(projectile), weapon: mount });
    this.emit({ type: 'fired', owner: projectile.owner, weapon: mount, position: { ...projectile.position } });
  }
  private launchAircraft(group: TargetWeaponGroupState, point: Point): void {
    const weapon = this.content.weapons[group.weaponId]!, definition = this.definition(group), source = this.source(group.side);
    this.reachable(group, point, 0);
    if (this.time + 1e-9 < Math.max(group.switchReadyAt, group.nextRequestAt)) throw new Error('航空编队整备中');
    const count = definition.mounts * definition.barrels;
    if (group.aircraftAvailable < count) throw new Error('可用舰载机不足完整编队');
    group.aircraftAvailable -= count; group.nextRequestAt = this.time + weapon.reload_s;
    const nav = this.ship(group.side).navigation;
    for (let index = 0; index < count; index++) {
      const cross = (index - (count - 1) / 2) * source.beam_u;
      const plane: AircraftState = { id: `target-aircraft-${this.nextAircraft++}`, owner: group.side,
        position: { x: nav.x + Math.cos(nav.heading) * cross, y: source.length_u / 2,
          z: nav.z - Math.sin(nav.heading) * cross }, velocity: { x: Math.sin(nav.heading) * weapon.travel_u_s, y: 0, z: Math.cos(nav.heading) * weapon.travel_u_s },
        hp: this.content.rules.aircraft_hp, maxHp: this.content.rules.aircraft_hp, weaponId: weapon.id,
        groupId: group.id, target: opponent(group.side), phase: 'outbound', dropped: false };
      this.state.aircraft!.push(plane); this.emit({ type: 'aircraft-launched', aircraft: structuredClone(plane) });
    }
  }
  private automatic(group: TargetWeaponGroupState): void {
    if (!group.enabled || this.state.combat[group.side].hp <= 0) return;
    const definition = this.definition(group), bank = this.content.automation[definition.bankId!]!, weapon = this.content.weapons[group.weaponId]!;
    const ship = this.ship(group.side).navigation;
    const candidates = bank.role === 'surface' ? [{ id: this.ship(opponent(group.side)).id as string,
      position: { x: this.ship(opponent(group.side)).navigation.x, y: 0.5, z: this.ship(opponent(group.side)).navigation.z },
      velocity: { x: Math.sin(this.ship(opponent(group.side)).navigation.heading) * this.ship(opponent(group.side)).navigation.speed,
        y: 0, z: Math.cos(this.ship(opponent(group.side)).navigation.heading) * this.ship(opponent(group.side)).navigation.speed },
      hp: this.state.combat[opponent(group.side)].hp }]
      : this.state.aircraft!.filter(a => a.owner !== group.side).map(a => ({ id: a.id, position: a.position, velocity: a.velocity, hp: a.hp }));
    const eligible = candidates.filter(target => {
      const horizontal = Math.hypot(target.position.x - ship.x, target.position.z - ship.z);
      const distance = Math.hypot(horizontal, bank.role === 'aa' ? target.position.y : 0);
      const bearing = Math.atan2(target.position.x - ship.x, target.position.z - ship.z) - ship.heading;
      return target.hp > 0 && horizontal <= this.content.rules.detection_range && distance >= bank.min_range_u && distance <= bank.max_range_u &&
        Math.abs(degrees(angleDelta(bearing, radians(bank.bearing_deg)))) <= bank.arc_deg / 2 + 1e-9;
    });
    let target = eligible.find(t => t.id === group.targetId);
    if (!target) {
      target = eligible.sort((a, b) => Math.hypot(a.position.x - ship.x, a.position.z - ship.z, a.position.y) -
        Math.hypot(b.position.x - ship.x, b.position.z - ship.z, b.position.y) || a.hp - b.hp || a.id.localeCompare(b.id))[0];
      group.targetId = target?.id ?? null; group.lockReadyAt = this.time + bank.lock_s;
    }
    if (!target) return;
    const origin = { x: ship.x, y: bank.role === 'aa' ? this.source(group.side).beam_u : this.source(group.side).beam_u, z: ship.z };
    let point = { ...target.position }, flight = 0;
    if (bank.role === 'surface') {
      const interception = targetIntercept(origin, point, target.velocity, weapon.muzzle_u_s, this.content.rules.gravity, weapon.max_elevation_deg);
      if (!interception) return;
      flight = interception.flight;
      point = { x: point.x + target.velocity.x * flight, y: point.y, z: point.z + target.velocity.z * flight };
    } else {
      flight = Math.hypot(point.x - origin.x, point.y - origin.y, point.z - origin.z) / weapon.travel_u_s;
      point = { x: point.x + target.velocity.x * flight, y: point.y + target.velocity.y * flight, z: point.z + target.velocity.z * flight };
    }
    const desired = Math.atan2(point.x - ship.x, point.z - ship.z) - ship.heading;
    const offset = angleDelta(desired, radians(bank.bearing_deg));
    if (Math.abs(degrees(offset)) > bank.arc_deg / 2 + 1e-9) return;
    const error = bank.arc_deg === 360 ? angleDelta(offset, group.yaw) : offset - group.yaw;
    group.yaw += Math.sign(error) * Math.min(Math.abs(error), radians(bank.slew_deg_s) * STEP_SECONDS);
    if (Math.abs(degrees(angleDelta(offset, group.yaw))) > bank.aim_tolerance_deg ||
      this.time + 1e-9 < group.lockReadyAt || this.time + 1e-9 < group.nextRequestAt) return;
    let indices: number[];
    try { indices = readyTargetTubes(this.content, definition, group, null, this.time); }
    catch { return; }
    const baseTrajectory = bank.role === 'surface' ? targetTrajectory(origin, point, weapon.muzzle_u_s,
      this.content.rules.gravity, weapon.max_elevation_deg) : null;
    if (bank.role === 'surface' && !baseTrajectory) return;
    const shots = indices.map(() => {
      if (bank.role === 'surface') {
        const scattered = targetDispersion(origin, point, weapon, this.random), trajectory = baseTrajectory!;
        const raw = { x: (scattered.x - origin.x) / trajectory.flight, y: trajectory.velocity.y,
          z: (scattered.z - origin.z) / trajectory.flight }, scale = weapon.muzzle_u_s / Math.hypot(raw.x, raw.y, raw.z);
        return { x: raw.x * scale, y: raw.y * scale, z: raw.z * scale };
      }
      const distance = Math.hypot(point.x - origin.x, point.y - origin.y, point.z - origin.z);
      return { x: (point.x - origin.x) / distance * weapon.travel_u_s,
        y: (point.y - origin.y) / distance * weapon.travel_u_s, z: (point.z - origin.z) / distance * weapon.travel_u_s };
    });
    consumeTargetTubes(this.content, group, indices, this.time);
    // Automatic banks fire complete physical rounds, with their own original reload.
    group.nextRequestAt = this.time + weapon.reload_s;
    shots.forEach((velocity, index) => this.launch({ id: this.projectileId(), owner: group.side,
      position: { ...origin }, velocity, shellType: 'HE', power: { he: weapon.damage, apBonus: 0 },
      elevation: baseTrajectory?.elevation ?? 0, kind: bank.role === 'aa' ? 'aa' : 'shell', weaponId: weapon.id,
      traveled: 0, launchPosition: { ...origin }, rangeRemaining: targetRange(weapon, this.content.rules),
      ...(bank.role === 'aa' ? { targetId: target!.id, fuseRemaining: flight, hitProbability: bank.hit_probability } : {}) },
    group.tubes[indices[index]!]!.mount));
  }
  private hitAircraft(plane: AircraftState, amount: number): void {
    if (plane.hp <= 0) return;
    const damage = Math.min(plane.hp, amount); plane.hp -= damage;
    this.emit({ type: 'aircraft-hit', aircraftId: plane.id, owner: plane.owner, position: { ...plane.position }, damage });
    if (plane.hp <= 0) {
      const group = this.controls.groups.find(g => g.id === plane.groupId)!; group.aircraftLost++;
      this.emit({ type: 'aircraft-shot-down', aircraftId: plane.id, owner: plane.owner, position: { ...plane.position } });
    }
  }
  private impact(projectile: ProjectileState, position: Point): void {
    const side = opponent(projectile.owner), target = this.state.combat[side], source = this.source(side);
    if (target.hp <= 0) return;
    const weapon = this.content.weapons[projectile.weaponId!]!, armor = this.content.armor[source.armor_id]!;
    let amount: number;
    if (projectile.kind === 'torpedo') {
      amount = Math.round(weapon.damage * (1 - armor.torpedo_reduction));
      const absorbed = Math.min(target.protection, amount); target.protection -= absorbed; amount -= absorbed;
    } else if (projectile.kind === 'bomb') {
      if (this.random() >= this.content.rules.aircraft_attack_hit_probability) { this.emit({ type: 'splash', position, shellType: 'HE', projectileId: projectile.id }); return; }
      amount = Math.round(weapon.damage * Math.max(this.content.rules.he_min_fraction, 1 / (1 + armor.deck_mm / armor.he_resistance_mm)));
    } else {
      const direction = Math.atan2(projectile.velocity.x, projectile.velocity.z), heading = this.ship(side).navigation.heading;
      const obliquity = degrees(Math.asin(Math.min(1, Math.abs(Math.cos(direction - heading)))));
      amount = targetDamage(weapon, this.content.shells[projectile.shellType], armor,
        projectile.traveled ?? 0, obliquity, this.content.rules).damage;
    }
    const damage = Math.min(target.hp, amount); target.hp -= damage;
    this.state.combat[projectile.owner].hits++; this.state.combat[projectile.owner].damage += damage;
    if (damage > 0 && projectile.shellType === 'HE' && projectile.kind === 'shell' && this.random() < this.content.rules.fire_chance &&
      this.fires[side].length < this.content.rules.fire_max_stacks) this.fires[side].push(this.time + this.content.rules.fire_duration);
    this.emit({ type: 'impact', owner: projectile.owner, target: side, position, shellType: projectile.shellType, damage });
  }
  private projectiles(before: NavigationState[], aircraftBefore: Map<string, Point>,
    actions: TargetAircraftAction[]): void {
    const kept: ProjectileState[] = [], gravity = this.content.rules.gravity;
    const due: { fraction: number; index: number; run: () => void }[] = [];
    this.state.projectiles.forEach((p, index) => {
      const from = { ...p.position }, dt = STEP_SECONDS;
      const ballistic = p.kind === 'shell' || p.kind === 'bomb';
      const to = { x: from.x + p.velocity.x * dt, y: from.y + p.velocity.y * dt - (ballistic ? gravity * dt * dt / 2 : 0), z: from.z + p.velocity.z * dt };
      if (ballistic) p.velocity.y -= gravity * dt;
      const traveled = Math.hypot(to.x - from.x, to.z - from.z);
      p.traveled = (p.traveled ?? 0) + traveled;
      const rangeFraction = p.rangeRemaining !== undefined && p.rangeRemaining <= traveled
        ? Math.max(0, traveled > 0 ? p.rangeRemaining / traveled : 0) : null;
      if (p.rangeRemaining !== undefined) p.rangeRemaining -= traveled;
      const targetSide = opponent(p.owner), targetIndex = this.state.ships.findIndex(s => s.side === targetSide), ship = this.state.ships[targetIndex]!;
      let collision: number | null = null;
      if (p.kind !== 'aa' && p.fuseRemaining === undefined && this.state.combat[targetSide].hp > 0) {
        collision = hullIntersection(from, to, before[targetIndex]!, ship.navigation, this.config.ships.find(s => s.side === targetSide)!.dimensions);
      }
      const fuseFraction = p.fuseRemaining !== undefined && p.fuseRemaining <= dt + 1e-9 ? Math.max(0, p.fuseRemaining / dt) : null;
      const seaFraction = to.y <= 0 && from.y > 0 ? from.y / (from.y - to.y) : null;
      const fractions = [collision, fuseFraction, seaFraction, rangeFraction].filter((value): value is number => value !== null);
      const fraction = fractions.length ? Math.min(...fractions) : null;
      if (fraction !== null) {
        const position = interpolate(from, to, fraction); p.position = position;
        due.push({ fraction, index, run: () => {
          if (collision === fraction) this.impact(p, position);
          else if (fuseFraction !== fraction) this.emit({ type: 'splash', position, shellType: p.shellType, projectileId: p.id });
          else if (p.kind === 'aa') {
            const plane = this.state.aircraft!.find(a => a.id === p.targetId);
            if (plane && plane.hp > 0 && this.random() < (p.hitProbability ?? 0)) this.hitAircraft(plane, this.content.weapons[p.weaponId!]!.damage);
          } else if (p.burstRadius !== undefined) {
            for (const plane of this.state.aircraft!.filter(a => a.owner !== p.owner && a.hp > 0)) {
              const old = aircraftBefore.get(plane.id) ?? plane.position, at = interpolate(old, plane.position, fraction);
              if (Math.hypot(position.x - at.x, position.y - at.y, position.z - at.z) <= p.burstRadius) {
                this.hitAircraft(plane, this.content.weapons[p.weaponId!]!.damage * this.content.shells.HE.damage_multiplier * (p.damageMultiplier ?? 1));
              }
            }
            this.emit({ type: 'splash', position, shellType: p.shellType, projectileId: p.id });
          } else this.emit({ type: 'splash', position, shellType: p.shellType, projectileId: p.id });
        } });
      } else if ((p.rangeRemaining ?? Infinity) <= 0 || p.position.y < 0) {
        this.emit({ type: 'splash', position: to, shellType: p.shellType, projectileId: p.id });
      } else {
        p.position = to; if (p.fuseRemaining !== undefined) p.fuseRemaining -= dt; kept.push(p);
      }
    });
    for (const action of actions) due.push({ fraction: action.fraction,
      index: this.state.projectiles.length + Number(action.plane.id.split('-').at(-1)), run: () => {
        if (action.kind === 'drop') this.drop(action.plane, action.position);
        else if (action.plane.hp > 0) {
          this.controls.groups.find(group => group.id === action.plane.groupId)!.aircraftAvailable++;
          action.plane.hp = -1;
        }
      } });
    this.state.projectiles = kept;
    due.sort((a, b) => a.fraction - b.fraction || a.index - b.index).forEach(item => item.run());
  }
  private moveAircraft(): TargetAircraftAction[] {
    return moveTargetAircraft(this.content, this.state.aircraft!, side => this.ship(side).navigation,
      side => this.source(side).beam_u, STEP_SECONDS);
  }
  private drop(plane: AircraftState, position: Point): void {
    if (plane.hp <= 0 || plane.dropped || this.state.combat[plane.target].hp <= 0) return;
    plane.dropped = true; plane.phase = 'returning';
    const weapon = this.content.weapons[plane.weaponId]!;
    this.launch({ id: this.projectileId(), owner: plane.owner, position: { ...position }, velocity: { ...plane.velocity },
      kind: 'bomb', weaponId: weapon.id, shellType: 'HE', power: { he: weapon.damage, apBonus: 0 }, elevation: 0,
      traveled: 0, launchPosition: { ...position } }, 0);
    this.emit({ type: 'aircraft-dropped', aircraftId: plane.id, position: { ...position } });
  }
  private navigate(): void {
    for (const ship of this.state.ships) {
      if (this.state.combat[ship.side].hp <= 0) continue;
      const source = this.source(ship.side), nav = ship.navigation;
      let rudder = ship.side === 'player' ? this.state.rudder : 0, throttle = nav.throttle;
      if (ship.side === 'player') {
        if (this.state.drive) throttle += this.state.drive * STEP_SECONDS;
        if (ship.route) {
          const dx = ship.route.target.x - nav.x, dz = ship.route.target.z - nav.z;
          if (Math.hypot(dx, dz) < source.beam_u) { ship.route = null; throttle = 0; }
          else { rudder = Math.max(-1, Math.min(1, angleDelta(Math.atan2(dx, dz), nav.heading) * source.turn_radius_u / Math.max(source.beam_u, Math.abs(nav.speed)))); throttle = 1; }
        }
      } else {
        const player = this.ship('player').navigation, dx = player.x - nav.x, dz = player.z - nav.z, distance = Math.hypot(dx, dz);
        const profile = this.content.profiles[source.id]!, bearing = Math.atan2(dx, dz);
        const desired = distance > profile.preferred_max_u ? bearing : distance < profile.preferred_min_u ? bearing + Math.PI : bearing + Math.PI / 2;
        rudder = Math.max(-1, Math.min(1, angleDelta(desired, nav.heading)));
        throttle = 1;
      }
      targetNavigation(nav, source, throttle, rudder, STEP_SECONDS, this.config.layout.width, this.config.layout.height);
    }
  }
  private enemyFire(): void {
    const target = this.ship('player').navigation;
    for (const group of this.controls.groups.filter(g => g.side === 'enemy' && g.control === 'manual')) {
      if (this.state.combat.enemy.hp <= 0 || this.state.combat.player.hp <= 0 || this.time + 1e-9 < group.nextRequestAt) continue;
      const weapon = this.content.weapons[group.weaponId]!;
      let point: Point = { x: target.x, y: 0.5, z: target.z };
      if (weapon.kind === 'gun') {
        const intercept = targetIntercept(this.origin(group, 0), point, { x: Math.sin(target.heading) * target.speed, y: 0,
          z: Math.cos(target.heading) * target.speed }, weapon.muzzle_u_s, this.content.rules.gravity, weapon.max_elevation_deg);
        if (!intercept) continue;
        point = { x: point.x + Math.sin(target.heading) * target.speed * intercept.flight, y: 0.5,
          z: point.z + Math.cos(target.heading) * target.speed * intercept.flight };
      }
      try { this.manualFire(group, point, null, true); } catch { /* AI retries only on future fixed steps. */ }
    }
  }
  private synchronizeWeapons(): void {
    for (const ship of this.state.ships) {
      const group = this.controls.groups.find(g => g.side === ship.side && g.slot === 'main' && g.control === 'manual');
      if (!group) continue;
      ship.weapons.forEach((weapon, mount) => {
        const tubes = group.tubes.filter(t => t.mount === mount), stock = Math.min(...tubes.map(t => t.remaining));
        weapon.reload = Math.max(0, group.switchReadyAt - this.time, ...tubes.map(t => t.readyAt - this.time));
        weapon.ammunition.lockers.A.shellType = weapon.ammunition.lockers.B.shellType = group.shellType;
        weapon.ammunition.lockers.A.remaining = stock; weapon.ammunition.lockers.B.remaining = 0;
        const origin = this.origin(group, mount), aim = this.state.aim, trajectory = targetTrajectory(origin, aim,
          this.content.weapons[group.weaponId]!.muzzle_u_s, this.content.rules.gravity,
          targetMode(this.content, group).max_elevation_deg || this.content.weapons[group.weaponId]!.max_elevation_deg);
        weapon.yaw = angleDelta(Math.atan2(aim.x - origin.x, aim.z - origin.z), ship.navigation.heading);
        weapon.elevation = trajectory?.elevation ?? 0;
        try { this.reachable(group, aim, mount); weapon.aimState = 'aligned'; } catch { weapon.aimState = 'limited'; }
        weapon.recoil = Math.max(0, weapon.recoil - STEP_SECONDS);
      });
    }
  }
  step(commands: readonly BattleCommand[] = []): BattleEvent[] {
    this.events = []; this.state.tick++;
    for (const command of commands) {
      try { this.command(command); }
      catch (error) { this.emit({ type: 'rejected', command: command.type, message: error instanceof Error ? error.message : String(error) }); }
    }
    if (this.state.combat.result) { this.state.resultSeconds += STEP_SECONDS; this.controls.fireHeld = false; return this.events; }
    const before = this.state.ships.map(s => ({ ...s.navigation }));
    const aircraftBefore = new Map(this.state.aircraft!.map(a => [a.id, { ...a.position }]));
    this.navigate();
    if (this.controls.fireHeld) {
      try { this.manualFire(this.selected(), this.state.aim, this.controls.selectedMount, this.controls.aimValid); } catch { /* Held input never queues catch-up shots. */ }
    }
    this.enemyFire();
    for (const group of this.controls.groups.filter(g => g.control === 'automatic')) this.automatic(group);
    const drops = this.moveAircraft();
    // Arrivals and releases share a chronological queue. Downed aircraft cannot release;
    // already released bombs remain independent of the launcher's later survival.
    this.projectiles(before, aircraftBefore, drops);
    this.state.aircraft = this.state.aircraft!.filter(a => a.hp > 0);
    for (const side of ['player', 'enemy'] as const) {
      this.fires[side] = this.fires[side].filter(expiry => expiry > this.time);
      const combat = this.state.combat[side];
      if (combat.hp > 0 && this.fires[side].length) {
        const amount = Math.min(combat.hp, combat.maxHp * this.content.rules.fire_dps_hp_fraction * this.fires[side].length * STEP_SECONDS);
        combat.hp -= amount; this.state.combat[opponent(side)].damage += amount;
      }
      if (combat.hp <= 0 && combat.sinking === 0) { combat.sinking = STEP_SECONDS; this.emit({ type: 'sunk', side }); }
      else if (combat.sinking > 0) combat.sinking += STEP_SECONDS;
    }
    const result = resolveBattle(this.state.combat);
    if (result) { this.controls.fireHeld = false; this.emit({ type: 'result', result }); }
    else if (this.time >= this.content.rooms.duel!.combat_limit_s) {
      this.state.combat.result = 'draw'; this.controls.fireHeld = false; this.emit({ type: 'result', result: 'draw' });
    }
    this.synchronizeWeapons();
    return this.events;
  }
}
