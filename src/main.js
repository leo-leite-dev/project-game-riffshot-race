import Phaser from 'phaser';
import { SplashScene } from './scenes/SplashScene.js';
import { MainMenuScene } from './scenes/MainMenuScene.js';
import { CharacterSelectionScene } from './scenes/CharacterSelectionScene.js';
import { VehicleSelectionScene } from './scenes/VehicleSelectionScene.js';
import { RacePreparationScene } from './scenes/RacePreparationScene.js';
import { RaceDevelopmentScene } from './scenes/RaceDevelopmentScene.js';
import { DifficultySelectionScene } from './scenes/DifficultySelectionScene.js';
import { RaceTrackSelectionScene } from './scenes/RaceTrackSelectionScene.js';
import { RaceScene } from './scenes/RaceScene.js';
import { RaceResultsScene } from './scenes/RaceResultsScene.js';
import { RivalRewardScene } from './scenes/RivalRewardScene.js';
import { MenuMusic } from './audio/MenuMusic.js';
import { observeGameSize } from './ui/observeGameSize.js';
import { Championship } from './championship/Championship.js';
import './style.css';

export const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#080b19',
  // The race displays Three beneath this canvas. Other scenes still paint
  // their full opaque backdrop; alpha must be requested at context creation.
  transparent: true,
  antialias: true,
  roundPixels: false,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  input: { activePointers: 2 },
  scene: [SplashScene, MainMenuScene, DifficultySelectionScene, CharacterSelectionScene, VehicleSelectionScene,
    RacePreparationScene, RaceTrackSelectionScene, RaceScene, RaceResultsScene, RivalRewardScene, RaceDevelopmentScene],
  callbacks: {
    postBoot(instance) {
      instance.championship = new Championship(instance);
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
