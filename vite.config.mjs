import { cpSync } from 'node:fs';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [{
    name: 'copy-research-resources',
    apply: 'build',
    closeBundle() {
      cpSync('resources', 'dist/resources', { recursive: true });
    }
  }]
});
