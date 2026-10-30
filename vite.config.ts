import { defineConfig } from 'vite';
import { readFile } from 'node:fs/promises';
import { localRiftBlazePlugin } from './scripts/localRiftBlazePlugin.ts';
import { vehicleAssetsPlugin } from './scripts/vehicleAssetsPlugin.ts';
import { publicCreditsPlugin } from './scripts/publicCreditsPlugin.ts';
import { raceAudioPlugin } from './scripts/raceAudioPlugin.ts';
import { vehicleTuningDevPlugin } from './scripts/vehicleTuningDevPlugin.ts';

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
  plugins: [localRiftBlazePlugin(), vehicleAssetsPlugin(), publicCreditsPlugin(), raceAudioPlugin(), vehicleTuningDevPlugin(), {
    name: 'copy-approved-public-assets',
    apply: 'build',
    async generateBundle() {
      for (const [sourcePath, fileName] of [
        ['./public/assets/ui/favicon.svg', 'assets/ui/favicon.svg'],
        ['./public/assets/hud/icons/shots.png', 'assets/hud/icons/shots.png'],
        ['./public/assets/hud/icons/bomb.png', 'assets/hud/icons/bomb.png'],
        ['./public/assets/hud/icons/oil.png', 'assets/hud/icons/oil.png'],
        ['./public/assets/audio/neon-furnace-theme.mp3', 'assets/audio/neon-furnace-theme.mp3'],
      ] as const) {
        const source = await readFile(new URL(sourcePath, import.meta.url));
        this.emitFile({ type: 'asset', fileName, source });
      }
    },
  }],
});
