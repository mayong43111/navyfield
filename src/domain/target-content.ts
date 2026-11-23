import type { Point, ShellType, Side } from './battle.ts';

export type TargetSlot = 'main' | 'secondary' | 'light_aa';
export type TargetMode = 'surface' | 'air';
export type FiringPattern = 'salvo' | 'gradual';
export interface TargetShip {
  id: string; name: string; phase: number; class: string; hp: number;
  length_u: number; beam_u: number; speed_u_s: number; initial_speed_u_s: number;
  acceleration_u_s2: number; turn_radius_u: number; armor_id: string; bulge_hp: number;
  main_weapon_id: string; main_mounts: number; main_barrels: number;
  secondary_weapon_id: string; secondary_mounts: number; secondary_barrels: number;
  aircraft_capacity: number; source: string;
}
export interface TargetWeapon {
  id: string; name: string; phase: number; kind: 'gun' | 'torpedo' | 'aircraft' | 'aa';
  reload_s: number; muzzle_u_s: number; max_elevation_deg: number; damage: number;
  penetration_mm: number; ammo_per_barrel: number; dispersion_long_base_u: number;
  dispersion_long_ratio: number; dispersion_cross_base_u: number; dispersion_cross_ratio: number;
  range_u: number; travel_u_s: number; source: string;
}
export interface TargetArmor { id: string; name: string; belt_mm: number; deck_mm: number;
  he_resistance_mm: number; torpedo_reduction: number; source: string }
export interface TargetShell { id: ShellType; name: string; damage_multiplier: number;
  penetration_multiplier: number; nonpenetration_fraction: number; overpenetration_fraction: number;
  ricochet_deg: number; source: string }
export interface TargetRoom { id: string; name: string; phase: number; ships_per_team: number;
  map_width_u: number; map_height_u: number; spawn_width_u: number; spawn_height_u: number;
  center_gap_u: number; ready_budget_s: number; countdown_s: number; combat_limit_s: number;
  initial_reload_s: number; source: string }
export interface TargetControl { id: string; ship_id: string; slot: TargetSlot;
  control: 'manual' | 'automatic'; available_modes: string; mode_switch_s: number; source: string }
export interface TargetWeaponMode { id: string; weapon_id: string; mode: TargetMode;
  target_kind: 'ship' | 'aircraft'; shell_policy: 'AP_HE' | 'HE' | 'TORPEDO' | 'AIR_ATTACK';
  range_u: number; max_elevation_deg: number; burst_radius_u: number; damage_multiplier: number; source: string }
export interface TargetAutomaticBank { id: string; ship_id: string; role: 'surface' | 'aa';
  weapon_id: string; mounts: number; barrels: number; bearing_deg: number; arc_deg: number;
  min_range_u: number; max_range_u: number; slew_deg_s: number; lock_s: number;
  aim_tolerance_deg: number; hit_probability: number; source: string }
export interface TargetRules {
  schema_version: number; rule_version: 'target-v1.3.0'; gravity: number;
  deck_threshold_deg: number; penetration_range_loss: number; he_min_fraction: number;
  overpenetration_armor_ratio: number; detection_range: number; fire_duration: number;
  fire_dps_hp_fraction: number; fire_max_stacks: number; fire_chance: number;
  repair_hp_fraction: number; repair_duration: number; repair_cooldown: number; repair_charges: number;
  capture_radius: number; capture_time: number; simulation_hz: number; fleet_bb_limit: number;
  fleet_cv_limit: number; spawn_edge_margin: number; spawn_spacing: number;
  torpedo_hit_probability: number; aircraft_hp: number; aircraft_attack_hit_probability: number;
  aircraft_aa_exposure: number;
  ai_observation_interval_s: number; ai_reaction_delay_s: number;
  ai_position_error_u: number; ai_position_error_ratio: number;
  ai_lead_fraction: number; ai_fire_delay_s: number;
}
export interface TargetProfile { id: string; role: string; strength: string; weakness: string;
  tactics: string; preferred_min_u: number; preferred_max_u: number; source: string }
export interface TargetContent {
  schemaVersion: 3; rulesVersion: 'target-v1.3.0'; inputSha256: string;
  inputFiles: string[];
  ships: Record<string, TargetShip>; weapons: Record<string, TargetWeapon>;
  armor: Record<string, TargetArmor>; shells: Record<ShellType, TargetShell>;
  rooms: Record<string, TargetRoom>; controls: Record<string, TargetControl>;
  weapon_modes: Record<string, TargetWeaponMode>; automation: Record<string, TargetAutomaticBank>;
  profiles: Record<string, TargetProfile>; rules: TargetRules;
}
export interface TargetGroupDefinition {
  id: string; side: Side; slot: TargetSlot; weaponId: string; controlId: string;
  mounts: number; barrels: number; installedMounts: boolean[]; initialShellType: ShellType;
  bankId: string | null;
}
export interface TargetConfigData { content: TargetContent; roomId: 'duel'; groups: TargetGroupDefinition[] }
export interface TargetTubeState { mount: number; barrel: number; remaining: number; readyAt: number }
export interface TargetWeaponGroupState {
  id: string; side: Side; slot: TargetSlot; weaponId: string; control: 'manual' | 'automatic';
  mounts: number; barrels: number; mode: TargetMode; availableModes: TargetMode[];
  shellType: ShellType; surfaceShellType: ShellType; pattern: FiringPattern; enabled: boolean;
  switchReadyAt: number; nextRequestAt: number; cursor: number; tubes: TargetTubeState[];
  yaw: number; targetId: string | null; lockReadyAt: number;
  aircraftAvailable: number; aircraftLost: number;
}
export type TargetBattery = 'all' | 'fore' | 'aft';
export interface TargetControlState {
  selectedSlot: TargetSlot; selectedMount: number | null; selectedBattery: TargetBattery; fireHeld: boolean;
  aimValid: boolean; groups: TargetWeaponGroupState[];
}
export interface AircraftState {
  id: string; owner: Side; position: Point; velocity: Point; hp: number; maxHp: number;
  weaponId: string; groupId: string; target: Side; phase: 'outbound' | 'returning'; dropped: boolean;
}

const tables = ['ships', 'weapons', 'armor', 'shells', 'rooms', 'controls', 'weapon_modes', 'automation', 'profiles'] as const;
const fields = {
  ships: { text: 'id name class armor_id main_weapon_id secondary_weapon_id source', numeric: 'phase hp length_u beam_u speed_u_s initial_speed_u_s acceleration_u_s2 turn_radius_u bulge_hp main_mounts main_barrels secondary_mounts secondary_barrels aircraft_capacity' },
  weapons: { text: 'id name kind source', numeric: 'phase reload_s muzzle_u_s max_elevation_deg damage penetration_mm ammo_per_barrel dispersion_long_base_u dispersion_long_ratio dispersion_cross_base_u dispersion_cross_ratio range_u travel_u_s' },
  armor: { text: 'id name source', numeric: 'belt_mm deck_mm he_resistance_mm torpedo_reduction' },
  shells: { text: 'id name source', numeric: 'damage_multiplier penetration_multiplier nonpenetration_fraction overpenetration_fraction ricochet_deg' },
  rooms: { text: 'id name source', numeric: 'phase ships_per_team map_width_u map_height_u spawn_width_u spawn_height_u center_gap_u ready_budget_s countdown_s combat_limit_s initial_reload_s' },
  controls: { text: 'id ship_id slot control available_modes source', numeric: 'mode_switch_s' },
  weapon_modes: { text: 'id weapon_id mode target_kind shell_policy source', numeric: 'range_u max_elevation_deg burst_radius_u damage_multiplier' },
  automation: { text: 'id ship_id role weapon_id source', numeric: 'mounts barrels bearing_deg arc_deg min_range_u max_range_u slew_deg_s lock_s aim_tolerance_deg hit_probability' },
  profiles: { text: 'id role strength weakness tactics source', numeric: 'preferred_min_u preferred_max_u' },
  rules: { text: 'rule_version', numeric: 'schema_version gravity deck_threshold_deg penetration_range_loss he_min_fraction overpenetration_armor_ratio detection_range fire_duration fire_dps_hp_fraction fire_max_stacks fire_chance repair_hp_fraction repair_duration repair_cooldown repair_charges capture_radius capture_time simulation_hz fleet_bb_limit fleet_cv_limit spawn_edge_margin spawn_spacing torpedo_hit_probability aircraft_hp aircraft_attack_hit_probability aircraft_aa_exposure ai_observation_interval_s ai_reaction_delay_s ai_position_error_u ai_position_error_ratio ai_lead_fraction ai_fire_delay_s' },
} as const;

function projectRow(value: unknown, shape: { text: string; numeric: string }, label: string): Record<string, string | number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`目标行无效：${label}`);
  const source = value as Record<string, unknown>, result: Record<string, string | number> = {};
  for (const key of shape.text.split(' ')) {
    if (typeof source[key] !== 'string') throw new Error(`目标文本字段无效：${label}/${key}`);
    result[key] = source[key];
  }
  for (const key of shape.numeric.split(' ')) {
    const number = source[key];
    if (typeof number !== 'number' || !Number.isFinite(number) || number < 0) throw new Error(`目标数值字段无效：${label}/${key}`);
    result[key] = number;
  }
  return result;
}

export function parseTargetContent(value: unknown): TargetContent {
  if (!value || typeof value !== 'object') throw new Error('目标数值内容必须为对象');
  const data = { ...value } as TargetContent;
  if (data.schemaVersion !== 3 || data.rulesVersion !== 'target-v1.3.0' ||
    !/^[a-f0-9]{64}$/.test(data.inputSha256) || !Array.isArray(data.inputFiles) ||
    data.inputFiles.length !== 10 || new Set(data.inputFiles).size !== 10 ||
    data.inputFiles.some(p => !/^design-data\/source\/(ships|weapons|armor|shells|rooms|rules|profiles|automation|controls|weapon_modes)\.csv$/.test(p))) {
    throw new Error('目标数值版本或输入清单无效');
  }
  for (const table of tables) {
    if (!data[table] || typeof data[table] !== 'object' || Array.isArray(data[table])) throw new Error(`目标表缺失：${table}`);
    const rows = Object.fromEntries(Object.entries(data[table]).map(([id, value]) => {
      const row = projectRow(value, fields[table], `${table}/${id}`);
      if (row.id !== id || !(row.source as string).startsWith('self-designed')) throw new Error(`目标表编号或来源无效：${table}/${id}`);
      return [id, row];
    }));
    Object.assign(data, { [table]: rows });
  }
  data.rules = projectRow(data.rules, fields.rules, 'rules') as unknown as TargetRules;
  if (!data.rules || data.rules.rule_version !== data.rulesVersion || data.rules.schema_version !== data.schemaVersion ||
    data.rules.simulation_hz !== 30 || !(data.rules.gravity > 0) || Object.values(data.ships).length !== 12) {
    throw new Error('目标规则或舰型集合无效');
  }
  for (const field of Object.values(data.rules)) if (typeof field === 'number' && (!Number.isFinite(field) || field < 0)) {
    throw new Error('目标规则数值无效');
  }
  if (!(data.rules.ai_observation_interval_s > 0) || data.rules.ai_position_error_ratio > 1 ||
    data.rules.ai_lead_fraction > 1) throw new Error('目标AI观测或提前量规则无效');
  for (const ship of Object.values(data.ships)) {
    if (!data.armor[ship.armor_id] || !data.weapons[ship.main_weapon_id] || !(ship.hp > 0) ||
      !(ship.length_u > ship.beam_u && ship.beam_u > 0) || !(ship.acceleration_u_s2 > 0) || !(ship.turn_radius_u > 0)) {
      throw new Error(`目标舰型引用无效：${ship.id}`);
    }
    for (const slot of ['main', 'secondary'] as const) if (ship[`${slot}_weapon_id`] &&
      (!data.weapons[ship[`${slot}_weapon_id`]] || !data.controls[`${ship.id}:${slot}`] ||
      !(ship[`${slot}_mounts`] > 0 && ship[`${slot}_barrels`] > 0))) throw new Error(`目标炮位无效：${ship.id}/${slot}`);
  }
  for (const control of Object.values(data.controls)) {
    if (!data.ships[control.ship_id] || !['manual', 'automatic'].includes(control.control) ||
      !control.available_modes.split('|').every(mode => ['air', 'surface'].includes(mode))) throw new Error('目标控制引用无效');
  }
  for (const mode of Object.values(data.weapon_modes)) if (!data.weapons[mode.weapon_id] ||
    mode.target_kind !== (mode.mode === 'air' ? 'aircraft' : 'ship')) throw new Error('目标能力引用无效');
  for (const bank of Object.values(data.automation)) if (!data.ships[bank.ship_id] || !data.weapons[bank.weapon_id] ||
    !(bank.mounts > 0 && bank.barrels > 0 && bank.max_range_u > bank.min_range_u && bank.lock_s > 0 && bank.slew_deg_s > 0) ||
    bank.hit_probability > 1 || bank.arc_deg > 360) throw new Error('目标自动炮组引用无效');
  if (!data.rooms.duel || !data.shells.AP || !data.shells.HE) throw new Error('目标房间或弹种缺失');
  // Keep the runtime contract closed: model/experiment additions are never copied into battle config.
  return { schemaVersion: data.schemaVersion, rulesVersion: data.rulesVersion, inputSha256: data.inputSha256,
    inputFiles: [...data.inputFiles], ships: data.ships, weapons: data.weapons, armor: data.armor, shells: data.shells,
    rooms: data.rooms, controls: data.controls, weapon_modes: data.weapon_modes, automation: data.automation,
    profiles: data.profiles, rules: data.rules };
}
