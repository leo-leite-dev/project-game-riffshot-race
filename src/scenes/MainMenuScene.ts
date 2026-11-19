import { TitleScene } from './TitleScene.ts';
import menuArtwork from '../assets/ui/menus/main-menu-artwork.png';
import buttonGuide from '../assets/ui/menus/menu-button-sprite-sheet.png';
import { MenuButton } from '../ui/MenuButton.ts';
import { MenuButtonArtwork } from '../ui/MenuButtonArtwork.ts';
import { createMenuFrameTextures } from '../ui/extractMenuFrames.ts';
import { addMenuGlyphText } from '../ui/MenuGlyphText.ts';
import { SCENES } from '../ui/theme.ts';
import type Phaser from 'phaser';

const ART_WIDTH = 1672;
const ART_HEIGHT = 941;
const BUTTON_SPRITE_WIDTH = 1700;
const BUTTON_SPRITE_HEIGHT = 242;
const BUTTON_DESIGN_WIDTH = 540;
const BUTTON_GROUP_TOP = 0.52;
const BUTTON_VERTICAL_GAP = 7.5;
const MOBILE_ART_HEIGHT_RATIO = 0.38;
const MOBILE_ART_WIDTH_RATIO = 1.3;
const MOBILE_ART_VISIBLE_RATIO = 0.9;
const MOBILE_CONTINUATION_SIZE = 300;
const MOBILE_CONTINUATION_CROP = { x: 686, y: 480, size: MOBILE_CONTINUATION_SIZE };
const MOBILE_BUTTON_WIDTH_RATIO = 0.66;
const MOBILE_TOUCH_TARGET = 48;
const MOBILE_TOUCH_GAP = 6;
const BUTTON_IDLE_SCALES = [1, 0.95, 0.9] as const;
const BUTTON_HOVER_SCALE = 1.08;
const BUTTON_ALPHA_BOUNDS = [
  { left: 0, top: 0, right: BUTTON_SPRITE_WIDTH, bottom: BUTTON_SPRITE_HEIGHT },
  { left: 0, top: 0, right: BUTTON_SPRITE_WIDTH, bottom: BUTTON_SPRITE_HEIGHT },
  { left: 0, top: 0, right: BUTTON_SPRITE_WIDTH, bottom: BUTTON_SPRITE_HEIGHT },
] as const;
const PLAYER_BUTTON_STATES = {
  mounted: 'riffshot-original-main-frame-active',
  confirmation: 'riffshot-original-main-frame-active',
} as const;
const BUTTON_SPRITES = [
  { key: PLAYER_BUTTON_STATES.mounted, path: '' },
  { key: 'riffshot-original-main-frame-locked', path: '' },
  { key: 'riffshot-original-main-frame-locked', path: '' },
  { key: PLAYER_BUTTON_STATES.confirmation, path: '' },
] as const;

const MODES = [
  { label: 'SOLO', locked: false },
  { label: 'CO-OP', locked: true },
  { label: 'ONLINE', locked: true },
];

export class MainMenuScene extends TitleScene {
  declare selectedIndex: number;
  declare buttons: MenuButton[];
  private menuArtwork!: Phaser.GameObjects.Image;
  private mobileContinuation!: Phaser.GameObjects.Image;
  private menuComplement!: Phaser.GameObjects.Graphics;
  private mobileArtworkFade!: Phaser.GameObjects.Graphics;
  private playerButtonSprite!: Phaser.GameObjects.Image;
  private buttonSprites: Phaser.GameObjects.Image[] = [];
  private transitionRequested = false;
  private keyboardSelection = true;
  private hoveredButtonIndex: number | null = null;
  private buttonBaseScale = 1;
  private confirmationTimer: Phaser.Time.TimerEvent | undefined;
  constructor() { super(SCENES.menu); }

  preload(): void {
    this.load.image('riffshot-main-menu-art', menuArtwork);
    this.load.image('riffshot-menu-button-guide', buttonGuide);
  }

  create() {
    this.transitionRequested = false;
    this.keyboardSelection = true;
    this.hoveredButtonIndex = null;
    document.body.classList.add('main-menu-active');
    this.createShell('RIFFSHOT RACING. Menu principal. SOLO inicia ou continua o campeonato. CO-OP e ONLINE seguem bloqueados.');
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
    this.menuArtwork = this.add.image(0, 0, 'riffshot-main-menu-art').setDepth(-5);
    this.mobileArtworkFade = this.add.graphics().setDepth(-4);
    this.selectedIndex = 0;
    this.buttons = MODES.map((mode, index) => new MenuButton(this, {
      ...mode,
      index: String(index + 1).padStart(2, '0'),
      width: 630,
      labelSize: 22,
      onSelect: () => { this.select(index); this.setHover(index, true); },
      onActivate: () => this.activate(index),
    }));
    this.buttons.forEach((button, index) => {
      button.setBuiltInVisualsVisible(false);
      button.number.setVisible(false);
      button.label.setVisible(false);
      button.detail.setVisible(false);
      const glyphTexts: Phaser.GameObjects.Container[] = [];
      const numberArt = addMenuGlyphText(this, button, String(index + 1).padStart(2, '0'),
        -BUTTON_DESIGN_WIDTH * 0.385, 0, index === 0 ? 18 : 15);
      if (numberArt) glyphTexts.push(numberArt);
      const labelArt = addMenuGlyphText(this, button, MODES[index].label,
        0, 0, index === 0 ? 26 : 21);
      if (labelArt) glyphTexts.push(labelArt);
      button.lockIcon.setVisible(false);
      let lockArtwork: Phaser.GameObjects.Image | undefined;
      if (index > 0) {
        lockArtwork = this.add.image(BUTTON_DESIGN_WIDTH * 0.36, 0, 'riffshot-original-main-lock-icon')
          .setDisplaySize(22, 24);
        button.add(lockArtwork);
      }
      button.setInteractionArea(BUTTON_DESIGN_WIDTH, 64);
      const artwork = new MenuButtonArtwork(
        this, BUTTON_SPRITES[index].key, BUTTON_DESIGN_WIDTH, BUTTON_SPRITE_WIDTH, BUTTON_SPRITE_HEIGHT,
      );
      button.add(artwork);
      glyphTexts.forEach(glyphText => button.bringToTop(glyphText));
      if (lockArtwork) button.bringToTop(lockArtwork);
      button.bringToTop(button.number).bringToTop(button.label).bringToTop(button.detail);
      const sprite = artwork.sprite;
      this.buttonSprites[index] = sprite;
      if (index === 0) this.playerButtonSprite = sprite;
      button.on('pointerout', () => this.setHover(index, false));
      this.content.add(button);
    });
    this.buttons.forEach((button, index) => button.setSelected(index === 0));
    this.resizeShell();
    this.input.keyboard?.addCapture(['UP', 'DOWN', 'SPACE', 'TAB']);
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      // Mark this queued Phaser event consumed, including fast inputs in the
      // same frame, so it cannot be replayed or reach the following scene.
      event.stopPropagation();
      if (this.transitioning || this.transitionRequested || event.repeat) return;
      if (['ArrowUp', 'ArrowDown', 'Tab'].includes(event.key)) {
        event.preventDefault();
        this.select(this.selectedIndex + (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey) ? -1 : 1), true);
      }
      if (event.key === 'Enter' || event.code === 'Space') this.activate(this.selectedIndex);
    });
    this.events.once('shutdown', () => {
      document.body.classList.remove('main-menu-active');
      this.input.keyboard?.removeCapture(['UP', 'DOWN', 'SPACE', 'TAB']);
    });
  }

  select(index: number, fromKeyboard = false): void {
    if (this.transitioning || this.transitionRequested) return;
    this.keyboardSelection = fromKeyboard;
    this.selectedIndex = (index + MODES.length) % MODES.length;
    this.buttons.forEach((button, i) => button.setSelected(i === this.selectedIndex));
    this.buttons.forEach((_button, i) => this.updateButtonScale(i, this.shouldEnlargeButton(i), true));
  }

  activate(index: number): void {
    if (this.transitioning || this.transitionRequested) return;
    if (MODES[index].locked) {
      this.showSoon();
      this.toast.setText('BLOQUEADO, EM BREVE');
      this.announce('BLOQUEADO, EM BREVE');
      return;
    }
    this.transitionRequested = true;
    this.buttons.forEach(button => button.disableInteractive());
    this.updateButtonScale(0, true, false);
    this.confirmPlayerSelection();
    this.playConfirmationSound();
    const nextScene = this.game.championship.state.pendingResult ? SCENES.results
      : this.game.championship.hasSelections ? SCENES.preparation : SCENES.difficulty;
    this.runConfirmationFlashes(nextScene);
  }

  layout(w: number, h: number): void {
    if (!this.menuArtwork || !this.buttons) return;
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

    this.menuComplement.clear();
    this.menuComplement
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
    let groupTop = h * BUTTON_GROUP_TOP;

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
      if (metrics.height > maxGroupHeight) {
        buttonScale *= maxGroupHeight / metrics.height;
      }
    }

    this.buttonBaseScale = buttonScale;
    this.content.setPosition(0, 0).setScale(1);
    let previousVisibleBottom: number | undefined;
    let previousVisibleHeight = 0;
    let previousHitHeight = 0;
    BUTTON_ALPHA_BOUNDS.forEach((bounds, index) => {
      const button = this.buttons[index];
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
      button.setPosition(x, y).setScale(idleScale);
      const hitWidth = (bounds.right - bounds.left) * BUTTON_DESIGN_WIDTH / BUTTON_SPRITE_WIDTH;
      const localHitHeight = Math.max(
        (bounds.bottom - bounds.top) * BUTTON_DESIGN_WIDTH / BUTTON_SPRITE_WIDTH,
        coarsePointer ? MOBILE_TOUCH_TARGET / idleScale : 0,
      );
      button.setInteractionArea(hitWidth, localHitHeight);
      this.updateButtonScale(index, this.shouldEnlargeButton(index), false);
      previousVisibleBottom = y + visibleBottomOffset;
      previousVisibleHeight = visibleHeight;
      previousHitHeight = hitHeight;
    });
    this.buttonSprites.forEach(sprite => sprite.setDisplaySize(
      BUTTON_DESIGN_WIDTH,
      BUTTON_DESIGN_WIDTH * BUTTON_SPRITE_HEIGHT / BUTTON_SPRITE_WIDTH,
    ));
    this.toast.setPosition(w / 2, Math.min(h - 28, (previousVisibleBottom ?? h * 0.8) + 28));

  }

  private createMobileContinuationTexture(): void {
    const key = 'riffshot-mobile-continuation';
    if (this.textures.exists(key)) return;

    const source = this.textures.get('riffshot-main-menu-art').getSourceImage();
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

  private setHover(index: number, hovered: boolean): void {
    if (this.transitionRequested) return;
    const previousHover = this.hoveredButtonIndex;
    if (hovered) {
      this.hoveredButtonIndex = index;
      this.keyboardSelection = false;
    } else if (this.hoveredButtonIndex === index) {
      this.hoveredButtonIndex = null;
    }
    if (previousHover !== null && previousHover !== index) {
      this.updateButtonScale(previousHover, this.shouldEnlargeButton(previousHover), true);
    }
    this.updateButtonScale(index, this.shouldEnlargeButton(index), true);
  }

  private shouldEnlargeButton(index: number): boolean {
    return this.hoveredButtonIndex === index || (this.keyboardSelection && this.selectedIndex === index);
  }

  private updateButtonScale(index: number, enlarged: boolean, animate: boolean): void {
    const button = this.buttons[index];
    if (!button) return;
    this.tweens.killTweensOf(button);
    const scale = this.buttonBaseScale * BUTTON_IDLE_SCALES[index] * (enlarged ? BUTTON_HOVER_SCALE : 1);
    if (!animate || this.reducedMotion) {
      button.setScale(scale);
      return;
    }
    this.tweens.add({
      targets: button,
      scaleX: scale,
      scaleY: scale,
      duration: 180,
      ease: 'Sine.Out',
    });
  }

  private confirmPlayerSelection(): void {
    const button = this.buttons[0];
    const { scaleX, scaleY } = button;
    this.tweens.add({ targets: button, scaleX: scaleX * 0.94, scaleY: scaleY * 0.94,
      duration: 75, yoyo: true, ease: 'Back.Out' });
  }

  private runConfirmationFlashes(nextScene: string, blink = 0, bright = true): void {
    if (blink === 4 && bright) {
      this.playerButtonSprite.setTexture(PLAYER_BUTTON_STATES.mounted).setVisible(true);
      this.buttons[0].setVisible(true);
      this.confirmationTimer = this.time.delayedCall(100, () => this.goTo(nextScene));
      return;
    }
    this.buttons[0].setVisible(bright);
    this.playerButtonSprite
      .setTexture(bright ? PLAYER_BUTTON_STATES.confirmation : PLAYER_BUTTON_STATES.mounted)
      .setVisible(bright);
    this.confirmationTimer = this.time.delayedCall(bright ? 85 : 70, () => {
      this.runConfirmationFlashes(nextScene, bright ? blink : blink + 1, !bright);
    });
  }

  private playConfirmationSound(): void {
    const state = this.game.menuMusic?.getAudioState();
    if (!state || !state.available || state.muted || state.hidden || !state.focused || state.effectsVolume <= 0) return;
    const context = (this.game.sound as Phaser.Sound.BaseSoundManager & { context?: AudioContext }).context;
    if (!context || context.state === 'closed') return;
    void context.resume().then(() => {
      if (context.state !== 'running') return;
      const now = context.currentTime;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, state.effectsVolume * 0.12), now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);
      gain.connect(context.destination);
      const oscillator = context.createOscillator();
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(660, now);
      oscillator.frequency.exponentialRampToValueAtTime(990, now + 0.07);
      oscillator.connect(gain);
      oscillator.start(now);
      oscillator.stop(now + 0.2);
      oscillator.addEventListener('ended', () => { oscillator.disconnect(); gain.disconnect(); }, { once: true });
    }).catch(() => { /* Audio de confirmação é opcional e não bloqueia a navegação. */ });
  }
}
