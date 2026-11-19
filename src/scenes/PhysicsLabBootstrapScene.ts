import Phaser from 'phaser';
import { SCENES } from '../ui/theme.ts';

/** Ponto de entrada local do laboratório arcade; não é incluído na distribuição. */
export class PhysicsLabBootstrapScene extends Phaser.Scene {
  private returnToPreparation = false;

  constructor() { super({ key: 'PhysicsLabBootstrap' }); }

  init(data?: { returnToPreparation?: boolean }): void {
    this.returnToPreparation = data?.returnToPreparation === true;
  }

  create(): void {
    void import('./ArcadePhysicsLabScene.ts').then(({ ArcadePhysicsLabScene }) => {
      if (!this.sys.isActive()) return;
      if (!this.game.scene.keys.ArcadePhysicsLab) this.scene.add('ArcadePhysicsLab', ArcadePhysicsLabScene, false);
      this.scene.start('ArcadePhysicsLab', { returnToPreparation: this.returnToPreparation });
      this.scene.stop();
    }).catch(error => {
      if (this.returnToPreparation) {
        this.scene.stop('PhysicsLabBootstrap');
        this.scene.resume(SCENES.preparation);
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      const failure = document.createElement('pre');
      failure.textContent = `Falha ao abrir o laboratório arcade: ${message}`;
      Object.assign(failure.style, { position: 'fixed', inset: '12px', zIndex: '99999', color: '#ffd7d7',
        background: '#18090c', padding: '20px', whiteSpace: 'pre-wrap' });
      document.body.append(failure);
    });
  }
}
