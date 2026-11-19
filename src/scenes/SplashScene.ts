import Phaser from 'phaser';
import introArtwork from '../assets/ui/menus/splash-background.png';
import { TitleScene } from './TitleScene.ts';
import { IntroStartButton } from '../ui/IntroStartButton.ts';
import { SCENES } from '../ui/theme.ts';

const ARTWORK_WIDTH = 1672;
const ARTWORK_HEIGHT = 941;
const MOBILE_HERO_CROP = { x: 246, y: 0, width: 1180, height: 650 };
const MOBILE_TRACK_CROP = { x: 686, y: 650, width: 300, height: 291 };

export class SplashScene extends TitleScene {
  private artwork!: Phaser.GameObjects.Image;
  private mobileBackdrop!: Phaser.GameObjects.Graphics;
  private mobileHero!: Phaser.GameObjects.Image;
  private mobileTrack!: Phaser.GameObjects.Image;
  private startButton!: IntroStartButton;

  constructor() { super(SCENES.splash); }

  preload(): void {
    this.load.image('riffshot-intro-artwork', introArtwork);
  }

  create(): void {
    document.body.classList.add('intro-screen-active');
    this.createShell('RIFFSHOT RACING. Sinta a batida. Pise fundo. Abra fogo. Pressione Enter ou clique para iniciar.');

    this.backdrop.image.setVisible(false);
    this.backdrop.motion.setVisible(false);
    this.chrome.setVisible(false);
    this.brand.setVisible(false);
    this.edition.setVisible(false);
    this.system.setVisible(false);
    this.footerLeft.setVisible(false);
    this.footerRight.setVisible(false);
    this.toast.setVisible(false);
    this.saveNotice.setVisible(false);

    this.artwork = this.add.image(0, 0, 'riffshot-intro-artwork').setDepth(-5);
    this.mobileBackdrop = this.add.graphics().setDepth(-7).setVisible(false);
    this.mobileTrack = this.add.image(0, 0, 'riffshot-intro-artwork').setDepth(-5.5).setVisible(false);
    this.mobileHero = this.add.image(0, 0, 'riffshot-intro-artwork').setDepth(-5).setVisible(false);
    this.startButton = new IntroStartButton(this, this.reducedMotion, this.confirmStart);
    this.input.keyboard?.on('keydown-ENTER', this.onEnter, this);
    this.input.on('pointerdown', this.onScreenPointerDown, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.body.classList.remove('intro-screen-active');
      this.tweens.killTweensOf(this.artwork);
    });

    this.resizeShell();
  }

  private readonly onEnter = (event: KeyboardEvent): void => {
    event.stopPropagation();
    this.startButton?.activate();
  };

  private readonly onScreenPointerDown = (): void => {
    this.startButton?.activate();
  };

  private readonly confirmStart = (): void => {
    this.playConfirmationSound();
    this.time.delayedCall(1500, () => this.transitionToMainMenu());
  };

  private transitionToMainMenu(): void {
    if (this.transitioning) return;
    this.transitioning = true;

    const camera = this.cameras.main;
    const fadeDuration = this.reducedMotion ? 1 : 240;
    const fadeCompleteEvent = Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE;
    let fallback: Phaser.Time.TimerEvent | undefined;
    let navigationStarted = false;
    const startMenu = (): void => {
      if (navigationStarted) return;
      navigationStarted = true;
      fallback?.remove();
      camera.off(fadeCompleteEvent, startMenu);
      this.scene.start(SCENES.menu);
    };

    camera.once(fadeCompleteEvent, startMenu);
    camera.fadeOut(fadeDuration, 6, 9, 18);
    // A transição continua mesmo se a câmera não emitir o evento de conclusão.
    fallback = this.time.delayedCall(fadeDuration + 180, startMenu);
  }

  private playConfirmationSound(): void {
    const state = this.game.menuMusic?.getAudioState();
    if (!state || !state.available || state.muted || state.hidden || !state.focused || state.effectsVolume <= 0) return;
    const context = (this.game.sound as Phaser.Sound.BaseSoundManager & { context?: AudioContext }).context;
    if (!context || context.state === 'closed') return;

    // O primeiro Enter/clique também desbloqueia o áudio do navegador.
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
    }).catch(() => { /* O som de confirmação é opcional e nunca bloqueia a navegação. */ });
  }

  layout(w: number, h: number): void {
    if (!this.artwork) return;
    const portrait = h > w * 1.08;
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

    if (portrait) {
      const heroScale = w / MOBILE_HERO_CROP.width;
      const heroHeight = MOBILE_HERO_CROP.height * heroScale;
      const heroTop = Math.max(0, h * 0.012);
      const heroBottom = heroTop + heroHeight;
      const trackTop = heroBottom - 18;
      const trackBottom = h * 0.88;
      const trackScale = Math.max(
        w / MOBILE_TRACK_CROP.width,
        (trackBottom - trackTop) / MOBILE_TRACK_CROP.height,
      );

      this.artwork.setVisible(false);
      this.mobileBackdrop.setVisible(true).clear()
        .fillGradientStyle(0x110717, 0x18091d, 0x090b1b, 0x16091d, 1)
        .fillRect(0, 0, w, h);
      this.mobileTrack
        .setCrop(MOBILE_TRACK_CROP.x, MOBILE_TRACK_CROP.y, MOBILE_TRACK_CROP.width, MOBILE_TRACK_CROP.height)
        .setPosition(
          w / 2,
          trackTop + MOBILE_TRACK_CROP.height * trackScale / 2
            - (MOBILE_TRACK_CROP.y + MOBILE_TRACK_CROP.height / 2 - ARTWORK_HEIGHT / 2) * trackScale,
        )
        .setScale(trackScale)
        .setVisible(true);
      this.mobileHero
        .setCrop(MOBILE_HERO_CROP.x, MOBILE_HERO_CROP.y, MOBILE_HERO_CROP.width, MOBILE_HERO_CROP.height)
        .setPosition(
          w / 2,
          heroTop + heroHeight / 2
            - (MOBILE_HERO_CROP.y + MOBILE_HERO_CROP.height / 2 - ARTWORK_HEIGHT / 2) * heroScale,
        )
        .setScale(heroScale)
        .setVisible(true);

      const uiScale = Math.min(w / 360, h / 800, 1.15);
      const buttonWidth = Math.min(w * 0.94, 360 * uiScale);
      const buttonHeight = 46 * uiScale;
      const hitWidth = w * 0.98;
      const hitHeight = Math.min(82 * uiScale, h * 0.16);
      this.startButton?.setPrompt(coarsePointer ? 'TOQUE PARA INICIAR' : 'ENTER OU CLIQUE PARA INICIAR');
      this.startButton?.layout(w / 2, h * 0.9, buttonWidth, buttonHeight, uiScale, hitWidth, hitHeight);
      return;
    }

    this.artwork.setCrop().setVisible(true);
    this.mobileBackdrop.setVisible(false);
    this.mobileHero.setVisible(false);
    this.mobileTrack.setVisible(false).setCrop();
    this.startButton?.setPrompt(coarsePointer ? 'TOQUE PARA INICIAR' : 'ENTER OU CLIQUE PARA INICIAR');
    const scale = Math.max(w / ARTWORK_WIDTH, h / ARTWORK_HEIGHT);
    this.artwork.setPosition(w / 2, h / 2).setScale(scale);

    const buttonWidth = Math.min(520 * scale, w * 0.92);
    const buttonHeight = 46 * scale;
    const hitWidth = Math.min(620 * scale, w * 0.98);
    const hitHeight = Math.min(82 * scale, h * 0.16);
    this.startButton?.layout(w / 2, h * 0.913, buttonWidth, buttonHeight, scale, hitWidth, hitHeight);
  }
}
