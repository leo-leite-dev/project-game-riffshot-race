import Phaser from 'phaser';
import { drawStationFrame } from '../visuals/preparation/StationArt.ts';
import { FONTS } from './theme.ts';

const BUTTON_TEXTURES = Object.freeze({ primary: 'station-button-burning-v1', selected: 'station-button-amber-v1' });

function buttonTexture(scene: Phaser.Scene, primary: boolean) {
  const key = primary ? BUTTON_TEXTURES.primary : BUTTON_TEXTURES.selected;
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, 640, 120)!, c = texture.context;
  const paint = c.createLinearGradient(0, 0, 0, 120);
  paint.addColorStop(0, primary ? '#ed3c13' : '#b65c17');
  paint.addColorStop(0.17, primary ? '#650d08' : '#4a260d');
  paint.addColorStop(0.48, primary ? '#23080b' : '#1b1410');
  paint.addColorStop(0.76, primary ? '#4d0809' : '#35200b');
  paint.addColorStop(1, primary ? '#ff4919' : '#dd8a20');
  c.beginPath(); c.moveTo(23, 1); c.lineTo(617, 1); c.lineTo(639, 23);
  c.lineTo(639, 97); c.lineTo(617, 119); c.lineTo(23, 119);
  c.lineTo(1, 97); c.lineTo(1, 23); c.closePath();
  c.fillStyle = paint; c.fill(); c.save(); c.clip();
  const bloom = c.createRadialGradient(320, 113, 0, 320, 113, 300);
  bloom.addColorStop(0, primary ? '#ff380c55' : '#ffac2530'); bloom.addColorStop(1, 'transparent');
  c.fillStyle = bloom; c.fillRect(0, 0, 640, 120);
  // Etched diagonal hatching on the ends leaves a clear central label area.
  c.strokeStyle = primary ? '#ff4d274a' : '#f6a54433'; c.lineWidth = 1;
  for (let x = -100; x < 740; x += 8) {
    if (x > 90 && x < 540) continue;
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 100, 120); c.stroke();
  }
  c.restore(); texture.refresh(); return key;
}

// Original symbols, drawn locally with no icon fonts or external artwork.
function drawIcon(g: Phaser.GameObjects.Graphics, kind: string, color: number) {
  g.clear().lineStyle(2.5, color, 1);
  if (kind === 'track' || kind === 'flag') {
    g.lineBetween(-12, 15, -5, -16);
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        if ((row + col) % 2 === 0) g.fillStyle(color).fillRect(-4 + col * 6, -15 + row * 6, 6, 6);
      }
    }
    g.strokeRect(-4, -15, 24, 18);
  } else if (kind === 'upgrade' || kind === 'upgrades') {
    for (let y = -10; y <= 6; y += 13) {
      g.lineBetween(-13, y + 8, 0, y - 5).lineBetween(0, y - 5, 13, y + 8);
    }
  } else if (kind === 'repair') {
    g.beginPath(); g.moveTo(-15, 12); g.lineTo(1, -4); g.lineTo(1, -10);
    g.lineTo(8, -16); g.lineTo(7, -8); g.lineTo(12, -5); g.lineTo(18, -10);
    g.lineTo(15, -1); g.lineTo(7, 2); g.lineTo(-10, 18); g.closePath(); g.strokePath();
    g.fillStyle(color).fillCircle(-10, 12, 2);
  } else if (kind === 'vehicle') {
    g.beginPath(); g.moveTo(-17, 9); g.lineTo(-17, -3); g.lineTo(-12, -6);
    g.lineTo(-8, -15); g.lineTo(10, -15); g.lineTo(15, -6); g.lineTo(18, -3);
    g.lineTo(18, 9); g.closePath(); g.strokePath();
    g.lineBetween(-11, -5, 12, -5).lineBetween(-7, 5, 7, 5);
    g.strokeRect(-14, 9, 6, 6).strokeRect(9, 9, 6, 6);
    g.fillStyle(color).fillRect(-13, -1, 5, 3).fillRect(10, -1, 5, 3);
  } else if (kind === 'start') {
    g.fillStyle(color).fillTriangle(-11, -16, -11, 16, 16, 0);
  } else {
    g.lineBetween(0, -17, 16, -17).lineBetween(16, -17, 16, 17).lineBetween(16, 17, 0, 17);
    g.lineBetween(-17, 0, 8, 0).lineBetween(-17, 0, -9, -8).lineBetween(-17, 0, -9, 8);
  }
}

type StationScene = Phaser.Scene & {
  transitioning: boolean;
  settings?: { isOpen: boolean };
  showSoon?: () => void;
};

export class StationButton extends Phaser.GameObjects.Container {
  primary: boolean;
  selected: boolean;
  locked: boolean;
  iconKind: string;
  background: Phaser.GameObjects.Graphics;
  surface: Phaser.GameObjects.Image;
  chrome: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  detail: Phaser.GameObjects.Text;
  onActivate: () => void;

  constructor(scene: StationScene, { label, detail = '', icon, onSelect, onActivate, primary = false }: {
    label: string;
    detail?: string;
    icon: string;
    onSelect?: () => void;
    onActivate?: () => void;
    primary?: boolean;
  }) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.primary = primary;
    this.selected = false;
    this.locked = false;
    this.iconKind = icon;
    this.background = scene.add.graphics();
    this.surface = scene.add.image(0, 0, buttonTexture(scene, primary)).setOrigin(0.5).setVisible(primary);
    this.chrome = scene.add.graphics();
    this.icon = scene.add.graphics();
    this.label = scene.add.text(0, 0, label, {
      fontFamily: FONTS.display, fontStyle: 'bold', fontSize: 26, color: '#f1f6fa',
      stroke: '#02060b', strokeThickness: 3, padding: { top: 4, bottom: 4 },
    }).setOrigin(0.5);
    this.detail = scene.add.text(0, 0, detail, {
      fontFamily: FONTS.mono, fontSize: 12, color: '#a5bacb',
    }).setOrigin(0.5);
    this.add([this.background, this.surface, this.chrome, this.icon, this.label, this.detail]);
    // Kept as an invokable property for pointer and scene keyboard bindings.
    this.onActivate = () => {
      if (scene.transitioning || scene.settings?.isOpen) return;
      if (this.locked) { scene.showSoon?.(); return; }
      onSelect?.();
      this.setSelected(true);
      onActivate?.();
    };
    this.setSize(240, 82).setInteractive({ useHandCursor: true });
    this.on('pointerover', () => {
      if (!scene.transitioning && !scene.settings?.isOpen) { onSelect?.(); this.setSelected(true); }
    });
    this.on('pointerdown', () => this.onActivate());
    this.arrange(0, 0, 240, 82, primary);
  }

  arrange(x: number, y: number, width: number, height: number, primary = this.primary) {
    this.primary = primary;
    this.setPosition(x, y).setSize(width, height);
    // Phaser's Container input subtracts its centered display origin. Keep the
    // Rectangle in 0..size space, matching getBounds(), also after a resize.
    this.input!.hitArea.setTo(0, 0, width, height);
    const stacked = width < 150;
    const iconScale = Math.min(this.primary ? 1.1 : 0.85, height / 78, width / 100);
    this.icon.setPosition(stacked ? 0 : -width / 2 + 37, stacked ? -height * 0.24 : 0).setScale(iconScale);
    const labelX = stacked ? 0 : 20;
    const textWidth = Math.max(10, width - (stacked ? 28 : 100));
    this.label.setFontSize(this.primary ? 58 : 26).setFontStyle(this.primary ? 'bold italic' : 'bold').setScale(1);
    this.label.setScale(Math.min(1, textWidth / Math.max(1, this.label.width), height / (this.primary ? 105 : 82)));
    this.label.setPosition(labelX, stacked ? (this.detail.text ? 6 : 12) : (this.detail.text ? -9 : 0));
    this.detail.setFontSize(this.primary ? 14 : 12).setScale(1);
    this.detail.setScale(Math.min(1, textWidth / Math.max(1, this.detail.width), height / 65));
    this.detail.setPosition(labelX, stacked ? height * 0.31 : Math.min(height / 2 - 16, this.primary ? 25 : 17));
    return this.setSelected(this.selected);
  }

  setSelected(selected: boolean) {
    this.selected = Boolean(selected);
    const hot = this.primary || this.selected;
    const accent = this.primary ? 0xff3a1b : hot ? 0xffbb37 : 0x71f6ff;
    drawStationFrame(this.background, this.width, this.height, { accent, primary: hot });
    this.surface.setTexture(buttonTexture(this.scene, this.primary));
    this.surface.setDisplaySize(Math.max(1, this.width - 20), Math.max(1, this.height - 20)).setVisible(hot);
    const g = this.chrome, x = -this.width / 2 + 9, y = -this.height / 2 + 9;
    const w = this.width - 18, h = this.height - 18, cut = Math.min(13, h / 4);
    g.clear();
    if (hot) {
      // Layered, translucent strokes create a static glow without tweens,
      // post-processing pipelines, or redrawing on every frame.
      for (let pass = 0; pass < 3; pass += 1) {
        g.beginPath(); g.moveTo(x + cut, y); g.lineTo(x + w - cut, y);
        g.lineTo(x + w, y + cut); g.lineTo(x + w, y + h - cut);
        g.lineTo(x + w - cut, y + h); g.lineTo(x + cut, y + h);
        g.lineTo(x, y + h - cut); g.lineTo(x, y + cut); g.closePath();
        g.lineStyle(9 - pass * 3, this.primary ? 0xff2016 : 0xff890d, 0.09 + pass * 0.12).strokePath();
      }
      g.lineStyle(2, 0xffda73, 1).strokePath();
      g.lineStyle(2, this.primary ? 0xff4e28 : 0xffa52b, 1)
        .lineBetween(x + cut, y + 4, x + w - cut, y + 4)
        .lineBetween(x + cut, y + h - 4, x + w - cut, y + h - 4);
    }
    drawIcon(this.icon, this.iconKind, hot ? 0xffcf53 : 0x71f6ff);
    this.label.setColor(hot ? '#ffe66c' : '#f1f6fa');
    this.detail.setColor(hot ? '#ffc382' : '#a5bacb');
    return this;
  }
}
