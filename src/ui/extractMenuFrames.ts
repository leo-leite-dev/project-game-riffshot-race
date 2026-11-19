import Phaser from 'phaser';

const SOURCE_WIDTH = 2560;
const SOURCE_HEIGHT = 1440;
const FRAME_RECTS = {
  active: { x: 64, y: 126, width: 1322, height: 184 },
  locked: { x: 64, y: 330, width: 1322, height: 184 },
} as const;
const MAIN_MENU_FRAME_RECTS = {
  active: { x: 84, y: 166, width: 1700, height: 242 },
  locked: { x: 84, y: 426, width: 1700, height: 234 },
} as const;
const LOCK_ICON_RECT = { x: 1964, y: 892, width: 126, height: 136 } as const;
const GLYPH_ROWS = [
  { letters: 'ABCDEFGHIJKLMN', x: 120, y: 875, width: 1075, height: 100 },
  { letters: 'OPQRSTUVWXYZ', x: 175, y: 980, width: 970, height: 100 },
  { letters: '0123456789', x: 245, y: 1125, width: 820, height: 105 },
] as const;

/** Recorta as molduras da folha original e torna transparente apenas o preto
 * conectado às bordas da imagem, preservando os pretos internos da arte. */
export function createMenuFrameTextures(scene: Phaser.Scene, sourceKey: string, mainMenu = false): void {
  const source = scene.textures.get(sourceKey).getSourceImage();
  if (!(source instanceof HTMLImageElement) && !(source instanceof HTMLCanvasElement)) return;

  const sheet = document.createElement('canvas');
  sheet.width = SOURCE_WIDTH;
  sheet.height = SOURCE_HEIGHT;
  const context = sheet.getContext('2d', { willReadFrequently: true });
  if (!context) return;
  context.drawImage(source, 0, 0, SOURCE_WIDTH, SOURCE_HEIGHT);
  const pixels = context.getImageData(0, 0, SOURCE_WIDTH, SOURCE_HEIGHT);
  const { data } = pixels;
  const queue = new Int32Array(SOURCE_WIDTH * SOURCE_HEIGHT);
  let head = 0;
  let tail = 0;
  const addIfExteriorBlack = (index: number): void => {
    if (data[index * 4 + 3] === 0) return;
    const offset = index * 4;
    if (data[offset] > 12 || data[offset + 1] > 12 || data[offset + 2] > 12) return;
    data[offset + 3] = 0;
    queue[tail++] = index;
  };
  for (let x = 0; x < SOURCE_WIDTH; x += 1) {
    addIfExteriorBlack(x);
    addIfExteriorBlack((SOURCE_HEIGHT - 1) * SOURCE_WIDTH + x);
  }
  for (let y = 1; y < SOURCE_HEIGHT - 1; y += 1) {
    addIfExteriorBlack(y * SOURCE_WIDTH);
    addIfExteriorBlack(y * SOURCE_WIDTH + SOURCE_WIDTH - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % SOURCE_WIDTH;
    if (x > 0) addIfExteriorBlack(index - 1);
    if (x + 1 < SOURCE_WIDTH) addIfExteriorBlack(index + 1);
    if (index >= SOURCE_WIDTH) addIfExteriorBlack(index - SOURCE_WIDTH);
    if (index + SOURCE_WIDTH < SOURCE_WIDTH * SOURCE_HEIGHT) addIfExteriorBlack(index + SOURCE_WIDTH);
  }
  context.putImageData(pixels, 0, 0);

  const frames = mainMenu ? MAIN_MENU_FRAME_RECTS : FRAME_RECTS;
  const framePrefix = mainMenu ? 'riffshot-original-main-frame' : 'riffshot-original-frame';
  for (const [state, rect] of Object.entries(frames)) {
    const key = `${framePrefix}-${state}`;
    if (scene.textures.exists(key)) continue;
    const canvas = scene.textures.createCanvas(key, rect.width, rect.height);
    if (!canvas) continue;
    canvas.context.drawImage(sheet, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    canvas.refresh();
  }

  const lockKey = `riffshot-original-${mainMenu ? 'main-' : ''}lock-icon`;
  if (!scene.textures.exists(lockKey)) {
    const { x, y, width, height } = LOCK_ICON_RECT;
    const lockCanvas = scene.textures.createCanvas(lockKey, width, height);
    if (lockCanvas) {
      lockCanvas.context.drawImage(sheet, x, y, width, height, 0, 0, width, height);
      const image = lockCanvas.context.getImageData(0, 0, width, height);
      const pixels = image.data;
      const queue = new Int32Array(width * height);
      let head = 0;
      let tail = 0;
      const addDarkExterior = (index: number): void => {
        const offset = index * 4;
        if (pixels[offset + 3] === 0 || Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]) > 64) return;
        pixels[offset + 3] = 0;
        queue[tail++] = index;
      };
      for (let px = 0; px < width; px += 1) {
        addDarkExterior(px);
        addDarkExterior((height - 1) * width + px);
      }
      for (let py = 1; py < height - 1; py += 1) {
        addDarkExterior(py * width);
        addDarkExterior(py * width + width - 1);
      }
      while (head < tail) {
        const index = queue[head++];
        const px = index % width;
        if (px > 0) addDarkExterior(index - 1);
        if (px + 1 < width) addDarkExterior(index + 1);
        if (index >= width) addDarkExterior(index - width);
        if (index + width < width * height) addDarkExterior(index + width);
      }
      lockCanvas.context.putImageData(image, 0, 0);
      lockCanvas.refresh();
    }
  }

  if (mainMenu) createOriginalGlyphTextures(scene, sheet);
}

function createOriginalGlyphTextures(scene: Phaser.Scene, sheet: HTMLCanvasElement): void {
  const context = sheet.getContext('2d', { willReadFrequently: true });
  if (!context) return;
  const sheetPixels = context.getImageData(0, 0, SOURCE_WIDTH, SOURCE_HEIGHT).data;

  for (const row of GLYPH_ROWS) {
    const activeColumns: number[] = [];
    for (let x = row.x; x < row.x + row.width; x += 1) {
      if (countGlyphInk(sheetPixels, x, row) > 0) activeColumns.push(x);
    }

    const ranges: Array<{ left: number; right: number }> = [];
    for (const x of activeColumns) {
      const range = ranges[ranges.length - 1];
      if (range && x - range.right <= 4) range.right = x;
      else ranges.push({ left: x, right: x });
    }

    while (ranges.length < row.letters.length) {
      let widestIndex = -1;
      let widest = 0;
      ranges.forEach((range, index) => {
        const width = range.right - range.left + 1;
        if (width > widest) {
          widest = width;
          widestIndex = index;
        }
      });
      if (widestIndex < 0 || widest < 2) break;

      const range = ranges[widestIndex];
      const inset = Math.floor(widest * 0.25);
      const start = range.left + inset;
      const end = range.right - inset;
      let split = Math.floor((start + end) / 2);
      let minimumInk = Number.POSITIVE_INFINITY;
      for (let x = start; x <= end; x += 1) {
        const ink = countGlyphInk(sheetPixels, x, row);
        if (ink < minimumInk) {
          minimumInk = ink;
          split = x;
        }
      }
      ranges.splice(widestIndex, 1,
        { left: range.left, right: split },
        { left: split + 1, right: range.right });
    }
    if (ranges.length !== row.letters.length) continue;

    ranges.forEach(({ left, right }, index) => {
      if (right < left) return;
      const key = `riffshot-original-glyph-${row.letters[index]}`;
      if (scene.textures.exists(key)) return;
      let top: number = row.y + row.height;
      let bottom: number = row.y;
      for (let y = row.y; y < row.y + row.height; y += 1) {
        for (let x = left; x <= right; x += 1) {
          const offset = (y * SOURCE_WIDTH + x) * 4;
          if (sheetPixels[offset] + sheetPixels[offset + 1] + sheetPixels[offset + 2] > 420) {
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
      }
      if (bottom < top) return;
      const pad = 3;
      const cropX = Math.max(0, left - pad);
      const cropY = Math.max(0, top - pad);
      const cropWidth = right - left + 1 + pad * 2;
      const cropHeight = bottom - top + 1 + pad * 2;
      const glyph = document.createElement('canvas');
      glyph.width = cropWidth;
      glyph.height = cropHeight;
      const glyphContext = glyph.getContext('2d', { willReadFrequently: true });
      if (!glyphContext) return;
      glyphContext.drawImage(sheet, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
      const image = glyphContext.getImageData(0, 0, cropWidth, cropHeight);
      for (let offset = 0; offset < image.data.length; offset += 4) {
        const red = image.data[offset];
        const green = image.data[offset + 1];
        const blue = image.data[offset + 2];
        const brightness = (red + green + blue) / 3;
        const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
        image.data[offset + 3] = saturation > 95 ? 0 : Math.round(Math.max(0, Math.min(1, (brightness - 28) / 58)) * 255);
      }
      glyphContext.putImageData(image, 0, 0);
      const texture = scene.textures.createCanvas(key, cropWidth, cropHeight);
      if (!texture) return;
      texture.context.drawImage(glyph, 0, 0);
      texture.refresh();
    });
  }
}

function countGlyphInk(pixels: Uint8ClampedArray, x: number, row: typeof GLYPH_ROWS[number]): number {
  let ink = 0;
  for (let y = row.y; y < row.y + row.height; y += 1) {
    const offset = (y * SOURCE_WIDTH + x) * 4;
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    if ((red + green + blue) / 3 > 145
      && Math.max(red, green, blue) - Math.min(red, green, blue) < 85) ink += 1;
  }
  return ink;
}
