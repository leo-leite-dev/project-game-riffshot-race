import type Phaser from 'phaser';

export const PILOT_SELECTION_FONT = {
  family: 'Oxanium',
  fallback: 'Arial, sans-serif',
  weight: {
    display: 800,
    heading: 800,
    body: 500,
    secondary: 600,
  },
} as const;

export function applyPilotSelectionFont(
  gameText: Phaser.GameObjects.Text,
  weight: number = PILOT_SELECTION_FONT.weight.body,
): Phaser.GameObjects.Text {
  gameText.setStyle({
    fontFamily: `${PILOT_SELECTION_FONT.family}, ${PILOT_SELECTION_FONT.fallback}`,
    fontStyle: `italic ${weight}`,
  });
  return gameText;
}
