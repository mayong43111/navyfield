import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

const execute = promisify(execFile);
const cache = process.argv[2];
if (!cache) throw new Error('Usage: node tools\\data\\fetch-original-data.mjs <cache-directory>');
const output = new URL('../../research/original-data/', import.meta.url);
const runtime = new URL('../../content/data/legacy/', import.meta.url);
await mkdir(cache, { recursive: true });
await mkdir(output, { recursive: true });
const base = 'https://www.navyfield.com';
const nations = ['Neutral', 'USNavy', 'RoyalNavy', 'ImperialNavy', 'Kriegsmarine',
  'MarineNationale', 'SovietNavy', 'RegiaMarina', 'ChineseNavy'];
const failures = [];
async function get(path, key) {
  const file = join(cache, `${key}.txt`);
  let text;
  try { text = await readFile(file, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (text) return text;
  const { stdout } = await execute('curl.exe', ['-4', '-f', '-L', '--compressed', '--connect-timeout', '12',
    '--max-time', '60', '--retry', '2', '--retry-all-errors', '--retry-delay', '2', '-sS', `${base}${path}`],
  { maxBuffer: 4 * 1024 * 1024 });
  if (!stdout.trim()) throw new Error(`Empty response: ${path}`);
  await writeFile(file, stdout);
  return stdout;
}
async function batch(items, action) {
  let next = 0;
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (next < items.length) {
      const item = items[next++];
      try { await action(item); }
      catch (error) {
        const failure = { item, message: error.message };
        failures.push(failure);
        console.error(JSON.stringify(failure));
      }
    }
  }));
}
function document(html) {
  const dom = new JSDOM(html);
  return dom.window.document;
}
async function downloadMany(requests, label) {
  const missing = [];
  for (const request of requests) {
    try {
      const text = await readFile(join(cache, `${request.key}.txt`), 'utf8');
      if (!text.trim()) missing.push(request);
      else if (request.key.startsWith('ship-')) {
        try { JSON.parse(text); }
        catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
          missing.push(request);
        }
      }
    }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      missing.push(request);
    }
  }
  if (!missing.length) return;
  const config = join(cache, `${label}.curl`);
  await writeFile(config, missing.map(request =>
    `url = "${base}${request.path}"\noutput = ${JSON.stringify(join(cache, `${request.key}.txt`))}`).join('\n'));
  console.log(`Downloading ${missing.length} ${label} records with shared connections`);
  try {
    await execute('curl.exe', ['-4', '-f', '-L', '--compressed', '--parallel', '--parallel-max', '4',
      '--connect-timeout', '6', '--max-time', '20', '--retry', '1', '--retry-all-errors',
      '--retry-delay', '2', '-sS', '-K', config], { maxBuffer: 4 * 1024 * 1024 });
  } catch (error) {
    console.error(`${label} transport errors: ${error.stderr}`);
  }
}
const clean = text => text.replace(/\s+/g, ' ').trim();
const ships = [];
const treeCounts = [];
await batch(nations.map((directory, nation) => ({ directory, nation })), async ({ directory, nation }) => {
  const path = `/GameInfo/ShipTree/${directory}/Main.aspx`;
  const doc = document(await get(path, `tree-${nation}`));
  const rows = [...doc.querySelectorAll('img.shiptree')];
  if (!rows.length) throw new Error(`Ship tree has no entries: ${directory}`);
  for (const image of rows) {
    const match = image.className.match(/\bshiptree\s+(\d+)\//);
    if (!match) throw new Error(`Unrecognized ship identifier: ${image.className}`);
    const serial = Number(match[1]);
    if (ships.some(ship => ship.nation === nation && ship.serial === serial)) continue;
    ships.push({ id: `nf-${nation}-${serial}`, nation, serial, treeName: clean(image.alt),
      treeSource: `${base}${path}`, source: `${base}/GameInfo/ShipTree/Ajax/GetInfo.aspx?serial=${serial}&nation=${nation}`,
      raw: null });
  }
  treeCounts.push({ nation, directory, count: ships.filter(ship => ship.nation === nation).length });
  console.log(`Tree ${directory}: ${rows.length}`);
});
ships.sort((a, b) => a.nation - b.nation || a.serial - b.serial);
const components = { guns: [], armor: [], shells: [] };
const shellRequests = new Map();
await batch(Array.from({ length: 8 }, (_, nation) => nation), async nation => {
  const path = `/GameInfo/Components/NavalGun.aspx?nation=${nation}`;
  const doc = document(await get(path, `guns-${nation}`));
  const rows = [...doc.querySelectorAll('tr[id^="gun_"]')];
  if (!rows.length) throw new Error(`Gun table has no entries: ${nation}`);
  for (const row of rows) {
    const cells = [...row.children].filter(cell => cell.tagName === 'TD').map(cell => clean(cell.textContent));
    if (cells.length !== 11) throw new Error(`Gun row has ${cells.length} cells: ${row.id}`);
    const headers = ['model', 'space', 'weightKg', 'level', 'sailorType', 'buySellPrice',
      'maxAngle', 'rotationSpeed', 'reloadSeconds', 'calibreInches', 'muzzleSpeed'];
    const raw = Object.fromEntries(headers.map((header, i) => [header, cells[i]]));
    const preceding = [...doc.querySelectorAll('img')].filter(image =>
      /_17_\d+\.gif/.test(image.src) && (row.compareDocumentPosition(image) & 2));
    const mountGroup = preceding.at(-1)?.getAttribute('src')?.match(/_17_(\d+)\.gif/)?.[1];
    if (!mountGroup) throw new Error(`Missing mount group: ${row.id}`);
    const handler = row.getAttribute('onclick') ?? '';
    const calibre = handler.match(/DoShellInfo\([^,]+,\s*[^,]+,\s*['"]?([\d.]+)/)?.[1];
    if (!calibre) throw new Error(`Missing shell lookup key: ${row.id}`);
    components.guns.push({ id: `nf-gun-${nation}-${row.id.slice(4)}`, nation, mountGroup,
      shellKey: `${nation}-${calibre}`, source: `${base}${path}`, raw });
    if (calibre) shellRequests.set(`${nation}-${calibre}`, { nation, calibre });
  }
  console.log(`Guns ${nation}: ${rows.length}`);
});
await batch([0], async nation => {
  const path = `/GameInfo/Components/Armor.aspx?nation=${nation}`;
  const doc = document(await get(path, `armor-${nation}`));
  const table = doc.querySelector('table.componentList');
  if (!table) throw new Error(`Armor table missing: ${nation}`);
  const rows = [...table.rows].map(row => [...row.cells].map(cell => clean(cell.textContent)));
  if (rows.length < 2) throw new Error(`Armor table empty: ${nation}`);
  components.armor.push({ nation, source: `${base}${path}`, rows });
  console.log(`Armor ${nation}: ${rows.length} rows`);
});
await downloadMany(ships.map(ship => ({ key: `ship-${ship.nation}-${ship.serial}`,
  path: `/GameInfo/ShipTree/Ajax/GetInfo.aspx?serial=${ship.serial}&nation=${ship.nation}` })), 'ship-details');
await batch(ships, async ship => {
  const path = `/GameInfo/ShipTree/Ajax/GetInfo.aspx?serial=${ship.serial}&nation=${ship.nation}`;
  const data = JSON.parse(await readFile(join(cache, `ship-${ship.nation}-${ship.serial}.txt`), 'utf8'));
  if (String(data.Result) !== '1') throw new Error(`Ship information unavailable: ${ship.id}`);
  ship.raw = data;
  if (ship.serial % 20 === 0) console.log(`Ship detail ${ship.id}`);
});
await downloadMany([...shellRequests.values()].map(({ nation, calibre }) => ({
  key: `shell-${nation}-${calibre}`, path: `/GameInfo/Components/NavalGunShell.aspx?nation=${nation}&calibre=${calibre}`
})), 'shell-details');
await batch([...shellRequests.values()], async ({ nation, calibre }) => {
  const path = `/GameInfo/Components/NavalGunShell.aspx?nation=${nation}&calibre=${calibre}`;
  const doc = document(await readFile(join(cache, `shell-${nation}-${calibre}.txt`), 'utf8'));
  const rows = [...doc.querySelectorAll('tr')].map(row => [...row.children]
    .filter(cell => cell.tagName === 'TD' || cell.tagName === 'TH').map(cell => clean(cell.textContent)));
  const flatRows = rows.filter(row => row.length > 1 && !row.some(cell => cell.length > 200));
  if (!flatRows.length) throw new Error(`Shell table missing: ${nation}/${calibre}`);
  components.shells.push({ nation, calibre, source: `${base}${path}`, rows: flatRows });
});
for (const key of Object.keys(components)) components[key].sort((a, b) => a.nation - b.nation || (a.id ?? a.calibre ?? '').localeCompare(b.id ?? b.calibre ?? ''));
const data = {
  game: 'Navy Field (classic)', capturedAt: new Date().toISOString(),
  version: 'Official website snapshot; client/server build not specified',
  nations, treeCounts: treeCounts.sort((a, b) => a.nation - b.nation), ships, ...components, failures
};
await writeFile(new URL('official-data.json', output), JSON.stringify(data, null, 2));
await mkdir(runtime, { recursive: true });
await writeFile(new URL('official-data.json', runtime), JSON.stringify(data, null, 2));
function csv(rows) {
  return '\uFEFF' + rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
}
const shipColumns = ['ShipName2', 'ShipClass', 'ShipType', 'ShipLevel', 'ShipDurabillity',
  'ShipDisplacementNormal', 'ShipDisplacementStandard', 'ShipDisplacementMaximum',
  'ShipTurningForce', 'ShipStructuralStrength', 'ShipAAWDefence', 'ShipOverheatRatio',
  'ShipRMount', 'ShipTMount', 'ShipFCS', 'ShipEngine', 'ShipSupportSailorSlot',
  'ShipAircraftLoadingCapacity', 'ShipNumberOfAircraftTakeOff'];
await writeFile(new URL('ships.csv', output), csv([
  ['id', 'nation', 'treeName', 'detailAvailable', ...shipColumns, 'source'],
  ...ships.map(ship => [ship.id, nations[ship.nation], ship.treeName, ship.raw !== null,
    ...shipColumns.map(key => ship.raw?.[key]), ship.source])
]));
const gunColumns = ['model', 'space', 'weightKg', 'level', 'sailorType', 'maxAngle',
  'rotationSpeed', 'reloadSeconds', 'calibreInches', 'muzzleSpeed'];
await writeFile(new URL('guns.csv', output), csv([
  ['id', 'nation', 'mountGroup', 'shellKey', ...gunColumns, 'source'],
  ...components.guns.map(gun => [gun.id, nations[gun.nation], gun.mountGroup, gun.shellKey,
    ...gunColumns.map(key => gun.raw[key]), gun.source])
]));
await writeFile(new URL('shells.csv', output), csv([
  ['nation', 'lookupKey', 'Shell Type', 'Space per bind', 'Weight per bind', 'Buy/Sell Price',
    'Bind', 'AP Bonus', 'HE Damage', 'Weight per shell', 'Calibre', 'source'],
  ...components.shells.flatMap(table => table.rows.filter(row => row.length === 9 && row[0] !== 'Shell Type')
    .map(row => [nations[table.nation], table.calibre, ...row, table.source]))
]));
await writeFile(new URL('armor.csv', output), csv([
  ['source', 'Armor', 'Nation', 'Req.Weight', 'Buy/Sell Price', 'AP Defence', 'HE Defence', 'Bulk Head', 'Bulge'],
  ...components.armor.flatMap(table => table.rows.slice(1).map(row => [table.source, ...row]))
]));
console.log(JSON.stringify({ ships: ships.length, details: ships.filter(ship => ship.raw).length,
  guns: components.guns.length, armorTables: components.armor.length, shellTables: components.shells.length,
  failures: failures.length }));
if (failures.length) process.exitCode = 1;
