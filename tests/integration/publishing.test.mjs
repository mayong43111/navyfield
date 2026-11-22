import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../../vite.config.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
function temporary(t) {
  const directory = mkdtempSync(join(tmpdir(), 'navyfield-publish-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('Git permits only approved runtime resources, not original downloads or research', t => {
  const directory = temporary(t);
  execFileSync('git', ['init', '--quiet'], { cwd: directory });
  copyFileSync(join(root, '.gitignore'), join(directory, '.gitignore'));
  const allowed = ['content/manifests/ship-model-catalog.json', 'content/data/maps/world-land.geojson',
    'content/data/maps/source.json', 'content/data/legacy/official-data.json',
    'content/assets/README.md', 'art/models/README.md', 'audio/music/README.md'];
  for (const key of ['yamato', 'bismarck', 'california', 'yorktown']) {
    allowed.push(...[`${key}.glb`, 'LICENSE.txt', 'source.json', 'conversion.json'].map(file => `content/assets/ships/${key}/${file}`));
  }
  const blocked = ['resources/manuals/NavyField_Full_Manual.pdf', 'resources/official-screenshots/ship.jpg',
    'resources/models/yamato/3MF_files.zip', 'resources/models/yamato/hull.stl',
    'resources/models/bismarck/original.3mf', 'resources/models/pending-license/unknown.glb',
    'resources/models/new-model/new-model.glb', 'resources/models/ship-model-coverage.csv',
    'resources/original-data/ships.csv', 'resources/index.html',
    'research/models/yamato/3MF_files.zip', 'research/models/catalog.json',
    'research/manuals/NavyField_Full_Manual.pdf', 'research/original-data/official-data.json',
    'content/assets/ships/yamato/original.3mf', 'content/assets/ships/unknown/unknown.glb',
    'art/models/yamato.blend', 'audio/music/original.wav',
    'builds/game.zip', 'releases/game.zip', 'cache/download.json'];
  const ignored = execFileSync('git', ['check-ignore', '--no-index', '--stdin'], {
    cwd: directory, input: [...allowed, ...blocked].join('\n') + '\n', encoding: 'utf8'
  }).trim().split(/\r?\n/);
  assert.deepEqual(ignored.sort(), blocked.sort());
});

test('runtime matching manifest does not expose research file paths or downloaded-file inventories', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'content', 'manifests', 'ship-model-catalog.json'), 'utf8'));
  assert.ok(manifest.models.length > 0);
  for (const model of manifest.models) {
    assert.ok(Array.isArray(model.shipIds) && model.shipIds.length > 0);
    assert.equal('sourceFile' in model, false);
    assert.equal('runtimeFile' in model, false);
    assert.equal('files' in model, false);
    assert.equal('downloadedFiles' in model, false);
  }
});

test('build copies attribution only, and respects the resolved output directory', t => {
  const directory = temporary(t);
  const plugin = config.plugins.find(plugin => plugin.name === 'copy-runtime-credits');
  assert.ok(plugin);
  plugin.configResolved({ root, build: { outDir: directory } });
  plugin.closeBundle();
  assert.deepEqual(readdirSync(directory), ['credits']);
  assert.equal(existsSync(join(directory, 'resources')), false);
  const credits = join(directory, 'credits');
  assert.deepEqual(readdirSync(credits).sort(), ['models', 'three-LICENSE.txt', 'world-land-source.json']);
  assert.deepEqual(readdirSync(join(credits, 'models')).sort(), ['bismarck', 'california', 'yamato', 'yorktown']);
  for (const key of readdirSync(join(credits, 'models'))) {
    assert.deepEqual(readdirSync(join(credits, 'models', key)).sort(), ['LICENSE.txt', 'conversion.json', 'source.json']);
  }
});
