import type Phaser from 'phaser';

export const COLORS: {
  cyan: number;
  pink: number;
  white: string;
  muted: string;
  dim: string;
} = {
  cyan: 0x71f6ff,
  pink: 0xff408f,
  white: '#edf7ff',
  muted: '#8192ab',
  dim: '#596b85',
};

export const FONTS: {
  display: string;
  mono: string;
} = {
  display: '"Arial Black", "Arial", sans-serif',
  mono: '"Consolas", "Courier New", monospace',
};

export const SCENES = {
  splash: 'Splash',
  menu: 'MainMenu',
  characters: 'CharacterSelection',
  vehicles: 'VehicleSelection',
  preparation: 'RacePreparation',
  development: 'RaceDevelopment',
  difficulty: 'DifficultySelection',
  tracks: 'RaceTrackSelection',
  race: 'Race',
  results: 'RaceResults',
  rivalReward: 'RivalReward',
};

export function text(
  scene: Phaser.Scene,
  x: number,
  y: number,
  value: string,
  size: number = 16,
  color: string = COLORS.white,
  display: boolean = false,
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, value, {
    fontFamily: display ? FONTS.display : FONTS.mono,
    fontSize: size,
    fontStyle: display ? 'bold' : 'normal',
    color,
    align: 'center',
    padding: { top: 3, bottom: 3, left: 3, right: 3 },
  }).setOrigin(0.5);
}
