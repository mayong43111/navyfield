import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createAmmunition } from '../../src/ammunition.ts';
import { gunReadout, parseShipModelMatches, renderShipTypes } from '../../src/ui.ts';
import { parseOriginalData } from '../../src/original-data.ts';

test('ship model matching keeps the most advanced source and rejects malformed metadata', () => {
  const matches = parseShipModelMatches({ models: [
    { shipIds: ['yamato', 'bismarck'], status: 'link_only' },
    { shipIds: ['yamato'], status: 'integrated' },
    { shipIds: ['yamato', 'bismarck'], status: 'downloaded' }
  ] });
  assert.equal(matches.get('yamato'), 'integrated');
  assert.equal(matches.get('bismarck'), 'downloaded');
  for (const value of [null, {}, { models: [{}] }, { models: [{ shipIds: ['yamato'], status: 'unknown' }] },
    { models: [{ shipIds: [42], status: 'downloaded' }] }]) {
    assert.throws(() => parseShipModelMatches(value), /模型/);
  }
});

test('shipyard lists matched ships first, labels types and preserves selectable unmatched hulls', () => {
  const data = parseOriginalData(JSON.parse(readFileSync(new URL('../../content/data/legacy/official-data.json', import.meta.url), 'utf8')));
  const matches = parseShipModelMatches(JSON.parse(readFileSync(new URL('../../content/manifests/ship-model-catalog.json', import.meta.url), 'utf8')));
  const { window } = new JSDOM('<style></style><select id="yard-ship-type"></select>');
  const document = window.document;
  document.querySelector('style').textContent = readFileSync(new URL('../../src/interface.css', import.meta.url), 'utf8');
  const select = document.querySelector('select');
  renderShipTypes(select, data.ships, matches);
  assert.equal(select.options.length, data.ships.length);
  const options = [...select.options];
  const firstUnmatched = options.findIndex(option => option.dataset.modelMatched === 'false');
  assert.ok(firstUnmatched > 0);
  assert.ok(options.slice(0, firstUnmatched).every(option => matches.has(option.value)));
  assert.ok(options.slice(firstUnmatched).every(option => !matches.has(option.value)));
  const byId = new Map(options.map(option => [option.value, option]));
  assert.match(byId.get('nf-3-121').textContent, /大和 · 战列舰 · 已接入/);
  assert.match(byId.get('nf-4-116').textContent, /俾斯麦 · 战列舰 · 已接入/);
  assert.match(byId.get('nf-1-102').textContent, /约克镇 · 航空母舰 · 已接入/);
  assert.match(byId.get('nf-1-430').textContent, /加利福尼亚 · 战列舰 · 已接入/);
  assert.match(byId.get('nf-4-12').textContent, /重巡洋舰 · 来源匹配/);
  assert.match(byId.get('nf-1-4').textContent, /驱逐舰 · 未匹配/);
  assert.equal(byId.get('nf-1-4').disabled, false);
  for (const ship of data.ships) {
    assert.equal(byId.get(ship.id).disabled, !ship.available || ship.durability === null);
  }
  const unmatched = window.getComputedStyle(byId.get('nf-1-4'));
  assert.notEqual(unmatched.color, window.getComputedStyle(byId.get('nf-3-121')).color);
  const luminance = color => {
    const channels = color.match(/\d+/g).slice(0, 3).map(Number);
    const linear = channels.map(value => value / 255 <= 0.04045
      ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4);
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  assert.ok((luminance(unmatched.color) + 0.05) / (luminance(unmatched.backgroundColor) + 0.05) >= 4.5);
  select.dataset.modelMatched = 'false';
  assert.equal(window.getComputedStyle(select).color, unmatched.color);
});

test('a loaded gun is not shown as able to fire outside its arc or while turning', () => {
  const gun = { ammunition: createAmmunition(), reload: 0 };
  assert.deepEqual(gunReadout(gun, 3, 17.64, 'limited'),
    { status: '射界受限', canFire: false, progress: 1 });
  assert.equal(gunReadout(gun, 3, 17.64, 'turning').canFire, false);
  assert.equal(gunReadout(gun, 3, 17.64, 'aligned').canFire, true);
});

test('each readout reflects its own reload and selected locker, not spare ammunition', () => {
  const front = { ammunition: createAmmunition(), reload: 8.82 };
  const rear = { ammunition: createAmmunition(), reload: 0 };
  assert.deepEqual(gunReadout(front, 3, 17.64, 'aligned'),
    { status: '装填 8.8s', canFire: false, progress: 0.5 });
  assert.equal(gunReadout(rear, 3, 17.64, 'aligned').canFire, true);
  rear.ammunition.lockers.A.remaining = 2;
  assert.equal(gunReadout(rear, 3, 17.64, 'aligned').status, '缺弹');
  rear.ammunition.selected = 'B';
  assert.equal(gunReadout(rear, 3, 17.64, 'aligned').canFire, true);
});

test('an empty mount has no readiness or loading progress', () => {
  const gun = { ammunition: createAmmunition(), reload: 8 };
  assert.deepEqual(gunReadout(gun, 3, null, 'aligned'),
    { status: '未装备', canFire: false, progress: 0 });
  assert.throws(() => gunReadout(gun, 3, 0, 'aligned'), RangeError);
});
