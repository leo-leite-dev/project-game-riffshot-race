import Phaser from 'phaser';

/** Development-only lazy entry point; the normal game never imports Rapier here. */
export class PhysicsLabBootstrapScene extends Phaser.Scene {
  constructor() { super({ key: 'PhysicsLabBootstrap' }); }

  create(): void {
    void import('./PhysicsLabScene.ts').then(({ PhysicsLabScene }) => {
      if (!this.sys.isActive()) return;
      this.scene.add('PhysicsLab3D', PhysicsLabScene, true);
      this.scene.stop();
    }).catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      const failure = document.createElement('pre');
      failure.textContent = `Falha ao abrir o protótipo Rapier: ${message}`;
      Object.assign(failure.style, { position: 'fixed', inset: '12px', zIndex: '99999', color: '#ffd7d7',
        background: '#18090c', padding: '20px', whiteSpace: 'pre-wrap' });
      document.body.append(failure);
    });
  }
}
