import type Phaser from 'phaser';
import { drawStationFrame } from '../visuals/preparation/StationArt.ts';
import { FONTS } from './theme.ts';

function caption(scene: Phaser.Scene, value: string, size: number, color: string, origin = 0) {
  return scene.add.text(0, 0, value, {
    fontFamily: FONTS.display, fontStyle: 'bold', fontSize: size, color,
    padding: { top: 2, bottom: 2 },
  }).setOrigin(origin, 0.5);
}

function statIcon(g: Phaser.GameObjects.Graphics, key: string | undefined, x: number, y: number, size: number) {
  g.save().translateCanvas(x, y).scaleCanvas(size, size).lineStyle(2, 0x71f6ff, 1);
  if (key === 'speed') {
    g.beginPath(); g.arc(0, 1, 12, Math.PI * 0.85, Math.PI * 2.15, false); g.strokePath();
    g.lineBetween(0, 2, 7, -6).fillStyle(0x71f6ff).fillCircle(0, 2, 2);
    g.lineBetween(-8, -5, -5, -3).lineBetween(0, -11, 0, -8).lineBetween(8, -5, 5, -3);
  } else if (key === 'acceleration') {
    g.beginPath(); g.moveTo(1, -15); g.lineTo(-8, 2); g.lineTo(0, 1);
    g.lineTo(-3, 14); g.lineTo(10, -4); g.lineTo(2, -3); g.closePath(); g.strokePath();
  } else if (key === 'control') {
    g.strokeCircle(0, 0, 12).strokeCircle(0, 0, 3);
    g.lineBetween(-11, -4, -3, -1).lineBetween(11, -4, 3, -1).lineBetween(0, 3, 0, 12);
  } else if (key === 'armor') {
    g.beginPath(); g.moveTo(0, -14); g.lineTo(12, -9); g.lineTo(10, 5);
    g.lineTo(0, 15); g.lineTo(-10, 5); g.lineTo(-12, -9); g.closePath(); g.strokePath();
    g.lineBetween(0, -9, 0, 9);
  } else {
    // Decorative engine symbol, also used by the MOTOR heading.
    g.strokeRect(-9, -7, 18, 16).strokeRect(-4, -12, 9, 5);
    g.lineBetween(-14, -3, -9, -3).lineBetween(-14, 4, -9, 4).lineBetween(9, -2, 14, -2);
    g.lineBetween(9, 5, 14, 5).lineBetween(-4, 10, -4, 14).lineBetween(4, 10, 4, 14);
  }
  g.restore();
}

const SLOT_COLORS = [0xff2825, 0xff3023, 0xff3c20, 0xff4b1d, 0xff611c, 0xff7a20, 0xff9627, 0xffb637, 0xffcf49, 0xffe777];

type StatAttribute = { key: string; label: string };
type StatRow = { attribute: StatAttribute; label: Phaser.GameObjects.Text; value: Phaser.GameObjects.Text };
type StationStatPanel = Phaser.GameObjects.Container & {
  rows: StatRow[];
  heading: Phaser.GameObjects.Text;
  arrange: (x: number, y: number, width: number, height: number) => StationStatPanel;
};

export function createStationStatPanel(
  scene: Phaser.Scene,
  heading: string,
  attributes: StatAttribute[],
  stats: Record<string, number>,
  statValues: Record<string, Phaser.GameObjects.Text> = {},
) {
  const panel = scene.add.container() as StationStatPanel;
  const frame = scene.add.graphics(), bars = scene.add.graphics(), icons = scene.add.graphics();
  const title = caption(scene, heading, 14, '#71f6ff');
  panel.add([frame, bars, icons, title]);
  const rows = attributes.map(attribute => {
    const label = caption(scene, attribute.key === 'speed' ? 'VELOCIDADE' : attribute.label, 14, '#71f6ff');
    const raw = stats[attribute.key];
    const value = caption(scene, Number.isFinite(raw) ? String(raw) : '—', 21, '#f0f6fc', 1);
    statValues[attribute.key] = value;
    panel.add([label, value]);
    return { attribute, label, value };
  });
  panel.rows = rows;
  panel.heading = title;
  panel.arrange = (x: number, y: number, width: number, height: number) => {
    panel.setPosition(x, y).setSize(width, height);
    drawStationFrame(frame, width, height);
    bars.clear(); icons.clear();
    const left = -width / 2 + 24, right = width / 2 - 23;
    const compact = height < 150;
    const headingY = -height / 2 + (compact ? 23 : 30);
    const headingKey = heading === 'MOTOR' ? 'engine' : attributes[0]?.key;
    statIcon(icons, headingKey, left + 11, headingY, compact ? 0.6 : 0.8);
    title.setPosition(left + 34, headingY).setFontSize(14).setScale(1).setVisible(height >= 100);
    title.setScale(Math.min(1, Math.max(10, width - 90) / Math.max(1, title.width)));
    const start = -height / 2 + (height < 100 ? 10 : compact ? 39 : 58);
    const bottom = height / 2 - (height < 100 ? 11 : 20);
    const rowHeight = Math.max(1, (bottom - start) / Math.max(1, rows.length));
    rows.forEach(({ attribute, label, value }, index) => {
      const rowY = start + rowHeight * index + rowHeight * 0.26;
      const iconSize = Math.min(0.87, rowHeight / 63, width / 310);
      statIcon(icons, attribute.key, left + 11, rowY + 7, iconSize);
      const textX = left + 35;
      label.setPosition(textX, rowY).setFontSize(compact ? 11 : 14).setScale(1);
      label.setScale(Math.min(1, Math.max(10, right - textX - 34) / Math.max(1, label.width)));
      value.setPosition(right, rowY + (compact ? 7 : 12)).setFontSize(compact ? 16 : 21);
      const barX = textX, barY = rowY + Math.min(20, rowHeight * 0.32);
      const barW = Math.max(10, right - barX - 36), gap = Math.min(3, barW / 40);
      const slotW = (barW - gap * 9) / 10, barH = Math.max(3, Math.min(12, rowHeight * 0.19));
      const raw = stats[attribute.key];
      const amount = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) / 10 : 0;
      value.setText(Number.isFinite(raw) ? String(raw) : '—');
      bars.fillStyle(0x02070c).fillRect(barX - 3, barY - 3, barW + 6, barH + 6);
      bars.lineStyle(1, 0x385264, 0.9).strokeRect(barX - 3, barY - 3, barW + 6, barH + 6);
      for (let slot = 0; slot < 10; slot += 1) {
        const sx = barX + slot * (slotW + gap), fraction = Math.min(1, Math.max(0, amount - slot));
        bars.fillStyle(0x162632).fillRect(sx, barY, slotW, barH);
        bars.lineStyle(1, 0x3b5461, 0.3).lineBetween(sx, barY, sx + slotW, barY);
        if (fraction > 0) {
          bars.fillStyle(SLOT_COLORS[slot], 0.13).fillRect(sx - 2, barY - 2, slotW * fraction + 4, barH + 4);
          bars.fillStyle(SLOT_COLORS[slot]).fillRect(sx, barY, slotW * fraction, barH);
          bars.fillStyle(0xffe49d, 0.65).fillRect(sx + 1, barY + 1, Math.max(0, slotW * fraction - 2), 1);
        }
      }
      if (index < rows.length - 1) {
        const separator = start + rowHeight * (index + 1) - 3;
        bars.lineStyle(1, 0x50616b, 0.5).lineBetween(left, separator, right, separator);
        bars.lineStyle(1, 0x02070c, 1).lineBetween(left, separator + 2, right, separator + 2);
      }
    });
    return panel;
  };
  return panel;
}
