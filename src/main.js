import Phaser from 'phaser';
import { SplashScene } from './scenes/SplashScene.js';
import { MainMenuScene } from './scenes/MainMenuScene.js';
import { CharacterSelectionScene } from './scenes/CharacterSelectionScene.js';
import { VehicleSelectionScene } from './scenes/VehicleSelectionScene.js';
import { RacePreparationScene } from './scenes/RacePreparationScene.js';
import { RaceDevelopmentScene } from './scenes/RaceDevelopmentScene.js';
import { MenuMusic } from './audio/MenuMusic.js';
import { observeGameSize } from './ui/observeGameSize.js';
import './style.css';

export const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#080b19',
  antialias: true,
  roundPixels: false,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  input: { activePointers: 2 },
  scene: [SplashScene, MainMenuScene, CharacterSelectionScene, VehicleSelectionScene, RacePreparationScene, RaceDevelopmentScene],
  callbacks: {
    postBoot(instance) {
      observeGameSize(instance);
      instance.menuMusic = new MenuMusic(instance);
      instance.canvas.setAttribute('aria-label', 'RIFFSHOT RACING. Sinta a batida. Pise fundo. Abra fogo. Use as setas para navegar e Enter para confirmar. M silencia a música.');
      instance.canvas.setAttribute('role', 'application');
      instance.canvas.setAttribute('tabindex', '0');
      instance.canvas.focus({ preventScroll: true });
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => game.destroy(true));
}
