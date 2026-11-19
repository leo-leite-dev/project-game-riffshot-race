import Phaser from 'phaser';
import { CHARACTERS } from '../data/characters.ts';
import { pilotIconTextureKey, pilotPortraitTextureKey } from '../data/pilotIcons.ts';
import { applyPilotSelectionFont, PILOT_SELECTION_FONT } from './PilotSelectionTypography.ts';

export type RacingCharacter = (typeof CHARACTERS)[number];

export const CHARACTER_CARD_GAP = 18;
const CARD_GROWTH = 1.15;
const STANDARD_VISIBLE_FRAME_HEIGHT = 492;
const STANDARD_FRAME_TEXTURE_HEIGHT = 512;
const STANDARD_FRAME_DISPLAY_HEIGHT = 293;
const STANDARD_VISIBLE_FRAME_WIDTH = 419;
const AXEL_VISIBLE_FRAME = { width: 1040, height: 1222 } as const;
const STANDARD_VISIBLE_FRAME_TOP = 7;
const AXEL_VISIBLE_FRAME_TOP = 16;
const BADGE_SYMBOL_MAX_SIZE = 48;
const STANDARD_BADGE = {
  x: -91.5,
  y: 103.5,
  openingWidth: 52.6,
  openingHeight: 61.4,
} as const;
const AXEL_BADGE = {
  x: -88.2,
  y: 105.5,
  openingWidth: 56.2,
  openingHeight: 61.6,
} as const;
const NAMEPLATE = {
  fontSize: 18,
  textInset: 9.65,
} as const;
// Lower barPath bounds from the existing plate artwork. Axel's plate is trimmed;
// the other cards use that same source bar mapped into their standard frame canvas.
const AXEL_NAMEPLATE_SOURCE = {
  width: 1254,
  height: 1254,
  barLeft: 369 + 35.9,
  barCenterY: (930 + 1128) / 2,
} as const;
const STANDARD_NAMEPLATE_SOURCE = {
  width: 463,
  height: 512,
  barLeft: 22 + (369 - 71) * 419 / 1112,
  barCenterY: 7 + ((930 + 1128) / 2 - 16) * 492 / 1222,
} as const;
const AXEL_NAMEPLATE_BAR_HEIGHT = 1128 - 930;
const STANDARD_NAMEPLATE_BAR_HEIGHT = AXEL_NAMEPLATE_BAR_HEIGHT
  * STANDARD_VISIBLE_FRAME_HEIGHT / AXEL_VISIBLE_FRAME.height;
const CARD_PORTRAIT_OVERHANG = 16;
const CARD_PORTRAIT_PLATE_OVERLAP = 6;

export class CharacterCard extends Phaser.GameObjects.Container {
  character: RacingCharacter;
  sprite: Phaser.GameObjects.Image;
  readonly plate: Phaser.GameObjects.Image;
  readonly cardPortrait: Phaser.GameObjects.Image | null;
  readonly pilotSymbol: Phaser.GameObjects.Image;
  readonly pilotName: Phaser.GameObjects.Text;
  readonly visualWidth: number;
  readonly visualHeight: number;
  readonly visualTopOffset: number;
  readonly visualBottomOffset: number;
  selected = false;
  hovered = false;
  private readonly accentColor: number;
  private readonly selectionIndicator: Phaser.GameObjects.Graphics;
  private readonly normalTextureKey: string;
  private readonly selectedTextureKey: string;

  constructor(
    scene: Phaser.Scene,
    character: RacingCharacter,
    index: number,
    accent: string,
    onSelect: (index: number) => void,
  ) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.character = character;
    this.accentColor = Number.parseInt(accent.slice(1), 16);
    const usesAxelFrameLayers = character.id === 'axel-ryder';
    this.normalTextureKey = usesAxelFrameLayers
      ? 'pilot-axel-frame-back'
      : `pilot-empty-frame-${character.id}`;
    this.selectedTextureKey = usesAxelFrameLayers
      ? 'pilot-axel-frame-back-selected'
      : `${this.normalTextureKey}-selected`;
    this.sprite = scene.add.image(0, 0, this.normalTextureKey);
    const sprite = scene.textures.get(this.normalTextureKey).getSourceImage();
    const visibleFrame = usesAxelFrameLayers
      ? AXEL_VISIBLE_FRAME
      : { width: STANDARD_VISIBLE_FRAME_WIDTH, height: STANDARD_VISIBLE_FRAME_HEIGHT };
    const commonVisibleHeight = STANDARD_FRAME_DISPLAY_HEIGHT
      * STANDARD_VISIBLE_FRAME_HEIGHT / STANDARD_FRAME_TEXTURE_HEIGHT * CARD_GROWTH;
    const spriteScale = commonVisibleHeight / visibleFrame.height;
    this.sprite.setDisplaySize(sprite.width * spriteScale, sprite.height * spriteScale);
    this.visualWidth = visibleFrame.width * spriteScale;
    this.visualHeight = commonVisibleHeight;
    const visibleTop = usesAxelFrameLayers
      ? AXEL_VISIBLE_FRAME_TOP
      : STANDARD_VISIBLE_FRAME_TOP;
    this.visualTopOffset = (visibleTop - sprite.height / 2) * spriteScale;
    this.visualBottomOffset = (visibleTop + visibleFrame.height - sprite.height / 2) * spriteScale;
    const background = scene.add.image(0, 0, `pilot-background-${character.id}`)
      .setDisplaySize(
        this.sprite.displayWidth,
        usesAxelFrameLayers
          ? this.sprite.displayHeight * STANDARD_FRAME_DISPLAY_HEIGHT / 265
          : this.sprite.displayHeight,
      );
    const portraitKey = pilotPortraitTextureKey(character.id);
    if (scene.textures.exists(portraitKey)) {
      const portraitSource = scene.textures.get(portraitKey).getSourceImage();
      if (!(portraitSource instanceof HTMLImageElement)
        && !(portraitSource instanceof HTMLCanvasElement)) {
        throw new Error(`A arte do card de ${character.name} não foi carregada como imagem.`);
      }
      const visibleCenterX = getVisibleAlphaCenterX(portraitSource);
      const nameplateSource = usesAxelFrameLayers
        ? AXEL_NAMEPLATE_SOURCE
        : STANDARD_NAMEPLATE_SOURCE;
      const nameplateBarHeight = usesAxelFrameLayers
        ? AXEL_NAMEPLATE_BAR_HEIGHT
        : STANDARD_NAMEPLATE_BAR_HEIGHT;
      const nameplateTopY = nameplateSource.barCenterY - nameplateBarHeight / 2;
      const plateTopOffset = (nameplateTopY - nameplateSource.height / 2)
        * this.sprite.displayHeight / nameplateSource.height;
      const portraitTop = this.visualTopOffset - CARD_PORTRAIT_OVERHANG;
      // As artes terminam em um corte reto no busto: a escala é calculada até
      // ultrapassar a placa, para que essa borda da imagem fique sempre escondida.
      const portraitHeight = plateTopOffset + CARD_PORTRAIT_PLATE_OVERLAP - portraitTop;
      const portraitWidth = portraitHeight * portraitSource.width / portraitSource.height;
      this.cardPortrait = scene.add.image(
        0,
        portraitTop,
        portraitKey,
      )
        .setOrigin(visibleCenterX / portraitSource.width, 0)
        .setScale(portraitWidth / portraitSource.width);
    } else {
      this.cardPortrait = null;
    }
    if (usesAxelFrameLayers) {
      this.plate = scene.add.image(0, 0, 'pilot-axel-frame-plate')
        .setDisplaySize(this.sprite.displayWidth, this.sprite.displayHeight);
    } else {
      const plateKey = `pilot-empty-plate-${character.id}`;
      this.plate = scene.add.image(0, 0, plateKey)
        .setDisplaySize(this.sprite.displayWidth, this.sprite.displayHeight);
    }
    const badge = usesAxelFrameLayers ? AXEL_BADGE : STANDARD_BADGE;
    const symbolTextureKey = pilotIconTextureKey(character.id);
    const symbolSource = scene.textures.get(symbolTextureKey).getSourceImage();
    const symbolScale = Math.min(
      BADGE_SYMBOL_MAX_SIZE / symbolSource.width,
      BADGE_SYMBOL_MAX_SIZE / symbolSource.height,
    );
    const badgeBlackFill = scene.add.ellipse(
      badge.x,
      badge.y,
      badge.openingWidth,
      badge.openingHeight,
      0x000000,
    );
    this.pilotSymbol = scene.add.image(badge.x, badge.y, symbolTextureKey)
      .setOrigin(0.5)
      .setDisplaySize(symbolSource.width * symbolScale, symbolSource.height * symbolScale);

    const nameplateSource = usesAxelFrameLayers
      ? AXEL_NAMEPLATE_SOURCE
      : STANDARD_NAMEPLATE_SOURCE;
    const nameLeft = this.plate.x
      + (nameplateSource.barLeft - nameplateSource.width / 2)
        * this.plate.displayWidth / nameplateSource.width
      + NAMEPLATE.textInset;
    const nameCenterY = this.plate.y
      + (nameplateSource.barCenterY - nameplateSource.height / 2)
        * this.plate.displayHeight / nameplateSource.height;
    this.pilotName = scene.add.text(nameLeft, nameCenterY,
      character.name.toLocaleUpperCase('pt-BR'), {
        fontSize: NAMEPLATE.fontSize,
        color: '#ffffff',
        align: 'left',
        stroke: '#10090c',
        strokeThickness: 0.5,
        padding: { left: 1, right: 1, top: 1, bottom: 1 },
      })
      .setOrigin(0, 0.5)
      .setResolution(2);
    applyPilotSelectionFont(this.pilotName, PILOT_SELECTION_FONT.weight.display);

    // O aro original fica por cima do fundo preto e do símbolo, sem redesenhar a moldura.
    this.add([
      background,
      this.sprite,
      ...(this.cardPortrait ? [this.cardPortrait] : []),
      badgeBlackFill,
      this.pilotSymbol,
      this.plate,
      this.pilotName,
    ]);
    this.selectionIndicator = scene.add.graphics().setVisible(false);
    this.add(this.selectionIndicator);
    this.drawSelectionIndicator();
    // Hitbox slightly exceeds the sprite so edge clicks and hover remain reliable.
    this.setSize(this.visualWidth, this.visualHeight).setInteractive({ useHandCursor: true });
    this.on('pointerover', () => this.setHovered(true));
    this.on('pointerout', () => this.setHovered(false));
    this.on('pointerdown', () => onSelect(index));
    this.setSelected(false);
  }

  playEntrance(delay: number): this {
    this.setScale(0.84);
    this.sprite.setAlpha(0);
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 1,
      delay,
      duration: 330,
      ease: 'Sine.Out',
    });
    this.scene.tweens.add({
      targets: this,
      scale: this.selected ? 1.055 : 1,
      delay,
      duration: 420,
      ease: 'Back.Out',
    });
    return this;
  }

  setSelected(selected: boolean) {
    if (selected !== this.selected) {
      this.sprite.setTexture(selected ? this.selectedTextureKey : this.normalTextureKey);
    }
    this.selected = selected;
    this.selectionIndicator.setVisible(selected);
    this.updateEmphasis();
    return this;
  }

  setHovered(hovered: boolean) {
    this.hovered = hovered;
    this.updateEmphasis();
    return this;
  }

  private updateEmphasis(): void {
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({
      targets: this,
      scale: this.hovered ? 1.025 : 1,
      duration: 150,
      ease: 'Quad.Out',
    });
  }

  private drawSelectionIndicator(): void {
    const x = this.sprite.displayWidth / 2 - 8;
    const y = this.sprite.displayHeight / 2 - 10;
    this.selectionIndicator.clear();
    this.selectionIndicator.fillStyle(this.accentColor, 0.98).fillCircle(x, y, 11);
    this.selectionIndicator.lineStyle(1.5, 0xffffff, 0.95).strokeCircle(x, y, 11);
    this.selectionIndicator.lineStyle(2.4, 0xffffff, 1)
      .beginPath()
      .moveTo(x - 4.5, y)
      .lineTo(x - 1, y + 3.5)
      .lineTo(x + 5, y - 4)
      .strokePath();
  }
}

function getVisibleAlphaCenterX(source: HTMLImageElement | HTMLCanvasElement): number {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return source.width / 2;
  context.drawImage(source, 0, 0);
  const { data } = context.getImageData(0, 0, source.width, source.height);
  let left = source.width;
  let right = 0;

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      if (data[(y * source.width + x) * 4 + 3]! <= 24) continue;
      left = Math.min(left, x);
      right = Math.max(right, x + 1);
    }
  }

  return right > left ? (left + right) / 2 : source.width / 2;
}
