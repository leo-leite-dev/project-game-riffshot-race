import { TitleScene } from './TitleScene.js';
import { COLORS, text } from '../ui/theme.js';

// Offscreen preview bridge for garage/preparation. Presentation hooks let the
// race borrow the renderer's canvas directly, keeping one Phaser-owned loop.
export class GarageScene extends TitleScene {
  createGarageShell(announcement) {
    this.createShell(announcement);
    this.garageView = null;
    this.preview = null;
    this.presentationCopies = 0;
    this.lastPreviewTime = null;
    this.alive = true;
    this.loadFailed = false;
    this.loadVersion = (this.loadVersion ?? 0) + 1;
    this.loadingLabel = text(this, 0, 0, 'INICIALIZANDO OFICINA  /  CARREGANDO 3D…', 12, COLORS.muted);
    this.content.add(this.loadingLabel);
    const cleanup = () => {
      this.events.off('shutdown', cleanup);
      this.events.off('destroy', cleanup);
      if (!this.alive) return;
      this.alive = false;
      this.loadVersion += 1;
      this.garageView?.destroy();
      this.garageView = null;
      this.preview?.destroy();
      this.preview = null;
      if (this.previewKey && this.textures.exists(this.previewKey)) this.textures.remove(this.previewKey);
      this.previewTexture = null;
    };
    this.events.once('shutdown', cleanup);
    this.events.once('destroy', cleanup);
  }

  async mountGarage(options) {
    const version = this.loadVersion;
    try {
      const { getGarageResources } = await import('../visuals/garage/GarageResources.js');
      if (!this.alive || version !== this.loadVersion) return;
      const resources = getGarageResources(this.game);
      await resources.load();
      if (!this.alive || version !== this.loadVersion) return;
      const world = await this.createGarageWorld(resources, options, version);
      if (!world) return;
      if (!this.alive || version !== this.loadVersion) { world.destroy(); return; }
      this.garageView = world;
      this.mountPresentation();
      this.loadingLabel.setText(options.mode === 'race'
        ? `●  PISTA ONLINE  /  ${options.track.name}`
        : resources.source === 'original'
          ? '●  OFICINA ONLINE  /  VEÍCULO ORIGINAL'
          : '●  OFICINA ONLINE  /  AIR BLADE LOCAL');
      this.onGarageReady?.();
    } catch (_error) {
      if (!this.alive || version !== this.loadVersion) return;
      this.garageView?.destroy();
      this.garageView = null;
      this.loadFailed = true;
      this.showGarageError();
      this.onGarageError?.();
      this.announce('Não foi possível carregar a oficina 3D. Verifique WebGL e o arquivo GLB local. Escape volta.');
    }
  }

  async createGarageWorld(resources, options, version = this.loadVersion) {
    const { GarageWorld } = await import('../visuals/garage/GarageWorld.js');
    if (!this.alive || version !== this.loadVersion || resources.disposed) return null;
    return new GarageWorld(resources, { ...options, reducedMotion: this.reducedMotion });
  }

  mountPresentation() {
    this.previewKey = `${this.scene.key}-garage-preview`;
    this.previewTexture = this.textures.createCanvas(this.previewKey, 2, 2);
    this.preview = this.add.image(0, 0, this.previewKey);
    this.content.addAt(this.preview, 0);
    this.applyPreviewBounds();
  }

  setPreviewBounds(x, y, width, height) {
    this.previewBounds = { x, y, width, height };
    this.applyPreviewBounds();
  }

  showGarageError() {
    const { x = 0, y = 0, width = 500 } = this.previewBounds ?? {};
    this.loadingLabel.setText('3D INDISPONÍVEL\nVerifique WebGL e o arquivo GLB local.\nESC para voltar.')
      .setColor('#ff9c91').setVisible(true).setOrigin(0.5).setPosition(x, y).setFontSize(16)
      .setWordWrapWidth(width - 24);
    this.content.bringToTop(this.loadingLabel);
  }

  resizeShell(gameSize) {
    super.resizeShell(gameSize);
    if (this.loadFailed) this.showGarageError();
  }

  applyPreviewBounds() {
    if (!this.preview || !this.previewBounds || !this.garageView) return;
    const { x, y, width, height } = this.previewBounds;
    this.preview.setPosition(x, y).setDisplaySize(width, height);
    const scale = this.content.scaleX;
    this.garageView.resize(Math.max(2, width * scale), Math.max(2, height * scale));
    this.previewTexture.setSize(this.garageView.width, this.garageView.height);
    // A resized CanvasTexture changes its frame, but an Image keeps its old
    // display origin until its frame is reapplied (otherwise the preview drifts).
    this.preview.setTexture(this.previewKey).setDisplaySize(width, height);
  }

  update(time, delta) {
    super.update(time, delta);
    if (!this.garageView) return;
    // Phaser smooths its UI delta on slow frames. Use its monotonic clock for
    // presentation timing, without adding another requestAnimationFrame loop.
    const elapsed = this.lastPreviewTime === null ? delta : time - this.lastPreviewTime;
    this.lastPreviewTime = time;
    this.renderPresentation(elapsed);
  }

  renderPresentation(elapsed) {
    if (!this.previewTexture) return;
    if (this.garageView.update(elapsed)) {
      this.previewTexture.context.drawImage(this.garageView.resources.renderer.domElement, 0, 0);
      this.previewTexture.refresh();
      this.presentationCopies += 1;
    }
  }
}
