import type { Championship } from './championship/Championship.ts';
import type { MenuMusic } from './audio/MenuMusic.ts';

// Game-level systems attached once at boot in main.ts. Scenes and audio read
// them through game.championship / game.menuMusic at runtime.
declare global {
  namespace Phaser {
    interface Game {
      championship: Championship;
      menuMusic: MenuMusic;
    }
  }
}

export {};
