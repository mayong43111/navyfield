import test from 'node:test';
import assert from 'node:assert/strict';
import { originalNumber, parseOriginalData } from '../src/original-data.ts';

const snapshot = () => ({
  capturedAt: '2026-11-21', version: 'official website', failures: [], armor: [], shells: [],
  ships: [
    { id: 'nf-3-121', nation: 3, treeName: 'Yamato Lv 89', source: 'https://www.navyfield.com/GameInfo/ShipTree/Ajax/GetInfo.aspx?serial=121&nation=3',
      raw: { ShipName2: 'Yamato', ShipType: 'Battle Ship(BB)', ShipDurabillity: '26,300', ShipLevel: '89',
        ShipDisplacementStandard: '64,000t', ShipDisplacementMaximum: '72,800t', ShipRMount: '497 / 497 / 497' } },
    { id: 'nf-0-0', nation: 0, treeName: 'Frigate-01', source: 'https://www.navyfield.com/', raw: null }
  ],
  guns: [{ id: 'nf-gun-3-342', nation: 3, mountGroup: '03', shellKey: '3-31',
    source: 'https://www.navyfield.com/GameInfo/Components/NavalGun.aspx?nation=3',
    raw: { model: '18.1"/45 Type 94 L', reloadSeconds: '19.40', rotationSpeed: '18', muzzleSpeed: '923' } }]
});

test('official ship units and missing details remain distinct from prototype values', () => {
  const data = parseOriginalData(snapshot());
  assert.equal(data.ships[0].name, '大和');
  assert.equal(data.ships[0].durability, 26300);
  assert.equal(data.ships[0].standardDisplacement, 64000);
  assert.deepEqual(data.ships[0].rMounts, [497, 497, 497]);
  assert.equal(data.ships[1].available, false);
  assert.equal(data.ships[1].durability, null);
  assert.deepEqual(data.ships[1].rMounts, []);
  assert.equal(data.guns[0].reloadSeconds, 19.4);
  assert.equal(data.guns[0].raw.muzzleSpeed, '923');
});

test('invalid numbers, malformed tables and duplicate identities fail explicitly', () => {
  assert.equal(originalNumber('0'), 0);
  assert.equal(originalNumber('-'), null);
  assert.throws(() => originalNumber('not a value'), /格式错误/);
  assert.throws(() => originalNumber('64000kg', 't'), /格式错误/);
  const bad = snapshot();
  bad.guns[0].raw.reloadSeconds = '0';
  assert.throws(() => parseOriginalData(bad), /装填时间/);
  const duplicate = snapshot();
  duplicate.ships.push(duplicate.ships[0]);
  assert.throws(() => parseOriginalData(duplicate), /重复编号/);
});
