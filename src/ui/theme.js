export const COLORS = {
  cyan: 0x71f6ff,
  pink: 0xff408f,
  white: '#edf7ff',
  muted: '#8192ab',
  dim: '#596b85',
};

export const FONTS = {
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
};

export function text(scene, x, y, value, size = 16, color = COLORS.white, display = false) {
  return scene.add.text(x, y, value, {
    fontFamily: display ? FONTS.display : FONTS.mono,
    fontSize: size,
    fontStyle: display ? 'bold' : 'normal',
    color,
    align: 'center',
    padding: { top: 3, bottom: 3, left: 3, right: 3 },
  }).setOrigin(0.5);
}
