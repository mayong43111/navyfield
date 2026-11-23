import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseTargetContent, createTargetOriginalData, loadTargetContent } from '../../src/adapters/content/target-content.ts';
const url = new URL('../../content/data/ships/target.json', import.meta.url);
const raw = () => JSON.parse(readFileSync(url, 'utf8'));

test('runtime export has exactly the ten numeric sources, version and reproducible input hash, without models or experiments', () => {
  const data = raw(), content = parseTargetContent(data), hash = createHash('sha256');
  assert.equal(content.rulesVersion, 'target-v1.3.0');
  assert.equal(content.schemaVersion, 3);
  assert.equal(Object.keys(content.ships).length, 12);
  assert.equal(content.inputFiles.length, 10);
  for (const file of content.inputFiles) {
    assert.match(file, /^design-data\/source\//);
    assert.doesNotMatch(file, /models|experiments|reports/);
    hash.update(file); hash.update('\0'); hash.update(readFileSync(new URL(`../../${file}`, import.meta.url)));
  }
  assert.equal(content.inputSha256, hash.digest('hex'));
  for (const key of ['models', 'settings', 'scenarios', 'results', 'input_sha256']) assert.ok(!(key in data));
  const withModels = parseTargetContent({ ...data, models: { arbitraryVisualScale: 999 } });
  assert.deepEqual(withModels, content);
});

test('all ship and weapon numeric fields come from CSV, not compatibility strings', () => {
  const content = parseTargetContent(raw());
  for (const table of ['ships', 'weapons', 'armor', 'shells', 'rooms', 'automation', 'controls', 'weapon_modes']) {
    const lines = readFileSync(new URL(`../../design-data/source/${table}.csv`, import.meta.url), 'utf8').trim().split(/\r?\n/);
    const fields = lines.shift().split(',');
    for (const line of lines) {
      const values = line.split(','), row = content[table][values[0]];
      for (let index = 0; index < fields.length; index++) if (typeof row[fields[index]] === 'number') assert.equal(row[fields[index]], Number(values[index]), `${table}/${values[0]}/${fields[index]}`);
    }
  }
});

test('compatibility view exposes all twelve official CSV IDs and nation IDs without supplying runtime stats', () => {
  const content = parseTargetContent(raw()), view = createTargetOriginalData(content);
  assert.deepEqual(view.ships.map(s => s.id), Object.keys(content.ships));
  assert.ok(view.ships.every(s => s.available && s.durability === content.ships[s.id].hp));
  assert.equal(view.ships.find(s => s.id === 'yamato').nation, 3);
  assert.equal(view.ships.find(s => s.id === 'bismarck').nation, 4);
  assert.equal(view.ships.find(s => s.id === 'escort_dd').nation, 1);
  assert.equal(view.ships.find(s => s.id === 'yorktown').raw.targetMainWeaponId, 'aircraft_bomber');
  assert.equal(view.guns.find(w => w.id === 'aircraft_bomber').raw.targetKind, 'aircraft');
});

test('content loader uses the one runtime file and rejects malformed versions, references and nonfinite numbers', async () => {
  const saved = globalThis.fetch;
  try {
    globalThis.fetch = async request => {
      assert.match(String(request), /content\/data\/ships\/target\.json$/);
      return new Response(JSON.stringify(raw()), { headers: { 'content-type': 'application/json' } });
    };
    assert.deepEqual(await loadTargetContent(), parseTargetContent(raw()));
  } finally { globalThis.fetch = saved; }
  let data = raw(); data.rulesVersion = 'single-ship-v1'; assert.throws(() => parseTargetContent(data));
  data = raw(); data.ships.escort_dd.hp = NaN; assert.throws(() => parseTargetContent(data));
  data = raw(); data.ships.yamato.main_weapon_id = 'visual-turret'; assert.throws(() => parseTargetContent(data));
  data = raw(); data.inputFiles.push('design-data/source/models.csv'); assert.throws(() => parseTargetContent(data));
  data = raw(); delete data.weapons.gun_127_rapid.damage; assert.throws(() => parseTargetContent(data));
  data = raw(); data.weapons.gun_460.reload_s = '29'; assert.throws(() => parseTargetContent(data));
  data = raw(); delete data.rules.aircraft_hp; assert.throws(() => parseTargetContent(data));
  data = raw(); data.ships.yamato.models = { parser: () => 'visual-only' }; data.rules.visual = { scale: 999 };
  assert.deepEqual(parseTargetContent(data), parseTargetContent(raw()));
});
