import Phaser from 'phaser';
import { COLORS, text } from './theme.js';

export function preparationFrame(graphics, width, height, accent = COLORS.cyan) {
  const halfW = width / 2, halfH = height / 2;
  const cut = Math.min(14, Math.max(6, Math.min(width, height) * 0.12));
  const shape = [
    { x: -halfW + cut, y: -halfH }, { x: halfW - cut * 1.8, y: -halfH },
    { x: halfW, y: -halfH + cut * 1.3 }, { x: halfW, y: halfH - cut },
    { x: halfW - cut, y: halfH }, { x: -halfW + cut * 1.6, y: halfH },
    { x: -halfW, y: halfH - cut * 1.5 }, { x: -halfW, y: -halfH + cut },
  ];
  graphics.clear().fillStyle(0x091321, 0.95).fillPoints(shape, true);
  graphics.lineStyle(1, 0x30445b, 0.92).strokePoints(shape, true);
  graphics.lineStyle(2, accent, 0.95).lineBetween(-halfW + cut, -halfH + 1, -halfW + cut + Math.min(42, width * 0.22), -halfH + 1);
  graphics.lineStyle(1, accent, 0.36).lineBetween(halfW - cut - 28, halfH - 3, halfW - cut, halfH - 3);
}

// Original vector symbols: circuit, upgrade chevrons, spanner, vehicle and exit.
function drawIcon(g, kind) {
  g.clear().lineStyle(2, COLORS.cyan, 1);
  if (kind === 'track') {
    g.strokeRoundedRect(-13, -10, 26, 20, 7).strokeRoundedRect(-6, -4, 12, 8, 3);
    g.lineBetween(3, -12, 3, -2);
  } else if (kind === 'upgrade') {
    [-5, 5].forEach(y => g.strokePoints([{ x: -11, y: y + 4 }, { x: 0, y: y - 4 }, { x: 11, y: y + 4 }]));
  } else if (kind === 'repair') {
    g.strokePoints([{ x: -10, y: 12 }, { x: 3, y: -1 }, { x: 10, y: -1 },
      { x: 14, y: -8 }, { x: 7, y: -5 }, { x: 4, y: -8 }, { x: 7, y: -14 },
      { x: 0, y: -10 }, { x: -1, y: -3 }, { x: -14, y: 10 }], true);
  } else if (kind === 'vehicle') {
    g.strokePoints([{ x: -14, y: 8 }, { x: -14, y: -2 }, { x: -8, y: -9 },
      { x: 8, y: -9 }, { x: 14, y: -2 }, { x: 14, y: 8 }], true);
    g.lineBetween(-10, -1, 10, -1).strokeRect(-10, 8, 5, 4).strokeRect(5, 8, 5, 4);
  } else if (kind === 'start') {
    g.strokeTriangle(-7, -11, -7, 11, 11, 0);
  } else {
    g.strokePoints([{ x: 1, y: -12 }, { x: 11, y: -12 }, { x: 11, y: 12 }, { x: 1, y: 12 }]);
    g.lineBetween(-14, 0, 5, 0).lineBetween(-14, 0, -7, -7).lineBetween(-14, 0, -7, 7);
  }
}

export class PreparationButton extends Phaser.GameObjects.Container {
  constructor(scene, { label, detail = '', icon, onSelect, onActivate }) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.background = scene.add.graphics();
    this.icon = scene.add.graphics();
    drawIcon(this.icon, icon);
    this.label = text(scene, 0, 0, label, 14, COLORS.white, true);
    this.detail = text(scene, 0, 0, detail, 11, COLORS.muted).setPadding(0);
    this.add([this.background, this.icon, this.label, this.detail]);
    this.onActivate = () => {
      if (scene.transitioning) return;
      onSelect();
      this.setSelected(true, true);
      scene.tweens.killTweensOf(this.icon);
      this.icon.setAlpha(1);
      scene.tweens.add({
        targets: this.icon, alpha: 0.4, yoyo: true, duration: scene.reducedMotion ? 1 : 90,
        onComplete: () => this.setSelected(this.selected),
      });
      onActivate();
    };
    this.setSize(200, 64).setInteractive({ useHandCursor: true });
    this.on('pointerover', () => { if (!scene.transitioning) onSelect(); });
    this.on('pointerdown', this.onActivate);
    this.on('pointerup', () => this.setSelected(this.selected));
    this.on('pointerout', () => this.setSelected(this.selected));
  }

  arrange(x, y, width, height, primary = false) {
    this.setPosition(x, y).setSize(width, height);
    // Phaser adds the Container's display origin when testing pointer input.
    this.input.hitArea.setTo(0, 0, width, height);
    const stacked = width < 125;
    this.icon.setPosition(stacked ? 0 : -width / 2 + 24, stacked ? -18 : 0).setScale(stacked ? 0.5 : 0.65);
    this.label.setPosition(stacked ? 0 : 15, this.detail.text ? (stacked ? 0 : -9) : 0);
    this.label.setFontSize(primary ? 18 : stacked ? 12 : width < 200 ? 13 : 15);
    this.label.setScale(Math.min(1, (width - (stacked ? 8 : 56)) / this.label.width));
    this.detail.setPosition(stacked ? 0 : 15, stacked ? 18 : 12).setFontSize(stacked ? 11 : 12);
    this.setSelected(this.selected);
    return this;
  }

  setSelected(selected, pressed = false) {
    this.selected = selected;
    preparationFrame(this.background, this.width, this.height);
    if (selected) {
      this.background.fillStyle(COLORS.cyan, pressed ? 0.22 : 0.09);
      this.background.fillRoundedRect(-this.width / 2, -this.height / 2, this.width, this.height, 5);
      this.background.lineStyle(2, COLORS.cyan, 0.95).strokeRoundedRect(-this.width / 2, -this.height / 2, this.width, this.height, 5);
    }
    this.label.setColor(selected ? '#a8f9ff' : COLORS.white);
    this.detail.setColor(selected ? '#a8f9ff' : COLORS.muted);
    return this;
  }
}

export function createRivalPortrait(scene) {
  const g = scene.add.graphics();
  g.fillStyle(0x101d30).fillRoundedRect(-55, -48, 110, 96, 5);
  g.lineStyle(1, 0x54718d, 0.23);
  for (let y = -40; y < 48; y += 8) g.lineBetween(-51, y, 51, y);
  g.fillStyle(0x2c4058).fillEllipse(0, -15, 34, 44);
  g.fillRoundedRect(-12, 2, 24, 21, 4);
  g.fillPoints([{ x: -43, y: 48 }, { x: -38, y: 26 }, { x: -15, y: 15 },
    { x: 15, y: 15 }, { x: 38, y: 26 }, { x: 43, y: 48 }], true);
  g.fillStyle(0x101d30).fillRect(-20, -23, 40, 8);
  g.lineStyle(2, COLORS.pink, 0.6).lineBetween(-12, -19, 12, -19);
  return g;
}

export function createStatPanel(scene, heading, attributes, stats, statValues) {
  const panel = scene.add.container();
  const frame = scene.add.graphics();
  const bars = scene.add.graphics();
  const title = text(scene, 0, 0, heading, 14, '#71f6ff', true).setPadding(0);
  const rows = attributes.map(attribute => {
    const label = text(scene, 0, 0, attribute.key === 'speed' ? 'VELOCIDADE' : attribute.label, 13, COLORS.muted).setOrigin(0, 0.5).setPadding(0);
    const value = text(scene, 0, 0, String(stats[attribute.key]), 16, COLORS.white, true).setOrigin(1, 0.5).setPadding(0);
    statValues[attribute.key] = value;
    panel.add([label, value]);
    return { attribute, label, value };
  });
  panel.addAt([frame, bars, title], 0);
  panel.arrange = (x, y, width, height) => {
    panel.setPosition(x, y);
    preparationFrame(frame, width, height);
    const small = height < 110;
    const single = small && rows.length === 1;
    const titleY = -height / 2 + (small ? 11 : 24);
    title.setPosition(-width / 2 + 12, titleY).setOrigin(0, 0.5).setFontSize(single ? 11 : small ? 12 : 15);
    bars.clear();
    rows.forEach(({ attribute, label, value }, index) => {
      const rowY = single ? 5 : small ? -height / 2 + 31 + index * 31 : -height / 2 + 72 + index * 94;
      label.setPosition(-width / 2 + 12, rowY).setFontSize(single ? 10 : small ? 11 : 13);
      value.setPosition(width / 2 - 12, single ? titleY : rowY).setFontSize(small ? 13 : 19);
      const barY = single ? height / 2 - 7 : rowY + (small ? 9 : 21);
      const barWidth = width - 24;
      bars.fillStyle(0x26364a).fillRect(-barWidth / 2, barY, barWidth, small ? 3 : 7);
      bars.fillStyle(COLORS.cyan).fillRect(-barWidth / 2, barY, barWidth * Phaser.Math.Clamp(stats[attribute.key] / 100, 0, 1), small ? 3 : 7);
    });
  };
  return panel;
}

export function bindPreparationKeys(scene, onKey) {
  const captures = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE', 'TAB', 'ENTER', 'ESC'];
  const keyboard = scene.input.keyboard;
  if (!keyboard) return;
  const handler = event => {
    if (!['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!scene.transitioning && !event.repeat) onKey(event);
  };
  keyboard.addCapture(captures);
  keyboard.on('keydown', handler);
  scene.events.once('shutdown', () => {
    keyboard.off('keydown', handler);
    keyboard.removeCapture(captures);
  });
}
