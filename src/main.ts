import Phaser from 'phaser';
import { SplashScene } from './scenes/SplashScene.ts';
import { MainMenuScene } from './scenes/MainMenuScene.ts';
import { CharacterSelectionScene } from './scenes/CharacterSelectionScene.ts';
import { VehicleSelectionScene } from './scenes/VehicleSelectionScene.ts';
import { RacePreparationScene } from './scenes/RacePreparationScene.ts';
import { RaceDevelopmentScene } from './scenes/RaceDevelopmentScene.ts';
import { DifficultySelectionScene } from './scenes/DifficultySelectionScene.ts';
import { RaceTrackSelectionScene } from './scenes/RaceTrackSelectionScene.ts';
import { RaceScene } from './scenes/RaceScene.ts';
import { RaceResultsScene } from './scenes/RaceResultsScene.ts';
import { RivalRewardScene } from './scenes/RivalRewardScene.ts';
import { MenuMusic } from './audio/MenuMusic.ts';
import { AudioPreferencesStore } from './audio/AudioPreferences.ts';
import { RiffshotRadio } from './audio/RiffshotRadio.ts';
import { observeGameSize } from './ui/observeGameSize.ts';
import './ui/publicCreditsShortcut.ts';
import './ui/mobileOrientation.ts';
import { Championship } from './championship/Championship.ts';
import './style.css';

// This route exists only in Vite dev. It skips the official scenes, save reader,
// writer lease and game audio; the Rapier scene itself is loaded lazily.
const physicsLabRoute = import.meta.env.DEV
  && new URLSearchParams(window.location.search).get('physicsLab') === '1';
const officialScenes = [SplashScene, MainMenuScene, DifficultySelectionScene, CharacterSelectionScene,
  VehicleSelectionScene, RacePreparationScene, RaceTrackSelectionScene, RaceScene, RaceResultsScene,
  RivalRewardScene, RaceDevelopmentScene];

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
  scene: physicsLabRoute ? [] : officialScenes,
  callbacks: {
    postBoot(instance) {
      observeGameSize(instance);
      if (physicsLabRoute) {
        instance.canvas.setAttribute('aria-label', 'Laboratório local de física 3D Rapier.');
        instance.canvas.setAttribute('role', 'application');
        instance.canvas.setAttribute('tabindex', '0');
        instance.canvas.focus({ preventScroll: true });
        // Compile-time DEV guard lets Vite omit the Rapier prototype from dist.
        void import('./scenes/PhysicsLabBootstrapScene.ts').then(({ PhysicsLabBootstrapScene }) => {
          if (instance.isRunning) instance.scene.add('PhysicsLabBootstrap', PhysicsLabBootstrapScene, true);
        });
        return;
      }
      instance.championship = new Championship(instance);
      instance.audioPreferences = new AudioPreferencesStore();
      instance.menuMusic = new MenuMusic(instance, instance.audioPreferences);
      instance.riffshotRadio = new RiffshotRadio(instance, instance.menuMusic, instance.audioPreferences);
      instance.canvas.setAttribute('aria-label',
        'RIFFSHOT RACING. Sinta a batida. Pise fundo. Abra fogo. Use as setas para navegar e Enter para confirmar.');
      instance.canvas.setAttribute('role', 'application');
      instance.canvas.setAttribute('tabindex', '0');
      instance.canvas.focus({ preventScroll: true });
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => game.destroy(true));
}
