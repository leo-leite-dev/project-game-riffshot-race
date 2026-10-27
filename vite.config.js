import { defineConfig } from 'vite';
import { readFile } from 'node:fs/promises';

export default defineConfig({
  // These are lazy-loaded only in the garage. Prebundle them together in dev so
  // discovering a new addon does not reload the page and erase a pilot choice.
  optimizeDeps: {
    include: [
      'three',
      'three/addons/loaders/GLTFLoader.js',
      'three/addons/utils/SkeletonUtils.js',
      'three/addons/utils/BufferGeometryUtils.js',
      'three/addons/environments/RoomEnvironment.js',
    ],
  },
  build: {
    // public/ contains a local-only third-party GLB. Copy only reviewed assets
    // instead of letting Vite recursively publish the entire directory.
    copyPublicDir: false,
  },
  plugins: [{
    name: 'copy-approved-public-assets',
    apply: 'build',
    async generateBundle() {
      for (const [sourcePath, fileName] of [
        ['./public/favicon.svg', 'favicon.svg'],
        ['./THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.txt'],
      ]) {
        const source = await readFile(new URL(sourcePath, import.meta.url));
        this.emitFile({ type: 'asset', fileName, source });
      }
    },
  }],
});
