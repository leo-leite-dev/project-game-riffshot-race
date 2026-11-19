import Phaser from 'phaser';

/** Compõe texto usando somente os glifos recortados do guia original. */
export function addMenuGlyphText(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  value: string,
  x: number,
  y: number,
  height: number,
): Phaser.GameObjects.Container | undefined {
  const glyphs: Array<{ key: string; width: number; height?: number; acuteAccent?: boolean }> = [];
  for (const character of value) {
    if (character === ' ') {
      glyphs.push({ key: '', width: height * 0.34 });
      continue;
    }
    if (character === '-') {
      const hyphenKey = createHyphenFromOriginalGlyph(scene);
      if (!hyphenKey) return undefined;
      const hyphen = scene.textures.get(hyphenKey).getSourceImage();
      const width = height * 0.58;
      glyphs.push({ key: hyphenKey, width, height: width * hyphen.height / hyphen.width });
      continue;
    }
    const acuteAccent = character === 'Í';
    const glyphCharacter = acuteAccent ? 'I' : character;
    const key = `riffshot-original-glyph-${glyphCharacter}`;
    if (!scene.textures.exists(key)) return undefined;
    const source = scene.textures.get(key).getSourceImage();
    const width = height * source.width / source.height;
    glyphs.push({ key, width, acuteAccent });
  }

  const gap = height * 0.075;
  const totalWidth = glyphs.reduce((sum, glyph) => sum + glyph.width, 0)
    + Math.max(0, glyphs.length - 1) * gap;
  const text = scene.add.container(x, y);
  const images: Phaser.GameObjects.Image[] = [];
  let cursor = 0;
  for (const glyph of glyphs) {
    if (glyph.key) {
      const image = scene.add.image(cursor + glyph.width / 2, 0, glyph.key)
        .setDisplaySize(glyph.width, glyph.height ?? height);
      text.add(image);
      images.push(image);
      if (glyph.acuteAccent) {
        const accentKey = createHyphenFromOriginalGlyph(scene);
        if (!accentKey) return undefined;
        const accentSource = scene.textures.get(accentKey).getSourceImage();
        const accentWidth = height * 0.25;
        const accentHeight = accentWidth * accentSource.height / accentSource.width;
        text.add(scene.add.image(cursor + glyph.width * 0.76, -height * 0.55, accentKey)
          .setDisplaySize(accentWidth, accentHeight)
          .setRotation(-0.65));
      }
    }
    cursor += glyph.width + gap;
  }
  images.forEach(image => image.setX(image.x - totalWidth / 2));
  parent.add(text);
  return text;
}

function createHyphenFromOriginalGlyph(scene: Phaser.Scene): string | undefined {
  const key = 'riffshot-original-glyph-hyphen';
  if (scene.textures.exists(key)) return key;
  const sourceKey = 'riffshot-original-glyph-E';
  if (!scene.textures.exists(sourceKey)) return undefined;
  const source = scene.textures.get(sourceKey).getSourceImage();
  if (!(source instanceof HTMLImageElement) && !(source instanceof HTMLCanvasElement)) return undefined;
  const x = Math.round(source.width * 0.16);
  const y = Math.round(source.height * 0.45);
  const width = Math.max(1, Math.round(source.width * 0.68));
  const height = Math.max(1, Math.round(source.height * 0.16));
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return undefined;
  texture.context.drawImage(source, x, y, width, height, 0, 0, width, height);
  texture.refresh();
  return key;
}
