import Phaser from 'phaser';
import { characterPortrait } from '../visuals/characterPortrait.js';
import { COLORS, text } from './theme.js';

export class CharacterCard extends Phaser.GameObjects.Container {
  constructor(scene, character, index, onSelect) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.character = character;
    this.frame = scene.add.graphics();
    this.portrait = scene.add.image(0, -17, characterPortrait(scene, character)).setDisplaySize(146, 132);
    this.name = text(scene, 0, 66, character.name, 17, COLORS.muted, true);
    this.add([this.frame, this.portrait, this.name]);
    this.setSize(164, 188).setInteractive({ useHandCursor: true });
    this.on('pointerover', () => onSelect(index));
    this.on('pointerdown', () => onSelect(index));
    this.setSelected(false);
  }

  setSelected(selected) {
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
