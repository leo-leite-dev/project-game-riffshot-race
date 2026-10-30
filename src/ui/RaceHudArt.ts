import type Phaser from 'phaser';

/** Original cut-metal HUD pieces. Drawn only on layout changes, not each frame. */
export function drawHudPlate(g: Phaser.GameObjects.Graphics, x: number, y: number,
  width: number, height: number, accent = 0xff3f39): void {
  const cut = Math.min(12, height / 4);
  const outline = [
    { x: x + cut, y }, { x: x + width - cut, y }, { x: x + width, y: y + cut },
    { x: x + width, y: y + height - cut }, { x: x + width - cut, y: y + height },
    { x: x + cut, y: y + height }, { x, y: y + height - cut }, { x, y: y + cut },
  ];
  const inset = 5;
  const inner = outline.map(point => ({
    x: point.x < x + cut ? point.x + inset : point.x > x + width - cut ? point.x - inset : point.x,
    y: point.y === y ? point.y + inset : point.y === y + height ? point.y - inset : point.y,
  }));
  g.lineStyle(8, accent, 0.19).lineBetween(x + cut, y + 1, x + Math.min(width * 0.38, 80), y + 1)
    .lineBetween(x + width - 2, y + cut + 3, x + width - 2, y + Math.min(height * 0.42, 33))
    .fillStyle(0x0a0c11, 0.99).fillPoints(outline, true)
    .lineStyle(3, 0x141d27, 1).strokePoints(outline, true)
    .lineStyle(2, 0x94a6b1, 1).strokePoints(outline, true)
    .fillStyle(0x020a12, 0.97).fillPoints(inner, true)
    .lineStyle(1, 0x223844, 0.95).strokePoints(inner, true)
    .lineStyle(3, accent, 1).lineBetween(x + cut + 4, y + 2, x + Math.min(width * 0.34, 72), y + 2)
    .lineBetween(x + 2, y + cut + 4, x + 2, y + Math.min(height * 0.36, 30))
    .lineBetween(x + width - Math.min(width * 0.23, 48), y + height - 2, x + width - cut - 4, y + height - 2)
    .lineStyle(1, accent, 0.85).lineBetween(x + width - 2, y + cut + 4,
      x + width - 2, y + Math.min(height * 0.36, 30))
    .lineStyle(1, 0x83a1af, 0.7).lineBetween(x + inset + 5, y + height - 7, x + width * 0.4, y + height - 7)
    .fillStyle(0xd7e3e8, 0.8).fillCircle(x + 9, y + 10, 1.5)
    .fillCircle(x + width - 9, y + height - 10, 1.5);
  // Recessed diagonal scoring and signal LEDs evoke forged metal, without image textures.
  for (let i = 0; i < 3; i += 1) {
    g.lineStyle(1, accent, 0.4).lineBetween(x + width - 33 + i * 7, y + 8, x + width - 28 + i * 7, y + 13);
  }
}
