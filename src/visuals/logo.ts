import type Phaser from 'phaser';

const LOGO_KEY = 'riffshot-racing-logo';

// Original typographic artwork, rendered once and reused by every scene.
export function createLogo(scene: Phaser.Scene, x = 0, y = 0, width = 600) {
  if (!scene.textures.exists(LOGO_KEY)) {
    const texture = scene.textures.createCanvas(LOGO_KEY, 1200, 450)!;
    const ctx = texture.context;
    ctx.save();
    ctx.translate(72, 10);
    ctx.transform(1, 0, -0.14, 1, 0, 0);
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';

    const metalText = (label: string, xPos: number, baseline: number, fontSize: number, maxWidth: number) => {
      ctx.font = `900 ${fontSize}px "Arial Black", Arial, sans-serif`;
      ctx.strokeStyle = '#071222';
      ctx.lineWidth = 16;
      ctx.strokeText(label, xPos + 3, baseline + 12, maxWidth);
      ctx.fillStyle = '#273450';
      ctx.fillText(label, xPos + 3, baseline + 12, maxWidth);
      ctx.shadowColor = '#45e4ff';
      ctx.shadowBlur = 24;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#89efff';
      ctx.strokeText(label, xPos, baseline, maxWidth);
      ctx.shadowBlur = 0;
      const chrome = ctx.createLinearGradient(0, baseline - fontSize, 0, baseline);
      chrome.addColorStop(0, '#ffffff');
      chrome.addColorStop(0.28, '#f0f8ff');
      chrome.addColorStop(0.47, '#a9c6e0');
      chrome.addColorStop(0.5, '#354967');
      chrome.addColorStop(0.56, '#6a83a1');
      chrome.addColorStop(0.9, '#e5faff');
      chrome.addColorStop(1, '#7199b7');
      ctx.fillStyle = chrome;
      ctx.fillText(label, xPos, baseline, maxWidth);
    };

    metalText('RIFFSHOT', 565, 177, 152, 1040);
    metalText('RACING', 560, 360, 224, 1040);
    ctx.strokeStyle = '#ff408f';
    ctx.shadowColor = '#ff408f';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(55, 389);
    ctx.lineTo(1040, 389);
    ctx.stroke();
    ctx.restore();

    // Original frequency emblem: an angular waveform inside a beveled badge.
    ctx.fillStyle = '#071927';
    ctx.strokeStyle = '#ffb454';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(171, 2);
    ctx.lineTo(240, 2);
    ctx.lineTo(270, 17);
    ctx.lineTo(212, 52);
    ctx.lineTo(153, 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#ffb454';
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(171, 27);
    ctx.lineTo(185, 27);
    ctx.lineTo(197, 7);
    ctx.lineTo(211, 44);
    ctx.lineTo(224, 15);
    ctx.lineTo(235, 33);
    ctx.lineTo(255, 33);
    ctx.stroke();
    texture.refresh();
  }

  return scene.add.image(x, y, LOGO_KEY).setDisplaySize(width, width * 0.375);
}
