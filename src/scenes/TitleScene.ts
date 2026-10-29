import Phaser from 'phaser';
import { RaceBackdrop } from '../visuals/RaceBackdrop.ts';
import { COLORS, text } from '../ui/theme.ts';
import type { Championship } from '../championship/Championship.ts';
import '../phaser-extensions.ts';

// Shared presentation and lifecycle only; each scene owns its navigation rules.
export class TitleScene extends Phaser.Scene {
  declare game: Phaser.Game & { championship: Championship };
  declare lastAnnouncement: string;
  declare transitioning: boolean;
  declare reducedMotion: boolean;
  declare backdrop: RaceBackdrop;
  declare content: Phaser.GameObjects.Container;
  declare chrome: Phaser.GameObjects.Graphics;
  declare brand: Phaser.GameObjects.Text;
  declare edition: Phaser.GameObjects.Text;
  declare system: Phaser.GameObjects.Text;
  declare footerLeft: Phaser.GameObjects.Text;
  declare footerRight: Phaser.GameObjects.Text;
  declare toast: Phaser.GameObjects.Text;
  declare saveNotice: Phaser.GameObjects.Text;
  declare updateSaveNotice: () => void;
  declare toastTimer: Phaser.Time.TimerEvent | undefined;

  createShell(announcement: string): void {
    this.lastAnnouncement = announcement;
    this.transitioning = false;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.backdrop = new RaceBackdrop(this);
    this.content = this.add.container(0, 0);
    this.chrome = this.add.graphics().setDepth(5);
    this.brand = text(this, 0, 0, 'RIFFSHOT', 16, COLORS.white, true).setOrigin(0, 0.5);
    this.edition = text(this, 0, 0, 'HEAVY METAL / ORBITAL MOTORSPORT', 10, COLORS.muted).setOrigin(0, 0.5);
    this.system = text(this, 0, 0, '●  SISTEMA PRONTO', 10, '#71f6ff').setOrigin(1, 0.5);
    this.footerLeft = text(this, 0, 0, 'SINTA A BATIDA. PISE FUNDO. ABRA FOGO.', 10, COLORS.muted);
    this.footerRight = text(this, 0, 0, 'PROTO // 0.2', 10, COLORS.muted).setOrigin(1, 0.5);
    this.toast = text(this, 0, 0, '', 16, '#a8f9ff').setDepth(10).setAlpha(0);
    this.saveNotice = text(this, 0, 0, '', 12, '#ffbf75').setDepth(20)
      .setStyle({ backgroundColor: '#080f1d', wordWrap: { width: 600 } });
    this.updateSaveNotice = () => {
      const warning = this.game.championship?.warning;
      this.saveNotice.setText(warning ? `PROGRESSO TEMPORÁRIO / NÃO SALVO\n${warning}` : '').setVisible(!!warning);
      if (warning) this.system.setText('●  SAVE INDISPONÍVEL').setColor('#ffbf75');
      else this.system.setText('●  SISTEMA PRONTO').setColor('#71f6ff');
      this.announce(this.lastAnnouncement);
    };
    this.game.events.on('championship-warning', this.updateSaveNotice);
    this.updateSaveNotice();
    this.announce(announcement);

    this.scale.on('resize', this.resizeShell, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.resizeShell, this);
      this.game.events.off('championship-warning', this.updateSaveNotice);
      this.input.keyboard?.removeAllListeners();
      this.input.removeAllListeners();
      this.backdrop.destroy();
      this.toastTimer?.remove();
    });
    this.cameras.main.fadeIn(this.reducedMotion ? 1 : 300, 6, 9, 18);
  }

  resizeShell(gameSize: Phaser.Structs.Size = this.scale.gameSize): void {
    const { width: w, height: h } = gameSize;
    this.backdrop.resize(w, h);
    const pad = w < 600 ? 20 : 38;
    this.brand.setPosition(pad, 30);
    this.edition.setPosition(pad + 96, 30).setVisible(w > 700);
    this.system.setPosition(w - pad, 30);
    this.footerLeft.setPosition(w / 2, h - 26).setVisible(w > 900);
    this.footerRight.setPosition(w - pad, h - 26);
    this.toast.setPosition(w / 2, h - 62);
    this.saveNotice.setPosition(w / 2, h - 86).setWordWrapWidth(Math.min(700, w - 36));
    this.chrome.clear().lineStyle(1, COLORS.cyan, 0.14);
    this.chrome.lineBetween(pad, 53, w - pad, 53);
    this.chrome.lineBetween(pad, h - 48, w - pad, h - 48);
    this.chrome.lineStyle(2, COLORS.cyan, 0.7);
    this.chrome.lineBetween(pad, 53, pad + 30, 53);
    this.chrome.lineStyle(2, COLORS.pink, 0.7);
    this.chrome.lineBetween(w - pad - 30, h - 48, w - pad, h - 48);
    this.layout(w, h);
  }

  fitContent(w: number, h: number, designWidth = 600, designHeight = 650): void {
    this.content.setPosition(w / 2, h / 2 - 6);
    this.content.setScale(Math.min((w - 32) / designWidth, (h - 120) / designHeight, 1.05));
  }

  announce(message: string): void {
    this.lastAnnouncement = message;
    const warning = this.game.championship?.warning;
    const status = document.getElementById('screen-status');
    if (status) status.textContent = warning
      ? `${message} Atenção: progresso temporário, não salvo. ${warning}` : message;
  }

  showSoon() {
    if (this.transitioning) return;
    this.announce('Em breve');
    this.toastTimer?.remove();
    this.tweens.killTweensOf(this.toast);
    this.toast.setText('◇  Em breve').setAlpha(1);
    this.toastTimer = this.time.delayedCall(1600, () => {
      this.tweens.add({ targets: this.toast, alpha: 0, duration: this.reducedMotion ? 1 : 240 });
    });
  }

  goTo(key: string): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(key));
    this.cameras.main.fadeOut(this.reducedMotion ? 1 : 240, 6, 9, 18);
  }

  layout(_w: number, _h: number): void {}

  update(_time: number, delta: number): void {
    if (!this.reducedMotion && this.backdrop.motion.visible) this.backdrop.update(delta);
  }
}
