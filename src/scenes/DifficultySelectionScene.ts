import { TitleScene } from './TitleScene.ts';
import menuArtwork from '../assets/ui/menus/main-menu-artwork.png';
import buttonGuide from '../assets/ui/menus/menu-button-sprite-sheet.png';
import { DIFFICULTIES } from '../data/raceDifficulty.ts';
import { MenuButton } from '../ui/MenuButton.ts';
import { MenuButtonArtwork } from '../ui/MenuButtonArtwork.ts';
import { createMenuFrameTextures } from '../ui/extractMenuFrames.ts';
import { addMenuGlyphText } from '../ui/MenuGlyphText.ts';
import { SCENES } from '../ui/theme.ts';
import Phaser from 'phaser';

const ART_WIDTH = 1672;
const ART_HEIGHT = 941;
const BUTTON_SPRITE_WIDTH = 1700;
const BUTTON_SPRITE_HEIGHT = 242;
const BUTTON_DESIGN_WIDTH = 540;
const MOBILE_ART_HEIGHT_RATIO = 0.38;
const MOBILE_ART_WIDTH_RATIO = 1.3;
const MOBILE_ART_VISIBLE_RATIO = 0.9;
const MOBILE_CONTINUATION_SIZE = 300;
const MOBILE_CONTINUATION_CROP = { x: 686, y: 480, size: MOBILE_CONTINUATION_SIZE };
const MOBILE_BUTTON_WIDTH_RATIO = 0.66;
const MOBILE_TOUCH_TARGET = 48;
const MOBILE_TOUCH_GAP = 6;
const BUTTON_VERTICAL_GAP = 7.5;
const BUTTON_HOVER_SCALE = 1.08;
const BUTTON_IDLE_SCALES = [1, 0.95, 0.9] as const;
const BUTTON_ALPHA_BOUNDS = [
  { left: 0, top: 0, right: BUTTON_SPRITE_WIDTH, bottom: BUTTON_SPRITE_HEIGHT },
  { left: 0, top: 0, right: BUTTON_SPRITE_WIDTH, bottom: BUTTON_SPRITE_HEIGHT },
  { left: 0, top: 0, right: BUTTON_SPRITE_WIDTH, bottom: BUTTON_SPRITE_HEIGHT },
] as const;
const DIFFICULTY_BUTTON_STATES = {
  idle: 'riffshot-original-main-frame-locked',
  selected: 'riffshot-original-main-frame-active',
} as const;
const OPTIONS = [
  { id: 'normal', label: 'NORMAL', details: 'Bots equilibrados, curvas acessíveis e pequenos erros de condução.' },
  { id: 'hard', label: 'DIFÍCIL', details: 'Bots mais precisos, frenagem tardia e ultrapassagens calculadas — sem velocidade impossível.' },
] as const;
const ACTIONS = [...OPTIONS.map(option => option.label), 'VOLTAR'];

export class DifficultySelectionScene extends TitleScene {
  declare selectedIndex: number;
  declare focusIndex: number;
  declare cards: MenuButton[];
  declare backButton: MenuButton;
  private menuArtwork!: Phaser.GameObjects.Image;
  private mobileContinuation!: Phaser.GameObjects.Image;
  private menuComplement!: Phaser.GameObjects.Graphics;
  private mobileArtworkFade!: Phaser.GameObjects.Graphics;
  private buttonArtwork: MenuButtonArtwork[] = [];
  private buttonBaseScales = [1, 1, 1];
  private hoveredIndex: number | null = null;
  private confirmationInProgress = false;

  constructor() { super(SCENES.difficulty); }

  preload(): void {
    this.load.image('riffshot-difficulty-art', menuArtwork);
    this.load.image('riffshot-menu-button-guide', buttonGuide);
  }

  create(): void {
    this.confirmationInProgress = false;
    this.hoveredIndex = null;
    this.buttonArtwork = [];
    document.body.classList.add('difficulty-selection-active');
    this.createShell('RIFFSHOT RACING. Selecione a dificuldade do campeonato antes de escolher o piloto.');
    createMenuFrameTextures(this, 'riffshot-menu-button-guide', true);
    this.backdrop.image.setVisible(false);
    this.backdrop.motion.setVisible(false);
    this.chrome.setVisible(false);
    this.brand.setVisible(false);
    this.edition.setVisible(false);
    this.system.setVisible(false);
    this.footerLeft.setVisible(false);
    this.footerRight.setVisible(false);

    this.menuComplement = this.add.graphics().setDepth(-6);
    this.createMobileContinuationTexture();
    this.mobileContinuation = this.add.image(0, 0, 'riffshot-mobile-continuation')
      .setDepth(-5.5)
      .setAlpha(0.52)
      .setTint(0xc17aa5)
      .setVisible(false);
    this.menuArtwork = this.add.image(0, 0, 'riffshot-difficulty-art').setDepth(-5);
    this.mobileArtworkFade = this.add.graphics().setDepth(-4);
    this.cards = OPTIONS.map((option, index) => this.createButton(option.label, index, () => this.confirm(index)));
    this.backButton = this.createButton('VOLTAR', 2, () => this.confirmBack());
    this.content.add([...this.cards, this.backButton]);

    this.selectedIndex = OPTIONS.findIndex(option => option.id === this.registry.get('selectedDifficultyId'));
    if (this.selectedIndex < 0) this.selectedIndex = 0;
    this.select(this.selectedIndex);
    this.resizeShell();
    this.input.keyboard?.addCapture(['UP', 'DOWN', 'SPACE', 'TAB']);
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      event.stopPropagation();
      if (this.transitioning || this.confirmationInProgress || event.repeat) return;
      if (event.key === 'Escape') this.goTo(SCENES.menu);
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        this.focusAction(this.focusIndex + (event.key === 'ArrowUp' ? -1 : 1));
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        this.focusAction((this.focusIndex + (event.shiftKey ? -1 : 1) + ACTIONS.length) % ACTIONS.length);
      }
      if (event.key === 'Enter' || event.code === 'Space') this.activateFocused();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.body.classList.remove('difficulty-selection-active');
      this.input.keyboard?.removeCapture(['UP', 'DOWN', 'SPACE', 'TAB']);
    });
  }

  layout(w: number, h: number): void {
    if (!this.menuArtwork || !this.cards) return;
    const portrait = h > w * 1.08;
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    const backgroundScale = portrait
      ? Math.max(w * MOBILE_ART_WIDTH_RATIO / ART_WIDTH, h * MOBILE_ART_HEIGHT_RATIO / ART_HEIGHT)
      : Math.max(w / ART_WIDTH, h / ART_HEIGHT);
    const artHeight = ART_HEIGHT * backgroundScale;
    const artTop = portrait ? 0 : (h - artHeight) / 2;
    if (portrait) this.menuArtwork.setCrop(0, 0, ART_WIDTH, ART_HEIGHT * MOBILE_ART_VISIBLE_RATIO);
    else this.menuArtwork.setCrop();
    this.menuArtwork.setPosition(w / 2, artTop + artHeight / 2).setScale(backgroundScale);
    const artBottom = artTop + artHeight * (portrait ? MOBILE_ART_VISIBLE_RATIO : 1);
    this.mobileContinuation.setVisible(portrait);
    if (portrait) {
      const continuationHeight = h - artTop - artHeight * MOBILE_ART_VISIBLE_RATIO + 42;
      const continuationScale = Math.max(w, continuationHeight) / MOBILE_CONTINUATION_SIZE;
      this.mobileContinuation
        .setPosition(w / 2, artBottom - 42 + MOBILE_CONTINUATION_SIZE * continuationScale / 2)
        .setScale(continuationScale);
    }

    this.menuComplement.clear()
      .fillGradientStyle(portrait ? 0x32102e : 0x190b20, portrait ? 0x25102a : 0x130a1b,
        portrait ? 0x0d1023 : 0x080b19, portrait ? 0x170d25 : 0x0c101c, 1)
      .fillRect(0, 0, w, h);
    this.mobileArtworkFade.clear();
    if (portrait) {
      this.menuComplement
        .lineStyle(2, 0xff315a, 0.18)
        .lineBetween(w * 0.04, artBottom + 16, w * 0.43, h)
        .lineBetween(w * 0.96, artBottom + 16, w * 0.57, h)
        .lineStyle(1, 0x9b73ff, 0.14)
        .lineBetween(w * 0.17, artBottom + 34, w * 0.47, h)
        .lineBetween(w * 0.83, artBottom + 34, w * 0.53, h);
      const fadeTop = artTop + artHeight * 0.55;
      const fadeEnd = artTop + artHeight * 0.84;
      this.mobileArtworkFade
        .fillGradientStyle(0x170d25, 0x170d25, 0x0d1023, 0x0d1023, 0, 0, 0.96, 0.96)
        .fillRect(0, fadeTop, w, fadeEnd - fadeTop)
        .fillStyle(0x0d1023, 0.98)
        .fillRect(0, fadeEnd, w, artBottom + 2 - fadeEnd);
    }

    const fitScale = Math.min(w / ART_WIDTH, h / ART_HEIGHT);
    let buttonScale = fitScale;
    let groupTop = h * 0.52;
    if (portrait) {
      const mainVisibleWidth = BUTTON_DESIGN_WIDTH
        * (BUTTON_ALPHA_BOUNDS[0].right - BUTTON_ALPHA_BOUNDS[0].left) / BUTTON_SPRITE_WIDTH
        * BUTTON_HOVER_SCALE;
      const widthScale = w * MOBILE_BUTTON_WIDTH_RATIO / mainVisibleWidth;
      const areaTop = artBottom + Math.max(8, h * 0.012);
      const areaBottom = h - Math.max(68, h * 0.085);
      const availableHeight = Math.max(0, areaBottom - areaTop);
      let low = 0;
      let high = widthScale;
      for (let iteration = 0; iteration < 18; iteration += 1) {
        const candidate = (low + high) / 2;
        if (this.measureButtonStack(candidate, coarsePointer).height <= availableHeight) low = candidate;
        else high = candidate;
      }
      buttonScale = low;
      groupTop = areaTop;
    } else if (coarsePointer && w < 1000 && h < 600) {
      const metrics = this.measureButtonStack(buttonScale, true);
      groupTop = h * 0.48;
      const maxGroupHeight = h * 0.9 - groupTop;
      if (metrics.height > maxGroupHeight) buttonScale *= maxGroupHeight / metrics.height;
    }

    this.content.setPosition(0, 0).setScale(1);
    let previousVisibleBottom: number | undefined;
    let previousVisibleHeight = 0;
    let previousHitHeight = 0;
    BUTTON_ALPHA_BOUNDS.forEach((bounds, index) => {
      const button = index === 2 ? this.backButton : this.cards[index];
      const idleScale = buttonScale * BUTTON_IDLE_SCALES[index];
      const spritePixelScale = BUTTON_DESIGN_WIDTH / BUTTON_SPRITE_WIDTH * idleScale;
      const visibleHeight = (bounds.bottom - bounds.top) * spritePixelScale;
      const hitHeight = coarsePointer ? Math.max(visibleHeight, MOBILE_TOUCH_TARGET) : visibleHeight;
      const visibleTopOffset = (bounds.top - BUTTON_SPRITE_HEIGHT / 2) * spritePixelScale;
      const visibleBottomOffset = (bounds.bottom - BUTTON_SPRITE_HEIGHT / 2) * spritePixelScale;
      const visibleCenterXOffset = ((bounds.left + bounds.right) / 2 - BUTTON_SPRITE_WIDTH / 2) * spritePixelScale;
      const verticalGap = previousVisibleBottom === undefined
        ? 0
        : Math.max(
          BUTTON_VERTICAL_GAP * buttonScale,
          (previousHitHeight + hitHeight) / 2 + (coarsePointer ? MOBILE_TOUCH_GAP : 0)
            - (previousVisibleHeight + visibleHeight) / 2,
        );
      const visibleTop = previousVisibleBottom === undefined ? groupTop : previousVisibleBottom + verticalGap;
      const x = w / 2 - visibleCenterXOffset;
      const y = visibleTop - visibleTopOffset;
      button.setPosition(x, y);
      this.buttonBaseScales[index] = idleScale;
      this.tweens.killTweensOf(button);
      button.setScale(this.shouldEnlargeButton(index) ? idleScale * BUTTON_HOVER_SCALE : idleScale);
      button.setInteractive(
        new Phaser.Geom.Rectangle(-BUTTON_DESIGN_WIDTH / 2, -hitHeight / (2 * idleScale), BUTTON_DESIGN_WIDTH, hitHeight / idleScale),
        Phaser.Geom.Rectangle.Contains,
      );
      previousVisibleBottom = y + visibleBottomOffset;
      previousVisibleHeight = visibleHeight;
      previousHitHeight = hitHeight;
    });
  }

  select(index: number): void {
    if (this.transitioning || this.confirmationInProgress) return;
    this.selectedIndex = (index + OPTIONS.length) % OPTIONS.length;
    this.focusIndex = this.selectedIndex;
    this.cards.forEach((card, i) => card.setSelected(i === this.selectedIndex));
    this.updateButtonAppearance();
    const option = OPTIONS[this.selectedIndex];
    const difficulty = DIFFICULTIES[option.id];
    this.announce(`Dificuldade ${difficulty.label}. ${option.details}`);
  }

  focusAction(index: number): void {
    if (this.transitioning || this.confirmationInProgress) return;
    this.focusIndex = (index + ACTIONS.length) % ACTIONS.length;
    if (this.focusIndex < OPTIONS.length) {
      this.selectedIndex = this.focusIndex;
      const option = OPTIONS[this.selectedIndex];
      this.announce(`Dificuldade ${DIFFICULTIES[option.id].label}. ${option.details}`);
    }
    this.cards.forEach((card, i) => card.setSelected(i === this.focusIndex));
    this.backButton.setSelected(this.focusIndex === 2);
    this.updateButtonAppearance();
  }

  confirm(index: number): void {
    if (this.transitioning || this.confirmationInProgress) return;
    this.confirmationInProgress = true;
    this.selectedIndex = index;
    this.focusIndex = index;
    this.cards.forEach((card, i) => card.setSelected(i === index));
    this.updateButtonAppearance();
    this.game.championship.select({ difficultyId: OPTIONS[index].id });
    this.runConfirmationFlashes(index, SCENES.characters);
  }

  private createButton(label: string, index: number, onActivate: () => void): MenuButton {
    const button = new MenuButton(this, {
      label, index: String(index + 1).padStart(2, '0'), width: BUTTON_DESIGN_WIDTH, labelSize: 22,
      onSelect: () => {
        if (this.confirmationInProgress || this.transitioning) return;
        if (index < OPTIONS.length) this.select(index);
        else this.focusAction(index);
        this.hoveredIndex = index;
        this.updateButtonAppearance();
      },
      onActivate,
    });
    button.setBuiltInVisualsVisible(false);
    button.number.setVisible(false);
    button.label.setVisible(false);
    button.detail.setVisible(false);
    const numberArt = addMenuGlyphText(this, button, String(index + 1).padStart(2, '0'),
      -BUTTON_DESIGN_WIDTH * 0.385, 0, index === 0 ? 18 : 15);
    const labelArt = addMenuGlyphText(this, button, label, 0, 0, index === 0 ? 26 : 21);
    button.setInteractionArea(BUTTON_DESIGN_WIDTH, 64);
    const artwork = new MenuButtonArtwork(
      this,
      DIFFICULTY_BUTTON_STATES.idle,
      BUTTON_DESIGN_WIDTH,
      BUTTON_SPRITE_WIDTH,
      BUTTON_SPRITE_HEIGHT,
    );
    button.add(artwork);
    if (numberArt) button.bringToTop(numberArt);
    if (labelArt) button.bringToTop(labelArt);
    button.bringToTop(button.number).bringToTop(button.label).bringToTop(button.detail);
    button.on('pointerout', () => {
      if (this.confirmationInProgress || this.transitioning) return;
      if (this.hoveredIndex === index) this.hoveredIndex = null;
      this.updateButtonAppearance();
    });
    this.buttonArtwork[index] = artwork;
    return button;
  }

  private activateFocused(): void {
    if (this.focusIndex === 2) this.confirmBack();
    else this.confirm(this.focusIndex);
  }

  private confirmBack(): void {
    if (this.transitioning || this.confirmationInProgress) return;
    this.confirmationInProgress = true;
    this.focusIndex = 2;
    this.backButton.setSelected(true);
    this.updateButtonAppearance();
    this.runConfirmationFlashes(2, SCENES.menu);
  }

  private shouldEnlargeButton(index: number): boolean {
    return this.hoveredIndex === index || this.focusIndex === index;
  }

  private updateButtonAppearance(): void {
    [...this.cards, this.backButton].forEach((button, index) => {
      const selected = index === this.focusIndex;
      const hovered = index === this.hoveredIndex;
      const artwork = this.buttonArtwork[index];
      const enlarged = selected || hovered;
      const targetScale = this.buttonBaseScales[index] * (enlarged ? BUTTON_HOVER_SCALE : 1);
      this.tweens.killTweensOf(button);
      if (this.reducedMotion) button.setScale(targetScale);
      else this.tweens.add({ targets: button, scaleX: targetScale, scaleY: targetScale, duration: 140 });
      artwork.setTexture(enlarged ? DIFFICULTY_BUTTON_STATES.selected : DIFFICULTY_BUTTON_STATES.idle);
    });
  }

  private runConfirmationFlashes(
    index: number,
    destination: string,
    blink = 0,
    bright = true,
  ): void {
    const artwork = this.buttonArtwork[index];
    const button = index === 2 ? this.backButton : this.cards[index];
    if (!artwork) return;
    if (blink === 4 && bright) {
      button.setVisible(true);
      artwork.setTexture(DIFFICULTY_BUTTON_STATES.selected).setArtworkVisible(true);
      this.time.delayedCall(100, () => this.goTo(destination));
      return;
    }
    button.setVisible(bright);
    artwork
      .setTexture(bright ? DIFFICULTY_BUTTON_STATES.selected : DIFFICULTY_BUTTON_STATES.idle)
      .setArtworkVisible(bright);
    this.time.delayedCall(bright ? 85 : 70, () => {
      this.runConfirmationFlashes(index, destination, bright ? blink : blink + 1, !bright);
    });
  }

  private createMobileContinuationTexture(): void {
    const key = 'riffshot-mobile-continuation';
    if (this.textures.exists(key)) return;
    const source = this.textures.get('riffshot-difficulty-art').getSourceImage();
    if (!(source instanceof HTMLImageElement) && !(source instanceof HTMLCanvasElement)) return;
    const { x, y, size } = MOBILE_CONTINUATION_CROP;
    const texture = this.textures.createCanvas(key, size, size);
    if (!texture) return;
    texture.context.drawImage(source, x, y, size, size, 0, 0, size, size);
    texture.refresh();
  }

  private measureButtonStack(scale: number, coarsePointer: boolean): { height: number } {
    const heights = BUTTON_ALPHA_BOUNDS.map((bounds, index) =>
      (bounds.bottom - bounds.top) * BUTTON_DESIGN_WIDTH / BUTTON_SPRITE_WIDTH * scale * BUTTON_IDLE_SCALES[index]);
    const hitHeights = heights.map(height => coarsePointer ? Math.max(height, MOBILE_TOUCH_TARGET) : height);
    let height = heights[0] / 2 + heights[heights.length - 1] / 2;
    for (let index = 1; index < heights.length; index += 1) {
      const visualStep = (heights[index - 1] + heights[index]) / 2 + BUTTON_VERTICAL_GAP * scale;
      const touchStep = (hitHeights[index - 1] + hitHeights[index]) / 2
        + (coarsePointer ? MOBILE_TOUCH_GAP : 0);
      height += Math.max(visualStep, touchStep);
    }
    return { height };
  }
}
