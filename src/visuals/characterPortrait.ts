import type Phaser from 'phaser';
import { CHARACTERS } from '../data/characters.ts';

type Character = (typeof CHARACTERS)[number];
type Point = readonly [number, number];
type Canvas = CanvasRenderingContext2D;

// Original vector-style busts. Each pilot has a distinct palette and silhouette.
// Cached at high resolution; the same artwork serves roster, profile and garage.
export function characterPortrait(scene: Phaser.Scene, character: Character): string {
  const key = `pilot-${character.id}`;
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, 512, 512);
  if (!texture) throw new Error(`Não foi possível criar a textura ${key}.`);
  const c = texture.context;
  const { accent, skin, hair, style, visor } = character.portrait;
  const polygon = (points: readonly Point[], fill: string | CanvasGradient, stroke: string | null = null, lineWidth = 3) => {
    c.beginPath();
    points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lineWidth; c.stroke(); }
  };
  const ellipse = (x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient) => {
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill();
  };
  const line = (points: readonly Point[], color: string | CanvasGradient, width = 3) => {
    c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.strokeStyle = color; c.lineWidth = width; c.stroke();
  };

  const background = c.createLinearGradient(0, 0, 512, 512);
  background.addColorStop(0, '#182337'); background.addColorStop(1, '#080e1c');
  c.fillStyle = background; c.fillRect(0, 0, 512, 512);
  c.strokeStyle = `${accent}21`; c.lineWidth = 1;
  for (let i = 0; i < 512; i += 40) {
    line([[i, 0], [i, 512]], `${accent}17`, 1);
    line([[0, i], [512, i]], `${accent}17`, 1);
  }
  c.shadowColor = accent; c.shadowBlur = 30;
  c.beginPath(); c.arc(256, 225, 173, 0, Math.PI * 2); c.strokeStyle = `${accent}77`; c.lineWidth = 3; c.stroke();
  c.shadowBlur = 0;
  polygon([[0, 455], [512, 80], [512, 140], [0, 512]], `${accent}0d`);

  if (style === 'ponytail') {
    ellipse(349, 159, 47, 66, hair);
    polygon([[350, 140], [407, 186], [424, 338], [373, 314], [335, 208]], hair, accent, 2);
    for (let x = 363; x < 405; x += 12) line([[x, 190], [x + 15, 304]], '#51405f', 5);
  }
  // Armored jackets and a distinct neon shoulder cut, rather than classic sprites.
  const shoulder = style === 'helmet' ? 26 : 52;
  polygon([[shoulder, 512], [shoulder + 24, 396], [163, 355], [350, 355], [488 - shoulder, 396], [512 - shoulder, 512]], '#151f33', '#63718b', 3);
  polygon([[185, 340], [328, 340], [340, 391], [256, 438], [172, 391]], '#283a50', accent, 3);
  polygon([[210, 304], [302, 304], [310, 369], [256, 404], [202, 369]], skin);
  polygon([[210, 318], [300, 318], [303, 347], [239, 370], [208, 350]], '#17152366');
  polygon([[78, 404], [153, 379], [192, 445], [168, 512], [48, 512]], '#22314a');
  polygon([[348, 380], [435, 407], [465, 512], [334, 512], [321, 445]], '#202c43');
  line([[90, 420], [145, 400], [168, 438]], accent, 8);
  line([[370, 405], [421, 425], [436, 480]], accent, 5);
  line([[256, 432], [256, 512]], '#6d7c92', 3);
  polygon([[278, 456], [310, 456], [310, 479], [278, 479]], accent);
  line([[284, 464], [303, 464]], '#0a1020', 3);

  // Face is shaded in broad, smooth illustrated planes.
  const face = c.createLinearGradient(181, 160, 333, 310);
  face.addColorStop(0, skin); face.addColorStop(0.65, skin); face.addColorStop(1, '#463d50');
  polygon([[185, 159], [218, 126], [294, 126], [329, 169], [320, 282], [292, 327], [256, 341], [217, 319], [187, 278]], face, '#111727', 5);
  ellipse(183, 231, 14, 26, skin); ellipse(330, 231, 13, 25, skin);
  polygon([[295, 172], [327, 174], [317, 280], [285, 314], [272, 315]], '#111a2d35');
  line([[256, 232], [246, 276], [267, 279]], '#3e344b88', 5);
  line([[236, 300], [277, 300]], '#292438', 4);
  line([[240, 310], [272, 310]], '#f0c4b744', 2);

  if (style === 'crest') {
    polygon([[171, 217], [169, 148], [201, 110], [315, 118], [341, 155], [329, 211], [307, 169], [205, 164], [193, 217]], hair, '#6d628d', 2);
    polygon([[216, 142], [233, 74], [255, 55], [277, 78], [301, 142]], '#76dcdf', accent, 3);
  } else if (style === 'solar-cowl') {
    // Kira's asymmetrical navigation cowl and compact map sensor.
    polygon([[161, 214], [151, 155], [177, 112], [224, 93], [295, 107], [347, 151],
      [334, 210], [310, 170], [276, 153], [226, 158], [191, 190]], hair, '#ffbe55', 3);
    polygon([[175, 137], [212, 101], [292, 111], [324, 144], [284, 129], [226, 133]], '#d98a42', '#ffe2a1', 2);
    line([[169, 159], [207, 137], [254, 136]], '#71f6ff', 4);
    polygon([[321, 124], [351, 136], [345, 163], [321, 153]], '#23374a', '#ffbe55', 2);
  } else if (style === 'salvage') {
    // Echo-7's one-sided recovery scanner and replaceable ceramic cheek plates.
    polygon([[170, 220], [169, 143], [205, 101], [294, 101], [341, 147], [340, 214],
      [315, 202], [308, 151], [201, 151], [194, 212]], '#46556b', accent, 3);
    polygon([[203, 273], [226, 285], [225, 320], [204, 303]], '#a3b4c9');
    line([[300, 272], [299, 309], [281, 325]], accent, 3);
    ellipse(178, 234, 18, 26, '#15273e'); ellipse(178, 234, 9, 13, accent);
    ellipse(334, 234, 11, 16, '#233b54');
    polygon([[291, 270], [316, 274], [309, 308], [285, 316]], '#a6a0ff', accent, 2);
  } else if (style === 'hauler') {
    // Atlas wears a dockworker's rebreather and load-bearing collar, not a crest helmet.
    polygon([[168, 219], [166, 147], [193, 108], [240, 91], [293, 102], [341, 145], [338, 215],
      [315, 202], [303, 149], [204, 151], [193, 214]], '#343d4a', accent, 4);
    polygon([[189, 270], [214, 276], [226, 306], [286, 306], [302, 276], [328, 270],
      [344, 344], [256, 374], [170, 344]], '#333e4b', accent, 3);
    for (let i = 0; i < 3; i += 1) line([[226, 294 + i * 7], [286, 294 + i * 7]], '#ffcf8b', 2);
    line([[204, 128], [236, 115], [286, 117]], '#ffdf9c', 5);
  } else if (style === 'spikes') {
    polygon([[168, 205], [169, 131], [196, 150], [205, 91], [235, 120], [257, 68], [281, 120], [315, 87], [318, 142], [349, 126], [337, 208], [307, 170], [199, 176]], hair, '#9dacca', 3);
    line([[214, 321], [244, 335], [282, 332]], '#535167', 8);
  } else if (style === 'resonance') {
    // Dax's original asymmetric audio-tech headset, not a stage costume:
    // isolated wave filters and directional pickup define his silhouette.
    polygon([[174, 205], [171, 151], [197, 115], [250, 99], [302, 113], [333, 153], [325, 189],
      [296, 155], [244, 160], [206, 145], [192, 191]], hair, '#765347', 3);
    c.strokeStyle = '#ffb454'; c.lineWidth = 10; c.beginPath(); c.arc(252, 179, 99, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
    ellipse(159, 229, 24, 31, '#263447');
    ellipse(159, 229, 15, 21, '#ffb454');
    ellipse(353, 226, 25, 34, '#263447');
    ellipse(353, 226, 16, 23, '#71f6ff');
    polygon([[361, 245], [379, 259], [367, 268], [343, 254]], '#64758a', '#ffb454', 2);
    line([[366, 267], [346, 281], [326, 278]], '#ffb454', 4);
    for (let i = 0; i < 4; i += 1) line([[145 + i * 7, 220 - (i % 2) * 5], [145 + i * 7, 238 + (i % 2) * 4]], i % 2 ? '#71f6ff' : '#ffb454', 2);
  } else if (style === 'ponytail') {
    polygon([[175, 222], [163, 151], [187, 111], [242, 93], [305, 109], [334, 163], [326, 213],
      [306, 161], [210, 153], [192, 215]], hair, '#827789', 3);
    polygon([[320, 149], [352, 162], [373, 255], [405, 321], [378, 342], [349, 268]], hair, accent, 3);
    ellipse(347, 165, 15, 14, '#d7e6d4');
    line([[202, 118], [225, 146]], accent, 9);
  } else {
    polygon([[175, 222], [163, 151], [187, 111], [242, 93], [305, 109], [334, 163], [326, 213], [306, 161], [210, 153], [192, 215]], hair, '#827789', 3);
    line([[202, 118], [225, 146]], accent, 9);
  }

  // Wraparound racing optics, with different shapes for human / synthetic pilot.
  polygon(style === 'android'
    ? [[193, 206], [317, 206], [312, 242], [199, 242]]
    : [[184, 205], [327, 205], [315, 244], [271, 247], [254, 231], [237, 247], [195, 240]], '#0c1d30', accent, 3);
  const glass = c.createLinearGradient(190, 206, 315, 245);
  glass.addColorStop(0, visor); glass.addColorStop(0.5, '#ffffff'); glass.addColorStop(0.51, visor); glass.addColorStop(1, '#223955');
  line([[199, 215], [312, 215]], glass, 6);
  line([[204, 229], [233, 231]], visor, 3);
  line([[276, 230], [306, 227]], visor, 3);
  line([[34, 32], [78, 32]], accent, 4);
  line([[478, 480], [434, 480]], accent, 4);
  c.fillStyle = `${accent}aa`; c.font = '16px Consolas, monospace'; c.fillText('R’N // PILOT', 32, 476);
  texture.refresh();
  return key;
}
