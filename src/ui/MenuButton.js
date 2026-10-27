import Phaser from 'phaser';
import { COLORS, text } from './theme.js';

export class MenuButton extends Phaser.GameObjects.Container {
  constructor(scene, { label, index = '01', locked = false, onSelect, onActivate, width = 480, labelSize = 27 }) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.buttonWidth = width;
    this.locked = locked;
    this.selected = false;
    this.background = scene.add.graphics();
    this.number = text(scene, -width / 2 + 32, 0, index, 14, COLORS.muted);
    this.label = text(scene, -width / 2 + 66, 0, label, labelSize, COLORS.white, true).setOrigin(0, 0.5);
    this.detail = text(scene, width / 2 - 25, 0, locked ? 'BLOQUEADO' : 'INICIAR', 10, COLORS.muted).setOrigin(1, 0.5);
    this.lockIcon = scene.add.graphics();
    if (locked) {
      this.lockIcon.lineStyle(1.5, 0x8192ab, 1);
      this.lockIcon.strokeRoundedRect(-6, -3, 12, 10, 2);
      this.lockIcon.beginPath();
      this.lockIcon.arc(0, -4, 4, Math.PI, 0, false);
      this.lockIcon.strokePath();
      this.lockIcon.fillStyle(0x8192ab);
      this.lockIcon.fillCircle(0, 2, 1.2);
      this.lockIcon.setX(width / 2 - 103);
    }
    this.add([this.background, this.number, this.label, this.detail, this.lockIcon]);
    this.setSize(width, 74);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', () => onSelect());
    this.on('pointerdown', () => { onSelect(); onActivate(); });
    this.setSelected(false);
  }

  setSelected(selected) {
    this.selected = selected;
    const half = this.buttonWidth / 2;
    const g = this.background;
    const accent = this.locked ? 0xa8b8cb : COLORS.cyan;
    g.clear();
    if (selected) {
      g.fillStyle(accent, this.locked ? 0.025 : 0.06);
      g.fillRect(-half - 4, -41, this.buttonWidth + 8, 82);
    }
    g.fillStyle(selected && !this.locked ? 0x102631 : 0x0b1220, 0.94);
    g.lineStyle(1, selected ? accent : 0x314154, selected ? 0.9 : 0.65);
    g.beginPath();
    g.moveTo(-half + 12, -37);
    g.lineTo(half, -37);
    g.lineTo(half, 25);
    g.lineTo(half - 12, 37);
    g.lineTo(-half, 37);
    g.lineTo(-half, -25);
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.fillStyle(selected ? accent : 0x334358, 1);
    g.fillRect(-half, -18, selected ? 3 : 1, 36);
    g.lineStyle(1, 0x668093, 0.17);
    g.lineBetween(-half + 52, -16, -half + 52, 16);
    this.label.setColor(this.locked ? (selected ? '#a8b8cb' : '#73859c') : COLORS.white);
    this.number.setColor(selected && !this.locked ? '#71f6ff' : COLORS.dim);
    this.detail.setColor(selected && !this.locked ? '#71f6ff' : COLORS.dim);
    return this;
  }
}
