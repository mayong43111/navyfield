import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTargetContent } from '../../src/domain/target-content.ts';
import { createTargetBattleConfig } from '../../src/adapters/local/target-battle-config.ts';
import { createTargetGroup, setTargetMode, setTargetShell, readyTargetTubes, consumeTargetTubes, setTargetAutomatic } from '../../src/simulation/target-weapons.ts';
const content = parseTargetContent(JSON.parse(readFileSync(new URL('../../content/data/ships/target.json', import.meta.url), 'utf8')));
function fixture(typeId = 'escort_dd') {
  const ship = content.ships[typeId], config = createTargetBattleConfig(content, { typeId, bulgeLevel: 0,
    weapons: Array(ship.main_mounts).fill(ship.main_weapon_id), ammunition: [] }, { team: 'alpha', slot: 0 }, 43111);
  const definition = config.target.groups.find(d => d.side === 'player' && d.slot === 'main');
  return { definition, group: createTargetGroup(content, definition, content.rooms.duel.initial_reload_s) };
}

test('Fletcher surface/air and AP/HE share the same four physical tubes, readiness and ammunition', () => {
  const { definition, group } = fixture();
  setTargetShell(content, definition, group, 'AP', 0);
  setTargetMode(content, definition, group, 'air', 0);
  assert.equal(group.shellType, 'HE'); assert.equal(group.surfaceShellType, 'AP');
  assert.equal(group.switchReadyAt, content.controls['escort_dd:main'].mode_switch_s);
  assert.throws(() => readyTargetTubes(content, definition, group, null, 6.99));
  const tubes = readyTargetTubes(content, definition, group, null, 7); consumeTargetTubes(content, group, tubes, 7);
  assert.equal(tubes.length, content.ships.escort_dd.main_mounts * content.ships.escort_dd.main_barrels);
  assert.ok(group.tubes.every(t => t.remaining === content.weapons.gun_127_rapid.ammo_per_barrel - 1 && t.readyAt === 10.5));
  const before = structuredClone(group.tubes);
  setTargetMode(content, definition, group, 'surface', 8);
  assert.equal(group.shellType, 'AP'); assert.deepEqual(group.tubes, before);
  assert.throws(() => readyTargetTubes(content, definition, group, null, 10.49));
  assert.equal(readyTargetTubes(content, definition, group, null, 10.5).length, 4);
  const deadline = group.switchReadyAt;
  assert.equal(setTargetMode(content, definition, group, 'surface', 9), false);
  assert.equal(group.switchReadyAt, deadline);
});

test('AP in air mode rejects without resource changes, and repeat switching cannot shorten readiness', () => {
  const { definition, group } = fixture();
  setTargetMode(content, definition, group, 'air', 7);
  const before = structuredClone(group);
  assert.throws(() => setTargetShell(content, definition, group, 'AP', 8)); assert.deepEqual(group, before);
  setTargetMode(content, definition, group, 'surface', 8);
  setTargetMode(content, definition, group, 'air', 9);
  assert.equal(group.switchReadyAt, 11.5);
  assert.throws(() => readyTargetTubes(content, definition, group, null, 11));
});

test('gradual cadence is whole-group reload/N; tube deadlines, mount selection and salvo switching cannot reset it', () => {
  const { definition, group } = fixture(); group.pattern = 'gradual';
  const cadence = content.weapons[group.weaponId].reload_s / group.tubes.length;
  for (let index = 0; index < 4; index++) {
    const time = 7 + index * cadence, tubes = readyTargetTubes(content, definition, group, null, time);
    assert.deepEqual(tubes, [index]); consumeTargetTubes(content, group, tubes, time);
    assert.equal(group.tubes[index].readyAt, time + content.weapons[group.weaponId].reload_s);
  }
  assert.deepEqual(readyTargetTubes(content, definition, group, null, 10.5), [0]);
  assert.throws(() => readyTargetTubes(content, definition, group, 1, 10.5));
  group.pattern = 'salvo'; assert.throws(() => readyTargetTubes(content, definition, group, null, 10.5));
  const nextRequest = group.nextRequestAt; group.pattern = 'gradual';
  assert.equal(group.nextRequestAt, nextRequest);
  assert.deepEqual(readyTargetTubes(content, definition, group, 0, 100), [0]);
});

test('a single empty tube blocks salvo but gradual can fire another; a disabled automatic bank keeps ammo and reload', () => {
  const { definition, group } = fixture(); group.tubes[0].remaining = 0;
  assert.throws(() => readyTargetTubes(content, definition, group, null, 7));
  group.pattern = 'gradual'; assert.deepEqual(readyTargetTubes(content, definition, group, null, 7), [1]);
  group.control = 'automatic'; group.targetId = 'aircraft'; group.lockReadyAt = 8;
  const tubes = structuredClone(group.tubes), next = group.nextRequestAt;
  setTargetAutomatic(group, false); setTargetAutomatic(group, true);
  assert.deepEqual(group.tubes, tubes); assert.equal(group.nextRequestAt, next);
  assert.equal(group.targetId, null); assert.equal(group.lockReadyAt, 0);
});
