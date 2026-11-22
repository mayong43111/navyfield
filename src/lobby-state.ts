import { findBattle } from './battles.ts';

export type LobbyScreen = 'warzone' | 'prepare';
export type Screen = LobbyScreen | 'battle' | 'yard';
export type Area = 'training' | 'open';
export type Team = 'alpha' | 'bravo';
export type Formation = 'column' | 'line' | 'wedge';
export type ShipIdentity = { name: string; typeId: string };
export type Flagship = '大和' | '武藏' | ShipIdentity;
export const FORMATION_COLUMNS = 6;
export const FORMATION_PAGE_SIZE = 48;
export interface FleetShip {
  id: string;
  name: string;
  typeId: string;
  team: Team;
  slot: number;
}
export type BattleDeployment = Pick<FleetShip, 'team' | 'slot'>;
export interface Room {
  id: string;
  title: string;
  capacity: number;
  area: Area;
  battleId: string;
  ships: FleetShip[];
  nextShipId: number;
}
export interface LobbyState {
  rooms: Room[];
  selectedRoomId: string | null;
  joinedRoomId: string | null;
  selectedShipId: string | null;
  team: Team;
  ready: boolean;
}
export class LobbyInputError extends Error {}

export function createLobbyState(): LobbyState {
  return {
    rooms: [
      { id: 'training-1', title: '新手训练', capacity: 16, area: 'training', battleId: 'midway', ships: [], nextShipId: 0 },
      { id: 'training-2', title: '主炮演习', capacity: 32, area: 'training', battleId: 'coral', ships: [], nextShipId: 0 },
      { id: 'training-3', title: '大和试航', capacity: 16, area: 'training', battleId: 'midway', ships: [], nextShipId: 0 },
      { id: 'open-1', title: '自由演习', capacity: 48, area: 'open', battleId: 'leyte', ships: [], nextShipId: 0 },
      { id: 'open-2', title: '机动训练', capacity: 32, area: 'open', battleId: 'philippine', ships: [], nextShipId: 0 },
      { id: 'open-3', title: '齐射练习', capacity: 48, area: 'open', battleId: 'denmark', ships: [], nextShipId: 0 }
    ],
    selectedRoomId: null, joinedRoomId: null, selectedShipId: null, team: 'alpha', ready: false
  };
}

export function findRoom(state: LobbyState, id: string): Room {
  const room = state.rooms.find(room => room.id === id);
  if (!room) throw new Error(`Unknown local room: ${id}`);
  return room;
}

export function joinedRoom(state: LobbyState): Room {
  if (!state.joinedRoomId) throw new LobbyInputError('请先加入房间。');
  return findRoom(state, state.joinedRoomId);
}

export function createRoom(state: LobbyState, title: string, capacity: number, area: Area, battleId = 'midway'): Room {
  const name = title.trim();
  if (!name || name.length > 40) throw new LobbyInputError('房间名称需为 1–40 个字符，不能只有空格。');
  if (!Number.isSafeInteger(capacity) || capacity < 1) throw new LobbyInputError('编队容量必须是正整数，且不超过整数安全范围。');
  if (area !== 'training' && area !== 'open') throw new LobbyInputError('请选择有效战区。');
  findBattle(battleId);
  const room: Room = { id: `local-${state.rooms.length}`, title: name, capacity, area, battleId, ships: [], nextShipId: 0 };
  state.rooms.push(room);
  state.selectedRoomId = room.id;
  return room;
}

export function selectRoom(state: LobbyState, id: string): void {
  findRoom(state, id);
  state.selectedRoomId = id;
}

export function joinRoom(state: LobbyState, flagship: Flagship = '大和'): Room {
  if (!state.selectedRoomId) throw new LobbyInputError('请先选择一个房间。');
  const room = findRoom(state, state.selectedRoomId);
  state.joinedRoomId = room.id;
  state.team = 'alpha';
  state.ready = false;
  state.selectedShipId = room.ships[0]?.id ?? null;
  if (room.nextShipId === 0) addShip(state, typeof flagship === 'string'
    ? { name: flagship, typeId: flagship === '武藏' ? 'nf-3-415' : 'nf-3-121' } : flagship);
  return room;
}

export function changeTeam(state: LobbyState, team: Team): void {
  joinedRoom(state);
  if (team !== 'alpha' && team !== 'bravo') throw new LobbyInputError('请选择 甲队或乙队 分队。');
  if (state.team !== team) {
    state.team = team;
    state.ready = false;
  }
}

function firstFreeSlot(room: Room, team: Team): number {
  const used = new Set(room.ships.filter(ship => ship.team === team).map(ship => ship.slot));
  let slot = 0;
  while (used.has(slot)) slot++;
  return slot;
}

export function addShip(state: LobbyState, identity?: ShipIdentity): FleetShip {
  const room = joinedRoom(state);
  if (room.ships.length >= room.capacity) throw new LobbyInputError(`房间容量已满：${room.ships.length} / ${room.capacity}。`);
  if (identity && (!identity.name.trim() || !identity.typeId.trim())) throw new LobbyInputError('舰型资料无效。');
  const serial = ++room.nextShipId;
  const ship: FleetShip = {
    id: `${room.id}-ship-${serial}`,
    name: serial === 1 ? '大和' : serial === 2 ? (room.ships[0]?.name === '武藏' ? '大和' : '武藏') : `大和级 ${serial}`,
    typeId: serial === 2 && room.ships[0]?.name !== '武藏' ? 'nf-3-415' : 'nf-3-121',
    team: state.team, slot: firstFreeSlot(room, state.team)
  };
  if (identity) {
    ship.name = identity.name;
    ship.typeId = identity.typeId;
  }
  room.ships.push(ship);
  state.selectedShipId = ship.id;
  state.ready = false;
  return ship;
}

export function changeShipType(state: LobbyState, identity: ShipIdentity): void {
  if (!identity.name.trim() || !identity.typeId.trim()) throw new LobbyInputError('舰型资料无效。');
  if (!state.selectedShipId) throw new LobbyInputError('请先选择舰艇。');
  const ship = selectShip(state, state.selectedShipId);
  if (ship.typeId === identity.typeId) return;
  ship.name = identity.name;
  ship.typeId = identity.typeId;
  state.ready = false;
}

export function selectShip(state: LobbyState, id: string): FleetShip {
  const ship = joinedRoom(state).ships.find(ship => ship.id === id);
  if (!ship) throw new LobbyInputError('该舰已不在当前房间中。');
  state.selectedShipId = id;
  return ship;
}

export function removeShip(state: LobbyState): void {
  const room = joinedRoom(state);
  if (!state.selectedShipId) throw new LobbyInputError('请先选择要移除的舰艇。');
  const index = room.ships.findIndex(ship => ship.id === state.selectedShipId);
  if (index < 0) throw new LobbyInputError('该舰已不在当前房间中。');
  room.ships.splice(index, 1);
  state.selectedShipId = room.ships[Math.min(index, room.ships.length - 1)]?.id ?? null;
  state.ready = false;
}

export function moveShip(state: LobbyState, id: string, team: Team, slot: number): void {
  const room = joinedRoom(state);
  if (team !== 'alpha' && team !== 'bravo') throw new LobbyInputError('请选择有效分队。');
  if (!Number.isSafeInteger(slot) || slot < 0) throw new LobbyInputError('阵位必须为非负安全整数。');
  const ship = room.ships.find(ship => ship.id === id);
  if (!ship) throw new LobbyInputError('该舰已不在当前房间中。');
  state.selectedShipId = id;
  if (ship.team === team && ship.slot === slot) return;
  const occupant = room.ships.find(other => other.team === team && other.slot === slot);
  if (occupant) { occupant.team = ship.team; occupant.slot = ship.slot; }
  ship.team = team;
  ship.slot = slot;
  state.ready = false;
}

export function applyFormation(state: LobbyState, formation: Formation): void {
  const room = joinedRoom(state);
  if (formation !== 'column' && formation !== 'line' && formation !== 'wedge') throw new LobbyInputError('请选择有效阵型。');
  const ships = room.ships.filter(ship => ship.team === state.team);
  if (!ships.length) throw new LobbyInputError('当前分队没有舰艇。');
  for (const [index, ship] of ships.entries()) {
    if (formation === 'column') ship.slot = index * FORMATION_COLUMNS + 2;
    else if (formation === 'line') ship.slot = index;
    else {
      const local = index % 5;
      const row = Math.floor((local + 1) / 2);
      const column = 2 + (local === 0 ? 0 : local % 2 ? -row : row);
      ship.slot = (Math.floor(index / 5) * 3 + row) * FORMATION_COLUMNS + column;
    }
  }
  state.ready = false;
}

export function formationPageCount(room: Room, team: Team, page = 0): number {
  const highest = room.ships.reduce((slot, ship) => ship.team === team ? Math.max(slot, ship.slot) : slot, -1);
  return Math.max(1, Math.floor(highest / FORMATION_PAGE_SIZE) + 1, page + 1);
}

export function toggleReady(state: LobbyState): void {
  const room = joinedRoom(state);
  if (!room.ships.length) throw new LobbyInputError('空编队不能准备，请先加入舰艇。');
  state.ready = !state.ready;
}

export function canStart(state: LobbyState): boolean {
  return state.joinedRoomId !== null && state.ready && findRoom(state, state.joinedRoomId).ships.length > 0;
}

export function beginBattle(state: LobbyState): Room {
  if (!canStart(state)) throw new LobbyInputError('编队准备完成后才能出击。');
  const room = joinedRoom(state);
  state.ready = false;
  return room;
}

export function leaveRoom(state: LobbyState): void {
  state.joinedRoomId = null;
  state.selectedShipId = null;
  state.ready = false;
}
