import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLobbyState, createRoom, selectRoom, joinRoom, changeTeam,
  toggleReady, canStart, beginBattle, leaveRoom, LobbyInputError,
  addShip, removeShip, selectShip, moveShip, applyFormation, formationPageCount, changeShipType
} from '../../src/lobby-state.ts';
import { worldPoint, unwrapRing, loadWorldLand } from '../../src/lobby-art.ts';
import { readFile } from 'node:fs/promises';

test('creating a room validates input and selection does not imply joining or readiness', () => {
  const state = createLobbyState();
  const count = state.rooms.length;
  assert.throws(() => createRoom(state, '   ', 16, 'training'), LobbyInputError);
  assert.throws(() => createRoom(state, 'Test', 0, 'training'), LobbyInputError);
  assert.throws(() => createRoom(state, 'x'.repeat(41), 16, 'training'), LobbyInputError);
  assert.equal(state.rooms.length, count);
  const room = createRoom(state, '  大和试航  ', 32, 'open');
  assert.equal(room.title, '大和试航');
  assert.equal(state.selectedRoomId, room.id);
  assert.equal(state.joinedRoomId, null);
  assert.equal(canStart(state), false);
  const other = createRoom(state, '第二房间', 16, 'training');
  assert.notEqual(other.id, room.id);
});

test('joining and READY are prerequisites and beginning consumes readiness', () => {
  const state = createLobbyState();
  assert.throws(() => joinRoom(state), LobbyInputError);
  assert.throws(() => toggleReady(state), LobbyInputError);
  assert.throws(() => beginBattle(state), LobbyInputError);
  selectRoom(state, 'training-1');
  joinRoom(state);
  assert.equal(canStart(state), false);
  toggleReady(state);
  assert.equal(canStart(state), true);
  assert.equal(beginBattle(state).id, 'training-1');
  assert.equal(canStart(state), false);
});

test('changing teams or rooms clears readiness but reselecting the current team does not', () => {
  const state = createLobbyState();
  selectRoom(state, 'training-1');
  joinRoom(state);
  toggleReady(state);
  changeTeam(state, 'alpha');
  assert.equal(state.ready, true);
  changeTeam(state, 'bravo');
  assert.equal(state.team, 'bravo');
  assert.equal(state.ready, false);
  toggleReady(state);
  selectRoom(state, 'open-1');
  joinRoom(state);
  assert.equal(state.ready, false);
  assert.equal(state.team, 'alpha');
});

test('leaving removes the local participant and forbids further preparation', () => {
  const state = createLobbyState();
  selectRoom(state, 'training-1');
  joinRoom(state);
  toggleReady(state);
  leaveRoom(state);
  assert.equal(state.joinedRoomId, null);
  assert.equal(canStart(state), false);
  assert.throws(() => changeTeam(state, 'bravo'), LobbyInputError);
});

test('a fresh room takes the current berth; rejoining does not overwrite its formation', () => {
  const state = createLobbyState();
  selectRoom(state, 'training-1');
  const room = joinRoom(state, '武藏');
  assert.equal(room.ships[0].name, '武藏');
  assert.equal(addShip(state).name, '大和');
  leaveRoom(state);
  joinRoom(state, '大和');
  assert.deepEqual(room.ships.map(ship => ship.name), ['武藏', '大和']);
});

test('catalog ship types survive rejoining and changes preserve positions but clear readiness', () => {
  const state = createLobbyState();
  selectRoom(state, 'training-1');
  const room = joinRoom(state, { name: '弗莱彻', typeId: 'nf-test-fletcher' });
  const first = room.ships[0];
  moveShip(state, first.id, 'bravo', 55);
  toggleReady(state);
  changeShipType(state, { name: '埃塞克斯', typeId: 'nf-test-essex' });
  assert.equal(state.ready, false);
  assert.deepEqual([first.id, first.team, first.slot, first.typeId], [first.id, 'bravo', 55, 'nf-test-essex']);
  leaveRoom(state);
  joinRoom(state, '大和');
  assert.equal(first.typeId, 'nf-test-essex');
  const serial = room.nextShipId;
  assert.throws(() => addShip(state, { name: '', typeId: '' }), LobbyInputError);
  assert.equal(room.nextShipId, serial);
});

test('room capacity, not a six-ship limit, controls additions; selection preserves READY', () => {
  const state = createLobbyState();
  for (const invalid of [1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createRoom(state, 'invalid', invalid, 'open'), LobbyInputError);
  }
  const room = createRoom(state, '64-ship fleet', 64, 'open', 'leyte');
  joinRoom(state);
  while (room.ships.length < room.capacity) addShip(state);
  assert.equal(room.ships.length, 64);
  assert.equal(new Set(room.ships.map(ship => ship.id)).size, 64);
  assert.throws(() => addShip(state), LobbyInputError);
  toggleReady(state);
  selectShip(state, room.ships[0].id);
  assert.equal(state.ready, true);
  removeShip(state);
  assert.equal(room.ships.length, 63);
  assert.equal(state.ready, false);
  addShip(state);
  assert.equal(room.ships.length, 64);
  assert.equal(new Set(room.ships.map(ship => ship.id)).size, 64);
  const single = createRoom(state, 'single', 1, 'training');
  joinRoom(state);
  assert.equal(single.ships.length, 1);
  assert.throws(() => addShip(state), LobbyInputError);
});

test('dragging swaps occupied slots across teams and pages without losing ships', () => {
  const state = createLobbyState();
  const room = createRoom(state, 'positions', 16, 'open');
  joinRoom(state);
  const first = room.ships[0];
  const second = addShip(state);
  moveShip(state, second.id, 'bravo', 97);
  toggleReady(state);
  moveShip(state, first.id, 'bravo', 97);
  assert.deepEqual([first.team, first.slot, second.team, second.slot], ['bravo', 97, 'alpha', 0]);
  assert.equal(state.ready, false);
  assert.equal(room.ships.length, 2);
  assert.equal(formationPageCount(room, 'bravo'), 3);
  toggleReady(state);
  moveShip(state, first.id, 'bravo', 97);
  assert.equal(state.ready, true);
  for (const invalid of [-1, 1.1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => moveShip(state, first.id, 'alpha', invalid), LobbyInputError);
  }
  assert.throws(() => moveShip(state, 'other-room-ship', 'alpha', 0), LobbyInputError);
  assert.deepEqual([first.team, first.slot, second.team, second.slot], ['bravo', 97, 'alpha', 0]);
  assert.equal(state.ready, true);
});

test('presets preserve all 128 ships, span pages and leave the other team untouched', () => {
  const state = createLobbyState();
  const room = createRoom(state, '128 fleet', 128, 'open');
  joinRoom(state);
  while (room.ships.length < room.capacity) addShip(state);
  const other = room.ships.at(-1);
  moveShip(state, other.id, 'bravo', 200);
  const ids = room.ships.map(ship => ship.id);
  for (const formation of ['column', 'line', 'wedge']) {
    toggleReady(state);
    applyFormation(state, formation);
    assert.equal(state.ready, false);
    assert.deepEqual(room.ships.map(ship => ship.id), ids);
    assert.equal(new Set(room.ships.map(ship => `${ship.team}:${ship.slot}`)).size, 128);
    assert.equal(other.team, 'bravo');
    assert.equal(other.slot, 200);
    assert.ok(formationPageCount(room, 'alpha') > 1);
  }
  assert.deepEqual(room.ships.slice(0, 5).map(ship => ship.slot), [2, 7, 9, 12, 16]);
});

test('empty fleets cannot READY and leaving/rejoining retains room-specific formations', () => {
  const state = createLobbyState();
  const room = createRoom(state, 'persistent', 16, 'open');
  joinRoom(state);
  moveShip(state, room.ships[0].id, 'bravo', 144);
  leaveRoom(state);
  joinRoom(state);
  assert.equal(room.ships[0].slot, 144);
  assert.equal(room.ships[0].team, 'bravo');
  selectShip(state, room.ships[0].id);
  removeShip(state);
  assert.throws(() => toggleReady(state), LobbyInputError);
  assert.equal(canStart(state), false);
  leaveRoom(state);
  joinRoom(state);
  assert.equal(room.ships.length, 0);
  assert.throws(() => beginBattle(state), LobbyInputError);
});

test('world coastline loading accepts the downloaded GeoJSON and unwraps the actual map seam', async t => {
  const data = await readFile(new URL('../../content/data/maps/world-land.geojson', import.meta.url), 'utf8');
  t.mock.method(globalThis, 'fetch', async () => new Response(data));
  const polygons = await loadWorldLand();
  assert.ok(polygons.length > 0);
  for (const polygon of polygons) {
    for (const ring of polygon) {
      const projected = unwrapRing(ring);
      for (let index = 1; index < projected.length; index++) {
        if (Math.abs(projected[index][0] - projected[index - 1][0]) > .5) {
          assert.equal(projected[index][1], projected[index - 1][1]);
          assert.ok(projected[index][1] === 0 || projected[index][1] === 1);
        }
      }
      assert.ok(Math.abs(projected[0][0] - projected.at(-1)[0]) < .000001);
    }
  }
  const ring = unwrapRing([[-71, 10], [-69, 10], [-69, 0], [-71, 0], [-71, 10]]);
  assert.ok(Math.abs(ring[1][0] - ring[0][0]) < .01);
  assert.deepEqual(worldPoint(180, 0), worldPoint(-180, 0));
  t.mock.method(globalThis, 'fetch', async () => new Response('{"features":[{"geometry":{"type":"Polygon","coordinates":[[["x",0]]]}}]}'));
  await assert.rejects(loadWorldLand(), /无效陆地多边形/);
});
