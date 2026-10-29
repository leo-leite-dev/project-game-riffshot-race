// Original, deterministic Canvas2D artwork. Textures belong to the game, not a scene:
// one fixed key per artwork, no resize variants and no work in the update loop.
export const STATION_BACKDROP_KEY = 'station-industrial-backdrop-v1';
export const STATION_TITLE_KEY = 'station-team-title-v1';
export const OPENING_RIVAL_KEY = 'rival-opening-ferro';
export const STATION_BACKDROP_SIZE = Object.freeze({ width: 1664, height: 940 });
export const STATION_TITLE_SIZE = Object.freeze({ width: 800, height: 150 });

function randomSource(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function polygon(c: Canvas, points: readonly Point[], fill: string | CanvasGradient, stroke?: string, width = 1) {
  c.beginPath();
  points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}

function line(c: Canvas, points: readonly Point[], color: string | CanvasGradient, width = 1) {
  c.beginPath();
  points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.strokeStyle = color; c.lineWidth = width; c.stroke();
}

function ellipse(c: Canvas, x: number, y: number, rx: number, ry: number, fill?: string | CanvasGradient | null, stroke?: string, width = 1) {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}

function gradient(c: Canvas, x: number, y: number, x2: number, y2: number, stops: readonly GradientStop[]): CanvasGradient {
  const paint = c.createLinearGradient(x, y, x2, y2);
  stops.forEach(([offset, color]) => paint.addColorStop(offset, color));
  return paint;
}

function glow(c: Canvas, x: number, y: number, radius: number, color: string) {
  const paint = c.createRadialGradient(x, y, 0, x, y, radius);
  paint.addColorStop(0, color); paint.addColorStop(1, 'transparent');
  c.fillStyle = paint; c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function neon(c: Canvas, points: readonly Point[], color: string, width = 4) {
  c.save(); c.shadowColor = color; c.shadowBlur = 18;
  line(c, points, color, width);
  c.shadowBlur = 5; line(c, points, '#fff1d0', Math.max(1, width * 0.28));
  c.restore();
}

function scratches(c: Canvas, random: Random, x: number, y: number, w: number, h: number, count: number, color = '#90afbd30') {
  for (let i = 0; i < count; i += 1) {
    const sx = x + random() * w, sy = y + random() * h;
    line(c, [[sx, sy], [Math.min(x + w, sx + 2 + random() * 22), sy - random() * 3]], color);
  }
}

function cachedImage(scene: Phaser.Scene, key: string, width: number, height: number, paint: (context: Canvas) => void): Phaser.GameObjects.Image {
  if (!scene.textures.exists(key)) {
    const texture = scene.textures.createCanvas(key, width, height);
    if (!texture) throw new Error(`Não foi possível criar a textura ${key}.`);
    paint(texture.context);
    texture.refresh();
  }
  return scene.add.image(0, 0, key).setOrigin(0.5);
}

function paintBackdrop(c: Canvas) {
  const random = randomSource(0xf377042);
  c.fillStyle = gradient(c, 0, 0, 0, 940, [[0, '#080d19'], [0.32, '#340c1a'], [0.62, '#100f1b'], [1, '#040a10']]);
  c.fillRect(0, 0, 1664, 940);
  glow(c, 890, 186, 460, '#e51c2955');
  for (let i = 0; i < 110; i += 1) {
    c.fillStyle = i % 3 ? '#aa9b9c55' : '#ffd6bd99';
    c.fillRect(random() * 1664, random() * 360, 1.3, 1.3);
  }

  // Red foundry moon, craters and fractured mineral seams, visible above the pit.
  c.save(); c.beginPath(); c.arc(850, 184, 205, 0, Math.PI * 2); c.clip();
  c.fillStyle = gradient(c, 690, 0, 1000, 360, [[0, '#ff5c41'], [0.28, '#d92332'], [0.67, '#831528'], [1, '#1c1221']]);
  c.fillRect(640, -25, 420, 420);
  for (let i = 0; i < 660; i += 1) {
    const x = 640 + random() * 420, y = -25 + random() * 420, r = 2 + random() * 17;
    ellipse(c, x, y, r, r * 0.6, i % 3 ? '#430f252c' : '#ff855123');
    if (i % 7 === 0) ellipse(c, x + 1, y - 2, r, r * 0.6, null, '#ff865525');
  }
  for (let i = 0; i < 22; i += 1) {
    const x = 650 + random() * 380, y = random() * 340;
    line(c, [[x, y], [x + 15, y + 8], [x + 22, y + 29], [x + 48, y + 39]], '#50132980', 2);
  }
  c.restore();
  ellipse(c, 850, 184, 205, 205, null, '#ff635c88', 2);

  // Distant refinery: asymmetric towers, stacks, piping and gantries.
  for (let i = 0; i < 38; i += 1) {
    const x = 240 + i * 33, w = 19 + random() * 38, roof = 132 + random() * 130;
    polygon(c, [[x, 415], [x, roof + 14], [x + 8, roof + 14], [x + 8, roof],
      [x + w - 5, roof], [x + w - 5, roof + 7], [x + w, roof + 7], [x + w, 415]], '#080d16');
    if (i % 3 === 0) {
      c.fillStyle = '#0a0c14'; c.fillRect(x + 6, roof - 53, 10, 60);
      line(c, [[x + 5, roof - 50], [x + 18, roof - 50]], '#852c33', 3);
      for (let p = 0; p < 5; p += 1) ellipse(c, x + 12 + p * 9, roof - 65 - p * 13, 14 + p * 4, 8 + p * 2, '#2b142455');
    }
    for (let y = roof + 25; y < 380; y += 24) {
      c.fillStyle = i % 4 ? '#c23b2944' : '#64dce766';
      c.fillRect(x + 5, y, 3, 5); c.fillRect(x + w - 8, y, 3, 5);
    }
    if (i % 4 === 0) line(c, [[x, roof + 30], [x + 88, roof + 30], [x + 88, roof + 90]], '#1c202b', 7);
  }
  c.fillStyle = gradient(c, 0, 300, 0, 530, [[0, '#9b202000'], [0.5, '#9b202033'], [1, '#080c1300']]);
  c.fillRect(0, 300, 1664, 230);

  // Metal floor converges on the central work bay. Broken reflections feel wet,
  // rather than drawing the reference image or stretching a raster background.
  polygon(c, [[0, 550], [1664, 550], [1664, 940], [0, 940]],
    gradient(c, 0, 550, 0, 940, [[0, '#080d15'], [0.5, '#17212a'], [1, '#070d14']]));
  for (let i = -8; i <= 8; i += 1) {
    line(c, [[832 + i * 32, 550], [832 + i * 235, 940]], '#49606a66', 2);
    line(c, [[833 + i * 32, 551], [835 + i * 235, 940]], '#02060ba0', 4);
  }
  for (let i = 1; i < 12; i += 1) {
    const y = 550 + (i / 12) ** 2 * 390;
    line(c, [[0, y], [1664, y]], '#45606a45');
    line(c, [[0, y + 3], [1664, y + 3]], '#03080f', 3);
  }
  glow(c, 840, 890, 460, '#ef300b30');
  for (let i = 0; i < 420; i += 1) {
    const x = random() * 1664, y = 615 + random() * 325;
    const strength = Math.max(0, 1 - Math.abs(x - 832) / 850);
    c.globalAlpha = (0.08 + random() * 0.28) * strength;
    line(c, [[x, y], [x + 8 + random() * 65, y - 1]], i % 5 ? '#ff4d1b' : '#77ddeb', 1 + random() * 2);
  }
  c.globalAlpha = 1;
  [0, 1].forEach(side => {
    c.save(); if (side) { c.translate(1664, 0); c.scale(-1, 1); }
    // Massive sloped wall ribs, recessed panels, bolts and luminous fixtures.
    polygon(c, [[0, 0], [345, 0], [187, 217], [123, 635], [0, 783]], '#0a1019', '#53616a', 3);
    for (let i = 0; i < 7; i += 1) {
      const y = 10 + i * 100, inset = Math.max(0, 165 - i * 22);
      polygon(c, [[0, y], [inset + 101, y + 11], [inset + 69, y + 82], [0, y + 61]],
        gradient(c, 0, y, 130, y + 80, [[0, '#16212c'], [0.5, '#29313b'], [1, '#090e17']]), '#414956', 2);
      line(c, [[8, y + 9], [inset + 89, y + 19]], '#7b8b9855', 2);
      scratches(c, random, 8, y + 25, 65, 27, 10);
      ellipse(c, 17, y + 23, 4, 4, '#071019', '#6c7279', 1);
      neon(c, [[14, y + 49], [inset + 45, y + 64]], i % 3 === 0 ? '#50dfff' : '#ff3b17', 5);
    }
    polygon(c, [[0, 0], [245, 0], [352, 79], [324, 112], [197, 40], [0, 34]], '#101824', '#4f5b66', 3);
    for (let i = 0; i < 5; i += 1) {
      const x = 24 + i * 48;
      line(c, [[x, 0], [x + 67, 55], [x + 25, 51], [x + 5, 4]], '#465563', 3);
    }
    neon(c, [[211, 6], [270, 48]], '#77ddff', 12);
    // Service scaffold and diagonal braces remain behind the UI panels.
    line(c, [[151, 170], [104, 680]], '#080b11', 23);
    line(c, [[151, 170], [104, 680]], '#69737c', 3);
    for (let y = 240; y < 690; y += 95) {
      line(c, [[22, y + 70], [137, y], [16, y - 25]], '#1f2c39', 8);
      line(c, [[22, y + 70], [137, y]], '#5b6c7744', 2);
    }
    neon(c, [[124, 455], [112, 573]], '#ff4027', 7);
    c.restore();
  });

  // Hanging forged chain links, flattened alternately to show their orientation.
  [424, 1214, 1320].forEach((x, chain) => {
    for (let y = -16; y < 270 + chain * 12; y += 23) {
      const front = (Math.floor(y / 23) & 1) === 0;
      ellipse(c, x, y, front ? 8 : 4, 16, '#06080e', '#080a10', 5);
      ellipse(c, x - 1, y - 1, front ? 6 : 2, 13, null, '#6b424755', 2);
    }
  });
  // Foreground service rails, deck warning paint, loose cables and fasteners.
  line(c, [[0, 817], [300, 788], [1365, 788], [1664, 817]], '#070b11', 32);
  line(c, [[0, 809], [300, 782], [1365, 782], [1664, 809]], '#556573', 3);
  neon(c, [[0, 830], [299, 803]], '#fa431d', 3);
  neon(c, [[1365, 803], [1664, 830]], '#fa431d', 3);
  for (let x = 22; x < 1660; x += 53) {
    polygon(c, [[x, 798], [x + 14, 796], [x + 4, 810], [x - 10, 812]], '#bb743233');
  }
  c.beginPath(); c.moveTo(10, 915); c.bezierCurveTo(210, 795, 115, 955, 392, 875);
  c.strokeStyle = '#03070c'; c.lineWidth = 14; c.stroke();
  c.strokeStyle = '#72757c66'; c.lineWidth = 2; c.stroke();
  c.beginPath(); c.moveTo(1664, 870); c.bezierCurveTo(1430, 951, 1360, 851, 1257, 940);
  c.strokeStyle = '#020509'; c.lineWidth = 11; c.stroke();
  scratches(c, random, 0, 825, 1664, 115, 160, '#b2c6cd27');
  const vignette = c.createRadialGradient(832, 410, 260, 832, 470, 980);
  vignette.addColorStop(0, '#00000000'); vignette.addColorStop(1, '#01030bd4');
  c.fillStyle = vignette; c.fillRect(0, 0, 1664, 940);
}

export function createStationBackdrop(scene: Phaser.Scene): Phaser.GameObjects.Image {
  return cachedImage(scene, STATION_BACKDROP_KEY, 1664, 940, paintBackdrop);
}

function paintTitle(c: Canvas) {
  const random = randomSource(0xe911ab);
  // A separate transparent steel nameplate; the scene controls its placement.
  polygon(c, [[24, 23], [756, 8], [794, 32], [773, 123], [42, 145], [5, 119]], '#050a11', '#07090e', 7);
  polygon(c, [[25, 20], [752, 6], [788, 32], [767, 119], [43, 139], [9, 115]],
    gradient(c, 0, 10, 0, 142, [[0, '#465361'], [0.18, '#151c29'], [0.7, '#0a1019'], [1, '#35434f']]), '#78949d', 2);
  polygon(c, [[33, 30], [747, 16], [775, 36], [756, 110], [46, 128], [21, 109]], '#080d16', '#9f3b22', 2);
  line(c, [[32, 25], [296, 19]], '#ffb73e', 3);
  line(c, [[503, 127], [755, 119]], '#71f6ff88', 2);
  scratches(c, random, 31, 21, 728, 105, 135, '#92abbc2c');
  // Abstract folded chequer pennant, independently drawn geometry.
  c.save(); c.translate(681, 31); c.transform(1, -0.12, -0.23, 1, 0, 0);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      polygon(c, [[col * 17, row * 18], [col * 17 + 17, row * 18 - 2],
        [col * 17 + 17, row * 18 + 16], [col * 17, row * 18 + 18]], (col + row) % 2 ? '#121a24' : '#9dacb6');
    }
  }
  c.restore();
  const title = 'ESTAÇÃO DE EQUIPE';
  c.save(); c.translate(35, 103); c.rotate(-0.022);
  c.font = 'italic 900 70px "Arial Black", Arial, sans-serif';
  c.textBaseline = 'alphabetic'; c.lineJoin = 'round';
  const measured = c.measureText(title).width;
  c.scale(Math.min(1, 697 / measured), 1);
  c.shadowColor = '#000000'; c.shadowBlur = 7; c.shadowOffsetY = 4;
  c.strokeStyle = '#000000'; c.lineWidth = 12; c.strokeText(title, 0, 0);
  c.shadowBlur = 0; c.shadowOffsetY = 0;
  c.strokeStyle = '#663019'; c.lineWidth = 3; c.strokeText(title, 0, 0);
  c.fillStyle = gradient(c, 0, -76, 0, 7, [[0, '#fff3a0'], [0.22, '#ffcc39'], [0.5, '#ff931d'], [0.74, '#ff4019'], [1, '#da111d']]);
  c.fillText(title, 0, 0);
  // Sparse dry-brush nicks, small enough to preserve every letter and accent.
  for (let i = 0; i < 32; i += 1) {
    const x = random() * Math.min(measured, 697), y = -4 - random() * 38;
    line(c, [[x, y], [x + 3 + random() * 7, y - 2]], '#170f16aa', 1);
  }
  c.restore();
  [[26, 42], [30, 113], [763, 34], [750, 109]].forEach(([x, y]) => {
    ellipse(c, x, y, 4, 4, '#0a0d12', '#91a4af', 1);
    line(c, [[x - 2, y + 1], [x + 2, y - 1]], '#788b94');
  });
}

export function createStationTitle(scene: Phaser.Scene): Phaser.GameObjects.Image {
  return cachedImage(scene, STATION_TITLE_KEY, 800, 150, paintTitle);
}

// Numeric paths avoid allocating point arrays during layout redraws.
function cutPath(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, cut: number) {
  g.beginPath(); g.moveTo(x + cut, y); g.lineTo(x + w - cut, y);
  g.lineTo(x + w, y + cut); g.lineTo(x + w, y + h - cut);
  g.lineTo(x + w - cut, y + h); g.lineTo(x + cut, y + h);
  g.lineTo(x, y + h - cut); g.lineTo(x, y + cut); g.closePath();
}

export function drawStationFrame(graphics: Phaser.GameObjects.Graphics, width: number, height: number,
  { accent = 0x71f6ff, primary = false }: { accent?: number; primary?: boolean } = {}) {
  const g = graphics, x = -width / 2, y = -height / 2;
  const cut = Math.min(16, width / 5, height / 5);
  g.clear();
  cutPath(g, x, y, width, height, cut);
  g.fillStyle(0x050a10, 1).fillPath();
  g.lineStyle(3, 0x030509, 1).strokePath();
  cutPath(g, x + 2, y + 2, width - 4, height - 4, Math.max(2, cut - 1));
  g.fillStyle(0x35414c, 1).fillPath();
  g.lineStyle(1, 0x87949e, 0.9).strokePath();
  cutPath(g, x + 7, y + 7, width - 14, height - 14, Math.max(2, cut - 4));
  g.fillStyle(0x080f19, 1).fillPath();
  g.lineStyle(2, 0x05090e, 1).strokePath();
  cutPath(g, x + 10, y + 10, width - 20, height - 20, Math.max(2, cut - 6));
  g.lineStyle(1, accent, primary ? 0.9 : 0.38).strokePath();
  g.lineStyle(2, 0xc4d1d9, 0.35).lineBetween(x + cut, y + 3, -x - cut, y + 3);
  g.lineStyle(2, 0x010408, 1).lineBetween(x + cut, -y - 4, -x - cut, -y - 4);
  // Reinforced corner plates, slotted bolts, machining marks and neon inlays.
  for (let side = -1; side <= 1; side += 2) {
    for (let end = -1; end <= 1; end += 2) {
      const bx = side * (width / 2 - 17), by = end * (height / 2 - 17);
      g.lineStyle(5, 0x111a25, 1).lineBetween(bx - side * 7, by + end * 6, bx + side * 5, by - end * 7);
      g.fillStyle(0x05090f, 1).fillCircle(bx, by, 3.3);
      g.lineStyle(1, 0x75818b, 1).strokeCircle(bx, by, 3.3);
      g.lineStyle(1, 0xa3aab0, 0.7).lineBetween(bx - 1, by + 1, bx + 1, by - 1);
      g.lineStyle(1, 0x8d9ca8, 0.3).lineBetween(bx - side * 7, by - end * 9, bx - side * 1, by - end * 11);
    }
  }
  const inlay = Math.min(54, width * 0.17);
  g.lineStyle(3, accent, 0.9).lineBetween(x + cut + 9, y + 6, x + cut + inlay, y + 6);
  g.lineStyle(2, accent, 0.65).lineBetween(-x - cut - inlay, -y - 6, -x - cut - 9, -y - 6);
  return g;
}

function paintFerro(c: Canvas) {
  const random = randomSource(0xfee012);
  c.fillStyle = gradient(c, 0, 0, 512, 512, [[0, '#170e1a'], [0.45, '#641321'], [1, '#070f1a']]);
  c.fillRect(0, 0, 512, 512);
  glow(c, 235, 215, 266, '#ff301b77');
  for (let x = 16; x < 512; x += 32) line(c, [[x, 0], [x, 512]], '#ff44393b');
  for (let y = 8; y < 512; y += 32) line(c, [[0, y], [512, y]], '#ff44393b');
  ellipse(c, 260, 230, 196, 196, null, '#e44d3444', 2);
  polygon(c, [[0, 408], [512, 70], [512, 104], [0, 443]], '#ff6a2220');
  scratches(c, random, 12, 12, 488, 488, 100, '#fe67571c');

  // Ravik Ferro: heavy foundry coat, bare asymmetric scarred face, short hair,
  // copper service cables and one graphite optical module. No helmet or crest.
  polygon(c, [[10, 512], [30, 418], [105, 378], [173, 359], [329, 352], [417, 387], [481, 432], [505, 512]],
    '#101923', '#02070d', 8);
  polygon(c, [[18, 501], [39, 423], [111, 393], [159, 424], [131, 512]], '#28343d', '#5e686d', 3);
  polygon(c, [[353, 411], [413, 397], [471, 439], [493, 512], [376, 512]], '#202a33', '#596570', 3);
  polygon(c, [[37, 431], [110, 406], [138, 423], [126, 448], [42, 468]], '#b6471d', '#ff9c45', 2);
  polygon(c, [[386, 416], [416, 414], [463, 448], [472, 473], [390, 444]], '#a33b1a');
  line(c, [[46, 475], [110, 452]], '#70f5ff', 4);
  line(c, [[405, 455], [456, 481]], '#70f5ff', 3);
  // Neck and broad, folded lapels produce a recognizable workwear silhouette.
  polygon(c, [[207, 299], [320, 298], [332, 375], [278, 420], [195, 373]], '#a66443', '#171318', 4);
  polygon(c, [[211, 318], [319, 305], [319, 351], [263, 384], [212, 362]], '#553426');
  polygon(c, [[161, 344], [211, 367], [256, 425], [211, 462], [157, 416], [131, 367]], '#34434b', '#829194', 3);
  polygon(c, [[322, 342], [370, 356], [391, 416], [312, 463], [268, 426]], '#25313d', '#6b8087', 3);
  line(c, [[158, 359], [187, 410], [212, 430]], '#ff833a', 5);
  line(c, [[345, 356], [363, 404], [320, 438]], '#70f5ff', 4);
  polygon(c, [[237, 445], [267, 429], [293, 446], [303, 512], [222, 512]], '#0a111b');
  line(c, [[266, 455], [271, 512]], '#9da8ac', 3);
  polygon(c, [[328, 468], [365, 451], [372, 486], [335, 499]], '#4a5357', '#121b23', 2);
  line(c, [[337, 474], [358, 465]], '#ffb14d', 3);

  // Ear, skull and angular cell-shaded facial planes; turned slightly left.
  ellipse(c, 340, 228, 22, 35, '#9b5e40', '#1b1720', 4);
  ellipse(c, 342, 229, 10, 19, '#563c33');
  line(c, [[343, 214], [336, 226], [344, 238]], '#d18d5b', 3);
  polygon(c, [[175, 128], [214, 95], [292, 94], [333, 125], [346, 196], [333, 277],
    [314, 320], [273, 348], [223, 335], [185, 301], [165, 250], [161, 187]], '#bd8059', '#100f16', 6);
  polygon(c, [[172, 163], [205, 130], [264, 124], [293, 146], [280, 187], [222, 210], [175, 209]], '#d99a68');
  polygon(c, [[297, 133], [331, 156], [340, 204], [327, 276], [307, 311], [271, 335], [270, 296], [298, 249]], '#704b3b');
  polygon(c, [[173, 232], [205, 243], [225, 275], [212, 295], [186, 279]], '#e1a071');
  polygon(c, [[186, 284], [212, 294], [237, 321], [270, 330], [241, 331], [212, 316]], '#8c553c');
  polygon(c, [[213, 253], [228, 219], [244, 217], [240, 262], [259, 275], [239, 284], [217, 276]], '#df9b65');
  line(c, [[238, 227], [235, 261], [255, 272], [242, 279], [223, 275]], '#583a30', 3);
  line(c, [[207, 298], [235, 292], [268, 299], [285, 294]], '#382a29', 4);
  line(c, [[222, 306], [254, 309], [271, 303]], '#edb080', 2);
  polygon(c, [[212, 311], [238, 319], [268, 318], [283, 307], [275, 330], [243, 340], [219, 331]], '#433731');
  for (let i = 0; i < 30; i += 1) {
    const x = 209 + random() * 76, y = 313 + random() * 15;
    line(c, [[x, y], [x - 1, y + 3]], '#161c2266');
  }
  // Visible left eye is human, shaded under a dense, low brow.
  polygon(c, [[177, 213], [190, 204], [214, 205], [224, 214], [206, 222], [187, 220]], '#30272a');
  polygon(c, [[183, 214], [196, 210], [214, 214], [202, 218], [189, 217]], '#e6c9a0');
  ellipse(c, 201, 214, 4, 4, '#5e797a'); ellipse(c, 201, 214, 2, 3, '#111921');
  line(c, [[174, 201], [192, 194], [215, 199]], '#211e23', 6);
  line(c, [[180, 230], [197, 236], [212, 232]], '#7b4b38', 2);
  // Healed burn seams and cross-stitches, deliberately below the human eye.
  line(c, [[183, 238], [191, 256], [187, 267], [202, 285]], '#6b3e37', 5);
  line(c, [[181, 238], [189, 256], [185, 267], [200, 285]], '#f2b087', 2);
  for (let i = 0; i < 4; i += 1) line(c, [[182 + i * 3, 246 + i * 9], [193 + i * 3, 242 + i * 9]], '#563c35', 2);

  // Close-cropped hair: a shallow crop, not a mohawk/spiked crest.
  polygon(c, [[159, 200], [152, 155], [171, 113], [211, 88], [268, 84], [315, 101],
    [339, 134], [341, 179], [323, 170], [309, 136], [276, 126], [233, 131], [198, 127], [180, 163], [177, 192]], '#111820', '#52606a', 3);
  for (let i = 0; i < 43; i += 1) {
    const x = 172 + random() * 145, y = 110 + random() * 27;
    line(c, [[x, y], [x + 7, y - 11]], i % 3 ? '#33424a' : '#5e6763', 1.5);
  }
  line(c, [[174, 145], [180, 130], [208, 111]], '#ffa45d', 2);
  // Half-visor only covers the right orbital area. One round amber optic.
  polygon(c, [[248, 184], [294, 169], [333, 182], [340, 219], [318, 243], [272, 233], [252, 215]],
    gradient(c, 250, 180, 331, 236, [[0, '#48515b'], [0.5, '#192431'], [1, '#0b111b']]), '#0b1018', 5);
  line(c, [[255, 186], [296, 176], [326, 186]], '#8b9c9d', 2);
  ellipse(c, 295, 204, 23, 23, '#070e17', '#68777d', 3);
  ellipse(c, 295, 204, 16, 16, '#9a3d0c', '#f89a2b', 2);
  c.save(); c.shadowColor = '#ffab24'; c.shadowBlur = 15;
  ellipse(c, 295, 204, 10, 10, '#ffbc3b'); c.restore();
  ellipse(c, 292, 201, 4, 4, '#fff1a1');
  line(c, [[313, 226], [324, 223]], '#70f5ff', 2);
  [[258, 197], [326, 194], [319, 231]].forEach(([x, y]) => ellipse(c, x, y, 2, 2, '#9caaac'));
  // Copper cable bundle terminates at a collar socket, not helmet decoration.
  for (let i = 0; i < 3; i += 1) {
    c.beginPath(); c.moveTo(333 + i * 4, 198); c.bezierCurveTo(380 + i * 7, 220, 344 + i * 7, 312, 358 + i * 6, 362);
    c.strokeStyle = '#0a1018'; c.lineWidth = 8; c.stroke();
    c.strokeStyle = i === 1 ? '#d99a61' : '#a85f39'; c.lineWidth = 4; c.stroke();
  }
  polygon(c, [[344, 347], [381, 345], [381, 369], [347, 376]], '#192b37', '#7a898f', 2);
  for (let i = 0; i < 4; i += 1) line(c, [[351 + i * 6, 351], [352 + i * 6, 367]], '#d98d49', 2);
  scratches(c, random, 39, 436, 75, 21, 17, '#ffd38e77');
  scratches(c, random, 395, 445, 52, 30, 12, '#a6c5cf44');
  line(c, [[18, 40], [18, 18], [77, 18]], '#ff643c', 3);
  line(c, [[494, 437], [494, 494], [442, 494]], '#71f6ff', 3);
  c.fillStyle = '#edac77'; c.font = 'bold 11px Consolas, monospace';
  c.fillText('FORGE // 07', 25, 480);
}

export function createOpeningRivalPortrait(scene: Phaser.Scene): Phaser.GameObjects.Image {
  return cachedImage(scene, OPENING_RIVAL_KEY, 512, 512, paintFerro);
}
import type Phaser from 'phaser';

type Point = readonly [number, number];
type Canvas = CanvasRenderingContext2D;
type Random = () => number;
type GradientStop = readonly [number, string];
