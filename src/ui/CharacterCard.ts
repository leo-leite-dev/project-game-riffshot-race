import Phaser from 'phaser';
import { CHARACTERS } from '../data/characters.ts';
import { characterPortrait } from '../visuals/characterPortrait.ts';
import { COLORS, text } from './theme.ts';

export type RacingCharacter = (typeof CHARACTERS)[number];

export class CharacterCard extends Phaser.GameObjects.Container {
  character: RacingCharacter;
  frame: Phaser.GameObjects.Graphics;
  portrait: Phaser.GameObjects.Image;
  // Phaser reserves GameObject.name as a string; this game keeps the Text there.
  name: string & Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, character: RacingCharacter, index: number, onSelect: (index: number) => void) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.character = character;
    this.frame = scene.add.graphics();
    this.portrait = scene.add.image(0, -17, characterPortrait(scene, character)).setDisplaySize(146, 132);
    this.name = text(scene, 0, 66, character.name, 17, COLORS.muted, true) as string & Phaser.GameObjects.Text;
    this.add([this.frame, this.portrait, this.name]);
    this.setSize(164, 188).setInteractive({ useHandCursor: true });
    this.on('pointerover', () => onSelect(index));
    this.on('pointerdown', () => onSelect(index));
    this.setSelected(false);
  }

  setSelected(selected: boolean) {
    const accent = Number.parseInt(this.character.portrait.accent.slice(1), 16);
    this.frame.clear().fillStyle(0x0a1220, 0.98).fillRect(-82, -94, 164, 188);
    this.frame.lineStyle(selected ? 2 : 1, selected ? accent : 0x314154, 1);
    this.frame.strokeRect(-82, -94, 164, 188);
    if (selected) {
      this.frame.fillStyle(accent).fillRect(-82, -94, 38, 3);
      this.frame.fillRect(44, 91, 38, 3);
    }
    this.portrait.setAlpha(selected ? 1 : 0.65);
    this.name.setColor(selected ? COLORS.white : COLORS.muted);
    return this;
  }
}
