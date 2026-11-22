import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const root = new URL('../../content/', import.meta.url);
const files = [
  ...['yamato', 'bismarck', 'california', 'yorktown'].map(key => `assets/ships/${key}/${key}.glb`),
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
