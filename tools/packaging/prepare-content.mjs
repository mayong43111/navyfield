import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const root = new URL('../../content/', import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('manifests/ship-model-catalog.json', root), 'utf8'));
const files = [
  ...catalog.targetModels.filter(model => model.runtimeAsset).map(model => model.runtimeAsset.replace(/^content\//, '')),
  'data/legacy/official-data.json',
  'data/maps/world-land.geojson'
];
let original = 0, compressed = 0;
for (const path of files) {
  const source = readFileSync(new URL(path, root));
  const packed = gzipSync(source, { level: 9 });
  writeFileSync(new URL(`${path}.gz.bin`, root), packed);
  original += source.length;
  compressed += packed.length;
}
console.log(`Prepared lossless runtime transport: ${files.length} files, ${original} -> ${compressed} bytes.`);
