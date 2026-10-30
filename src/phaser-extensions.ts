import type { Championship } from './championship/Championship.ts';
import type { MenuMusic } from './audio/MenuMusic.ts';
import type { AudioPreferencesStore } from './audio/AudioPreferences.ts';
import type { RiffshotRadio } from './audio/RiffshotRadio.ts';

// Game-level systems attached once at boot in main.ts. Scenes and audio read
// them through game.championship / game.menuMusic at runtime.
declare global {
  namespace Phaser {
    interface Game {
      championship: Championship;
      menuMusic: MenuMusic;
      audioPreferences: AudioPreferencesStore;
      riffshotRadio: RiffshotRadio;
    }
  }
}

export {};
