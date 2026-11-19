import Phaser from 'phaser';

type ButtonAnimation = { glow: number; hover: number; arrowStep: number; press: number; flash: number };

/** Botão de início vetorial, independente da arte de fundo da intro. */
export class IntroStartButton extends Phaser.GameObjects.Container {
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly surface: Phaser.GameObjects.Graphics;
  private readonly arrows: Phaser.GameObjects.Graphics;
  private readonly flash: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly animation: ButtonAnimation = { glow: 0.35, hover: 0, arrowStep: 0, press: 0, flash: 0 };
  private readonly tweenManager: Phaser.Tweens.TweenManager;
  private readonly sceneEvents: Phaser.Events.EventEmitter;
  private readonly activeTweens = new Set<Phaser.Tweens.Tween>();
  private readonly reducedMotion: boolean;
  private readonly onActivate: () => void;
  private boxWidth = 0;
  private boxHeight = 0;
  private activated = false;
  private cleanedUp = false;
  private hoverTween: Phaser.Tweens.Tween | undefined;

  constructor(scene: Phaser.Scene, reducedMotion: boolean, onActivate: () => void) {
    super(scene, 0, 0);
    this.tweenManager = scene.tweens;
    this.sceneEvents = scene.events;
    this.reducedMotion = reducedMotion;
    this.onActivate = onActivate;

    this.glow = scene.add.graphics();
    this.surface = scene.add.graphics();
    this.arrows = scene.add.graphics();
    this.label = scene.add.text(0, 0, 'ENTER OU CLIQUE PARA INICIAR', {
      fontFamily: 'Courier New, monospace', fontSize: '17px', fontStyle: 'normal',
      color: '#fff5f5', letterSpacing: 2, align: 'center',
    }).setOrigin(0.5).setShadow(0, 1, '#100208', 3, true, true);
    this.flash = scene.add.graphics();
    this.add([this.glow, this.surface, this.arrows, this.label, this.flash]);
    scene.add.existing(this);
    this.setDepth(2);

    this.on('pointerover', this.onPointerOver, this);
    this.on('pointerout', this.onPointerOut, this);
    this.on('pointerdown', this.activate, this);
    this.sceneEvents.once(Phaser.Scenes.Events.SHUTDOWN, this.destroyTweens, this);

    if (!reducedMotion) {
      this.trackTween(this.tweenManager.add({
        targets: this.animation, glow: 0.72, duration: 1200, yoyo: true, repeat: -1,
        ease: 'Sine.InOut', onUpdate: () => this.redraw(),
      }));
      this.trackTween(this.tweenManager.add({
        targets: this.animation, arrowStep: 4, duration: 2200, repeat: -1, repeatDelay: 220,
        ease: 'Linear', onUpdate: () => this.drawArrows(),
      }));
    }
  }

  layout(x: number, y: number, width: number, height: number, scale: number,
    hitWidth: number, hitHeight: number): void {
    if (this.cleanedUp) return;
    this.setPosition(x, y);
    this.boxWidth = width;
    this.boxHeight = height;
    this.label.setFontSize(Math.max(11, Math.min(18 * scale, (width - 100 * scale) / 18)));
    this.label.setLetterSpacing(Math.max(0.5, 1.6 * scale));
    this.setInteractive(new Phaser.Geom.Rectangle(-hitWidth / 2, -hitHeight / 2, hitWidth, hitHeight), Phaser.Geom.Rectangle.Contains);
    this.redraw();
  }

  setPrompt(prompt: string): void {
    if (this.activated || this.cleanedUp || this.label.text === prompt) return;
    this.label.setText(prompt);
    this.redraw();
  }

  activate(): void {
    if (this.activated || this.cleanedUp) return;
    this.activated = true;
    this.disableInteractive();
    this.onActivate();
    if (this.reducedMotion) {
      this.animation.flash = 0;
      return;
    }

    this.trackTween(this.tweenManager.add({
      targets: this.animation, press: 0.06, duration: 90, yoyo: true, ease: 'Back.Out',
      onUpdate: () => this.redraw(),
    }));
    this.trackTween(this.tweenManager.add({
      targets: this.animation, flash: 1, duration: 100, yoyo: true, repeat: 1,
      hold: 60, ease: 'Sine.Out', onUpdate: () => this.drawFlash(),
    }));
  }

  private onPointerOver(): void {
    if (this.activated || this.cleanedUp || this.reducedMotion) return;
    this.stopTween(this.hoverTween);
    this.hoverTween = this.trackTween(this.tweenManager.add({
      targets: this.animation, hover: 1, duration: 180, ease: 'Sine.Out',
      onUpdate: () => this.redraw(),
    }));
  }

  private onPointerOut(): void {
    if (this.activated || this.cleanedUp || this.reducedMotion) return;
    this.stopTween(this.hoverTween);
    this.hoverTween = this.trackTween(this.tweenManager.add({
      targets: this.animation, hover: 0, duration: 240, ease: 'Sine.Out',
      onUpdate: () => this.redraw(),
    }));
  }

  private redraw(): void {
    if (!this.boxWidth || !this.boxHeight) return;
    const glow = Math.min(1, this.animation.glow + this.animation.hover * 0.24);
    this.setScale(1 - this.animation.press * 0.045);

    this.glow.clear();
    const underlineY = this.boxHeight * 0.36;
    this.glow.fillStyle(0xff1738, 0.12 + glow * 0.2);
    this.glow.fillRect(-this.boxWidth * 0.32, underlineY - 2, this.boxWidth * 0.64, 4);
    this.glow.lineStyle(1.5, 0xff334d, 0.38 + glow * 0.52);
    this.glow.lineBetween(-this.boxWidth * 0.3, underlineY, this.boxWidth * 0.3, underlineY);

    this.surface.clear();
    const backingWidth = this.label.width + 44 * (this.boxHeight / 46);
    const backingHeight = this.label.height + 6 * (this.boxHeight / 46);
    const backingLeft = -backingWidth / 2;
    const backingTop = -backingHeight / 2;
    const midAlpha = 0.13 + glow * 0.035;
    this.surface.fillGradientStyle(0x050307, 0x050307, 0x050307, 0x050307,
      0.01, midAlpha, 0.01, midAlpha);
    this.surface.fillRect(backingLeft, backingTop, backingWidth / 2, backingHeight);
    this.surface.fillGradientStyle(0x050307, 0x050307, 0x050307, 0x050307,
      midAlpha, 0.01, midAlpha, 0.01);
    this.surface.fillRect(0, backingTop, backingWidth / 2, backingHeight);

    this.surface.lineStyle(1, 0xd8dbe2, 0.52 + glow * 0.18);
    this.surface.lineBetween(-this.boxWidth * 0.39, 0, -this.boxWidth * 0.36, 0);
    this.surface.lineBetween(this.boxWidth * 0.36, 0, this.boxWidth * 0.39, 0);
    this.surface.lineStyle(1, 0xff354f, 0.55 + glow * 0.35);
    this.surface.lineBetween(-this.boxWidth * 0.31, underlineY + 3, -this.boxWidth * 0.27, underlineY + 3);
    this.surface.lineBetween(this.boxWidth * 0.27, underlineY + 3, this.boxWidth * 0.31, underlineY + 3);

    this.label.setPosition(0, 0);
    this.drawArrows();
    this.drawFlash();
  }

  private drawArrows(): void {
    this.arrows.clear();
    if (!this.boxWidth || !this.boxHeight) return;
    const step = Math.floor(this.animation.arrowStep);
    const count = this.reducedMotion ? 3 : step === 0 || step >= 4 ? 1 : Math.min(step, 3);
    const arrowGap = Math.min(15, this.boxHeight * 0.28);
    const groupOffset = this.boxWidth / 2 - 54;
    const arrowSize = Math.min(8.6, this.boxHeight * 0.19);
    const strokeScale = this.boxHeight / 46;
    for (const side of [-1, 1]) {
      const center = side * groupOffset;
      for (let index = 0; index < count; index += 1) {
        // Acende a partir das pontas externas e avança em direção ao texto.
        const position = side < 0 ? index : 2 - index;
        const x = center + (position - 1) * arrowGap;
        const direction = side < 0 ? 1 : -1;
        const alpha = this.reducedMotion || step >= 3 ? 0.92 : step === 0 ? 0.24 : 0.92;
        const y = 0;
        this.arrows.lineStyle(9 * strokeScale, 0xff1744, alpha * 0.18);
        this.arrows.beginPath();
        this.arrows.moveTo(x - direction * arrowSize, y - arrowSize * 1.35);
        this.arrows.lineTo(x + direction * arrowSize, y);
        this.arrows.lineTo(x - direction * arrowSize, y + arrowSize * 1.35);
        this.arrows.strokePath();
        this.arrows.lineStyle(5 * strokeScale, 0xff3159, alpha * 0.7);
        this.arrows.beginPath();
        this.arrows.moveTo(x - direction * arrowSize, y - arrowSize * 1.35);
        this.arrows.lineTo(x + direction * arrowSize, y);
        this.arrows.lineTo(x - direction * arrowSize, y + arrowSize * 1.35);
        this.arrows.strokePath();
        this.arrows.lineStyle(2.5 * strokeScale, 0xffd7e3, alpha);
        this.arrows.beginPath();
        this.arrows.moveTo(x - direction * arrowSize, y - arrowSize * 1.35);
        this.arrows.lineTo(x + direction * arrowSize, y);
        this.arrows.lineTo(x - direction * arrowSize, y + arrowSize * 1.35);
        this.arrows.strokePath();
      }
    }
  }

  private drawFlash(): void {
    this.flash.clear();
    if (this.animation.flash <= 0 || !this.boxWidth || !this.boxHeight) return;
    this.flash.fillStyle(0xff5469, this.animation.flash * 0.5);
    this.flash.fillRect(-this.boxWidth * 0.29, this.boxHeight * 0.32, this.boxWidth * 0.58, 3);
    this.flash.lineStyle(2, 0xffd5da, this.animation.flash * 0.9);
    this.flash.lineBetween(-this.boxWidth * 0.27, this.boxHeight * 0.36,
      this.boxWidth * 0.27, this.boxHeight * 0.36);
  }

  private destroyTweens(): void {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    this.sceneEvents.off(Phaser.Scenes.Events.SHUTDOWN, this.destroyTweens, this);
    for (const tween of [...this.activeTweens]) this.stopTween(tween);
    this.activeTweens.clear();
    this.hoverTween = undefined;
    this.removeAllListeners();
  }

  private trackTween(tween: Phaser.Tweens.Tween): Phaser.Tweens.Tween {
    this.activeTweens.add(tween);
    return tween;
  }

  private stopTween(tween: Phaser.Tweens.Tween | undefined): void {
    if (!tween) return;
    try {
      if (!tween.isDestroyed()) {
        tween.stop();
        tween.remove();
      }
    } catch { /* Scene e TweenManager podem já estar em teardown. */ }
    this.activeTweens.delete(tween);
  }

  override destroy(fromScene?: boolean): void {
    this.destroyTweens();
    super.destroy(fromScene);
  }
}
