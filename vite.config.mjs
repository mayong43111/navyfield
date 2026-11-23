import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig } from 'vite';

let root, output;
export default defineConfig({
  base: process.env.GITHUB_PAGES_BASE || '/',
  plugins: [{
    name: 'copy-runtime-credits',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      output = resolve(root, config.build.outDir);
    },
    closeBundle() {
      if (!root || !output) throw new Error('Runtime credits require a resolved build directory');
      const catalog = JSON.parse(readFileSync(join(root, 'content', 'manifests', 'ship-model-catalog.json'), 'utf8'));
      for (const { modelId: key } of catalog.targetModels.filter(model => model.runtimeAsset)) {
        const directory = join(output, 'credits', 'models', key);
        mkdirSync(directory, { recursive: true });
        for (const file of ['LICENSE.txt', 'source.json', 'conversion.json']) {
          copyFileSync(join(root, 'content', 'assets', 'ships', key, file), join(directory, file));
        }
      }
      copyFileSync(join(root, 'content', 'data', 'maps', 'source.json'), join(output, 'credits', 'world-land-source.json'));
      copyFileSync(join(root, 'node_modules', 'three', 'LICENSE'), join(output, 'credits', 'three-LICENSE.txt'));
    }
  }]
});
