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
        ['./public/assets/ui/hud/icons/shots.png', 'assets/ui/hud/icons/shots.png'],
        ['./public/assets/ui/hud/icons/bomb.png', 'assets/ui/hud/icons/bomb.png'],
        ['./public/assets/ui/hud/icons/oil.png', 'assets/ui/hud/icons/oil.png'],
        ['./public/assets/characters/ultimate-icons/axel-double-shot.png', 'assets/characters/ultimate-icons/axel-double-shot.png'],
        ['./public/assets/characters/ultimate-icons/neon-kira-hack-stop.png', 'assets/characters/ultimate-icons/neon-kira-hack-stop.png'],
        ['./public/assets/characters/ultimate-icons/brok-thorn-freeze.png', 'assets/characters/ultimate-icons/brok-thorn-freeze.png'],
        ['./public/assets/characters/ultimate-icons/leonard-lyon-defensive-leap.png', 'assets/characters/ultimate-icons/leonard-lyon-defensive-leap.png'],
        ['./public/assets/characters/ultimate-icons/rox-z7-forced-acceleration.png', 'assets/characters/ultimate-icons/rox-z7-forced-acceleration.png'],
        ['./public/assets/characters/ultimate-icons/vyra-noctis-position-swap.png', 'assets/characters/ultimate-icons/vyra-noctis-position-swap.png'],
        ['./public/assets/characters/ultimate-icons/dagger-raven-bat-lift.png', 'assets/characters/ultimate-icons/dagger-raven-bat-lift.png'],
        ['./public/assets/characters/ultimate-icons/cyber-dragon-fire-mark.png', 'assets/characters/ultimate-icons/cyber-dragon-fire-mark.png'],
        ['./public/assets/characters/ultimate-icons/drax-mare-spin-shot.png', 'assets/characters/ultimate-icons/drax-mare-spin-shot.png'],
        ['./public/assets/characters/ultimate-icons/drax-mare-water-shield.png', 'assets/characters/ultimate-icons/drax-mare-water-shield.png'],
        ['./public/assets/audio/neon-furnace-theme.mp3', 'assets/audio/neon-furnace-theme.mp3'],
        ['./public/assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/background/field-shell.png', 'assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/background/field-shell.png'],
        ['./public/assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/background/floor-reflections.png', 'assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/background/floor-reflections.png'],
        ['./public/assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/structure/pipes/top-strip.png', 'assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/structure/pipes/top-strip.png'],
        ['./public/assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/structure/pipes/left-strip.png', 'assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/structure/pipes/left-strip.png'],
        ['./public/assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/structure/pipes/right-strip.png', 'assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/structure/pipes/right-strip.png'],
        ['./public/assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/structure/pipes/bottom-strip.png', 'assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/structure/pipes/bottom-strip.png'],
        ['./public/assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/header/header.png', 'assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/header/header.png'],
        ['./public/assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/panels/lore/panel.png', 'assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/panels/lore/panel.png'],
        ['./public/assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/panels/origin/panel.png', 'assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/panels/origin/panel.png'],
        ['./public/assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/panels/bonus/panel.png', 'assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/panels/bonus/panel.png'],
        ['./public/assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/panels/track/frame.png', 'assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/panels/track/frame.png'],
        ['./public/assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/panels/track/flag.png', 'assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/panels/track/flag.png'],
        ['./public/assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/panels/track/aperture-mask.png', 'assets/ui/RIFFSHOT-RACING-SPRITES/CLEAN-FINAL/panels/track/aperture-mask.png'],
      ] as const) {
        const source = await readFile(new URL(sourcePath, import.meta.url));
        this.emitFile({ type: 'asset', fileName, source });
      }
    },
  }],
});
