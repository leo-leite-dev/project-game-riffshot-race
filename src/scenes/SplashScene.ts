import Phaser from 'phaser';
import { TitleScene } from './TitleScene.ts';
import { createLogo } from '../visuals/logo.ts';
import { COLORS, SCENES, text } from '../ui/theme.ts';

export class SplashScene extends TitleScene {
  declare kicker: Phaser.GameObjects.Text;
  declare logo: Phaser.GameObjects.Image;
  declare tagline: Phaser.GameObjects.Text;
  declare progress: Phaser.GameObjects.Graphics;
  declare hint: Phaser.GameObjects.Text;
  declare loadProgress: { value: number };
  declare finishTimer: Phaser.Time.TimerEvent;
  constructor() { super(SCENES.splash); }

  create() {
    this.createShell('RIFFSHOT RACING. Sinta a batida. Pise fundo. Abra fogo. Pressione Enter ou toque para pular.');
    this.kicker = text(this, 0, -168, 'HARD ROCK  /  ORBITAL MOTORSPORT', 13, '#92a8bf');
    this.logo = createLogo(this, 0, -20, 660);
    this.tagline = text(this, 0, 132, 'SINTA A BATIDA. PISE FUNDO. ABRA FOGO.', 15, COLORS.white, true);
    this.progress = this.add.graphics();
    this.hint = text(this, 0, 220, 'ENTER OU CLIQUE PARA PULAR', 11, COLORS.muted);
    this.content.add([this.kicker, this.logo, this.tagline, this.progress, this.hint]);
    this.resizeShell();

    this.logo.setAlpha(this.reducedMotion ? 1 : 0);
    this.tweens.add({ targets: this.logo, alpha: 1, duration: this.reducedMotion ? 1 : 650, ease: 'Sine.Out' });
    this.loadProgress = { value: 0 };
    this.tweens.add({
      targets: this.loadProgress, value: 1, duration: 2200,
      onUpdate: () => {
        this.progress.clear().fillStyle(0x273449).fillRect(-100, 183, 200, 2);
        this.progress.fillStyle(COLORS.cyan).fillRect(-100, 183, 200 * this.loadProgress.value, 2);
      },
    });
    this.finishTimer = this.time.delayedCall(2500, () => this.skip());
    this.input.keyboard?.on('keydown-ENTER', (event: KeyboardEvent) => {
      event.stopPropagation();
      this.skip();
    });
    this.input.on('pointerdown', this.skip, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.finishTimer.remove());
  }

  skip(): void {
    this.finishTimer?.remove();
    this.goTo(SCENES.menu);
  }

  layout(w: number, h: number): void {
    this.fitContent(w, h, 690, 490);
  }
}
