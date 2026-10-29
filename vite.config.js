import { defineConfig } from 'vite';
import { readFile } from 'node:fs/promises';
import { localRiftBlazePlugin } from './scripts/localRiftBlazePlugin.js';
import { vehicleAssetsPlugin } from './scripts/vehicleAssetsPlugin.js';
import { publicCreditsPlugin } from './scripts/publicCreditsPlugin.js';

export default defineConfig({
  // These are lazy-loaded only in the garage. Prebundle them together in dev so
  // discovering a new addon does not reload the page and erase a pilot choice.
  optimizeDeps: {
    include: [
      'three',
      'three/addons/loaders/GLTFLoader.js',
      'three/addons/utils/BufferGeometryUtils.js',
      'three/addons/environments/RoomEnvironment.js',
    ],
  },
  build: {
    // Copy only reviewed assets instead of recursively publishing public/.
    copyPublicDir: false,
  },
  plugins: [localRiftBlazePlugin(), vehicleAssetsPlugin(), publicCreditsPlugin(), {
    name: 'copy-approved-public-assets',
    apply: 'build',
    async generateBundle() {
      for (const [sourcePath, fileName] of [
        ['./public/favicon.svg', 'favicon.svg'],
      ]) {
        const source = await readFile(new URL(sourcePath, import.meta.url));
        this.emitFile({ type: 'asset', fileName, source });
      }
    },
  }],
});
