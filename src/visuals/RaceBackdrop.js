import { COLORS } from '../ui/theme.js';

export class RaceBackdrop {
  constructor(scene) {
    this.scene = scene;
    this.key = `${scene.scene.key}-atmosphere`;
    this.phase = 0;
    this.image = scene.add.image(0, 0, '__WHITE').setOrigin(0).setDepth(-20);
    this.motion = scene.add.graphics().setDepth(-10);
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
    // Bound the offscreen texture size on large displays; redraw only on resize.
    const ratio = Math.min(1, 1920 / width, 1200 / height);
    const texture = this.scene.textures.createCanvas(this.key, Math.ceil(width * ratio), Math.ceil(height * ratio));
    const ctx = texture.context;
    ctx.scale(ratio, ratio);
    this.drawAtmosphere(ctx, width, height);
    texture.refresh();
    this.image.setTexture(this.key).setDisplaySize(width, height);
    this.update(0);
  }

  drawAtmosphere(ctx, w, h) {
    const horizon = h * 0.56;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#080c1c');
    sky.addColorStop(0.5, '#171126');
    sky.addColorStop(0.64, '#101324');
    sky.addColorStop(1, '#050a13');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const glow = ctx.createRadialGradient(w / 2, horizon, 1, w / 2, horizon, w * 0.65);
    glow.addColorStop(0, '#92245a55');
    glow.addColorStop(0.42, '#3e22552a');
    glow.addColorStop(1, '#07101b00');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 70; i += 1) {
      const x = ((i * 137.508 + 41) % 997) / 997 * w;
      const y = ((i * 97.31 + 17) % 991) / 991 * horizon;
      ctx.fillStyle = i % 4 === 0 ? '#b9e8ff88' : '#b9e8ff28';
      ctx.fillRect(x, y, i % 4 === 0 ? 2 : 1, 1);
    }

    const radius = Math.min(w * 0.21, h * 0.28);
    ctx.save();
    ctx.beginPath();
    ctx.arc(w * 0.5, horizon - radius * 0.64, radius, 0, Math.PI * 2);
    ctx.clip();
    const sun = ctx.createLinearGradient(0, horizon - radius * 1.7, 0, horizon + radius * 0.4);
    sun.addColorStop(0, '#e878a848');
    sun.addColorStop(0.5, '#c2397e50');
    sun.addColorStop(1, '#ff408f08');
    ctx.fillStyle = sun;
    ctx.fillRect(w / 2 - radius, horizon - radius * 1.7, radius * 2, radius * 2.1);
    ctx.fillStyle = '#110f21';
    for (let y = horizon - radius * 0.8, gap = 3; y < horizon + radius; gap += 2) {
      ctx.fillRect(w / 2 - radius, y, radius * 2, gap);
      y += gap + 9;
    }
    ctx.restore();

    // Angular silhouettes and independent light strips: no external artwork.
    for (let side = 0; side < 2; side += 1) {
      ctx.save();
      if (side) { ctx.translate(w, 0); ctx.scale(-1, 1); }
      for (let i = 0; i < 12; i += 1) {
        const x = i * w * 0.038;
        const towerW = w * 0.025 + (i % 3) * 8;
        const towerH = h * (0.035 + ((i * 17) % 9) * 0.012);
        ctx.fillStyle = '#080e1a';
        ctx.fillRect(x, horizon - towerH, towerW, towerH);
        ctx.strokeStyle = i % 3 ? '#49608433' : '#ef4d9755';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, horizon - towerH, towerW, towerH);
        ctx.fillStyle = '#6bdde52a';
        for (let j = 8; j < towerH; j += 13) ctx.fillRect(x + 5, horizon - j, towerW * 0.3, 2);
      }
      ctx.restore();
    }

    ctx.strokeStyle = '#ff408f45';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.lineTo(w, horizon);
    ctx.stroke();

    // Dark tarmac down the middle; cyan verges give the scene a racing identity.
    ctx.fillStyle = '#060d19b8';
    ctx.beginPath();
    ctx.moveTo(w * 0.475, horizon);
    ctx.lineTo(w * 0.525, horizon);
    ctx.lineTo(w * 1.16, h);
    ctx.lineTo(w * -0.16, h);
    ctx.closePath();
    ctx.fill();

    const vignette = ctx.createRadialGradient(w / 2, h * 0.43, h * 0.17, w / 2, h * 0.43, Math.max(w, h) * 0.68);
    vignette.addColorStop(0, '#03071200');
    vignette.addColorStop(1, '#02040dd9');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    // Restrained scanlines, rather than pixel-art styling.
    ctx.fillStyle = '#07101a20';
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  }

  update(delta) {
    const w = this.width;
    const h = this.height;
    if (!w || !h) return;
    this.phase = (this.phase + Math.min(delta, 50) * 0.00012) % 1;
    const g = this.motion;
    const horizon = h * 0.56;
    g.clear();

    for (let i = -7; i <= 7; i += 1) {
      g.lineStyle(1, COLORS.cyan, i % 3 === 0 ? 0.12 : 0.045);
      g.lineBetween(w / 2 + i * w * 0.013, horizon, w / 2 + i * w * 0.28, h);
    }
    for (let i = 0; i < 18; i += 1) {
      const progress = ((i / 18 + this.phase) % 1) ** 2.8;
      const y = horizon + progress * (h - horizon);
      g.lineStyle(1, COLORS.cyan, progress * 0.1);
      g.lineBetween(0, y, w, y);
    }
    for (const side of [-1, 1]) {
      g.lineStyle(3, COLORS.cyan, 0.035);
      g.lineBetween(w / 2 + side * w * 0.025, horizon, w / 2 + side * w * 0.66, h);
      g.lineStyle(1, COLORS.cyan, 0.35);
      g.lineBetween(w / 2 + side * w * 0.025, horizon, w / 2 + side * w * 0.66, h);
      for (let i = 0; i < 5; i += 1) {
        const start = ((i / 5 + this.phase) % 1) ** 2;
        const end = Math.min(start + 0.035 + start * 0.08, 1);
        g.lineStyle(2, side < 0 ? COLORS.cyan : COLORS.pink, 0.18 + start * 0.35);
        g.lineBetween(w / 2 + side * w * (0.035 + start * 0.85), horizon + start * (h - horizon),
          w / 2 + side * w * (0.035 + end * 0.85), horizon + end * (h - horizon));
      }
    }
  }

  destroy() {
    this.image.destroy();
    this.motion.destroy();
    this.scene.textures.remove(this.key);
  }
}
