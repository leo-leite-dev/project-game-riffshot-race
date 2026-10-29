import { TitleScene } from './TitleScene.ts';
import { COLORS, text } from '../ui/theme.ts';

import type Phaser from 'phaser';
import type { Championship } from '../championship/Championship.ts';
import type { GarageResources } from '../visuals/garage/GarageResources.ts';
import type { GarageWorld } from '../visuals/garage/GarageWorld.ts';
import type { RaceBackdrop } from '../visuals/RaceBackdrop.ts';

type GarageView = Pick<GarageWorld, 'resources' | 'width' | 'height' | 'update' | 'resize' | 'destroy'>;
export type GarageOptions = {
  mode: 'selection' | 'preparation' | 'race';
  vehicleId?: string;
  vehicleIds?: readonly string[];
  paintId?: string;
  participants?: readonly { vehicleId: string }[];
  track?: { name: string };
  cameraMode?: 'isometric' | 'chase';
  diagnostics?: boolean;
  stationAccent?: 'player' | 'rival';
};

// Offscreen preview bridge for garage/preparation. Presentation hooks let the
// race borrow the renderer's canvas directly, keeping one Phaser-owned loop.
export class GarageScene extends TitleScene {
  declare game: Phaser.Game & { championship: Championship };
  declare content: Phaser.GameObjects.Container;
  declare loadingLabel: Phaser.GameObjects.Text;
  declare garageView: GarageView | null;
  declare preview: Phaser.GameObjects.Image | null;
  declare previewTexture: Phaser.Textures.CanvasTexture | null;
  declare previewKey: string;
  declare previewBounds: { x: number; y: number; width: number; height: number } | undefined;
  declare presentationCopies: number;
  declare lastPreviewTime: number | null;
  declare alive: boolean;
  declare loadFailed: boolean;
  declare loadVersion: number;
  declare reducedMotion: boolean;
  declare transitioning: boolean;
  declare backdrop: RaceBackdrop;
  declare toast: Phaser.GameObjects.Text;
  declare toastTimer: Phaser.Time.TimerEvent | undefined;

  createGarageShell(announcement: string): void {
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

  async mountGarage(options: GarageOptions): Promise<void> {
    const version = this.loadVersion;
    try {
      const { getGarageResources } = await import('../visuals/garage/GarageResources.ts');
      if (!this.alive || version !== this.loadVersion) return;
      const resources = getGarageResources(this.game);
      const vehicleIds = options.mode === 'race' ? options.participants!.map(car => car.vehicleId)
        : options.vehicleIds ?? (options.vehicleId ? [options.vehicleId] : undefined);
      await resources.load(vehicleIds);
      if (!this.alive || version !== this.loadVersion) return;
      const world = await this.createGarageWorld(resources, options, version);
      if (!world) return;
      if (!this.alive || version !== this.loadVersion) { world.destroy(); return; }
      this.garageView = world;
      this.mountPresentation();
      this.loadingLabel.setText(options.mode === 'race'
         ? `●  PISTA ONLINE  /  ${options.track!.name}`
        : resources.experimentalStatus === 'ready'
          ? '●  OFICINA ONLINE  /  RIFT BLAZE EXPERIMENTAL — TIYAMAKES, CC BY 4.0'
          : resources.experimentalStatus === 'fallback'
            ? '●  OFICINA ONLINE  /  GLB LOCAL INDISPONÍVEL — PROCEDURAL ATIVO'
            : resources.modelFailures.length
              ? '●  OFICINA ONLINE  /  ALGUNS MODELOS INDISPONÍVEIS — VISUAL RESERVA'
              : '●  OFICINA ONLINE  /  MODELOS 3D CARREGADOS');
      this.onGarageReady();
    } catch (_error) {
      if (!this.alive || version !== this.loadVersion) return;
      this.garageView?.destroy();
      this.garageView = null;
      this.loadFailed = true;
      this.showGarageError();
      this.onGarageError();
      this.announce('Não foi possível carregar a oficina 3D. Verifique se o navegador oferece WebGL. Escape volta.');
    }
  }

  async createGarageWorld(resources: GarageResources, options: GarageOptions, version = this.loadVersion): Promise<GarageView | null> {
    const { GarageWorld } = await import('../visuals/garage/GarageWorld.ts');
    if (!this.alive || version !== this.loadVersion || resources.disposed) return null;
    return new GarageWorld(resources, { ...options, mode: options.mode === 'race' ? 'selection' : options.mode, reducedMotion: this.reducedMotion });
  }

  mountPresentation() {
    this.previewKey = `${this.scene.key}-garage-preview`;
    this.previewTexture = this.textures.createCanvas(this.previewKey, 2, 2);
    this.preview = this.add.image(0, 0, this.previewKey);
    this.content.addAt(this.preview, 0);
    this.applyPreviewBounds();
  }

  setPreviewBounds(x: number, y: number, width: number, height: number): void {
    this.previewBounds = { x, y, width, height };
    this.applyPreviewBounds();
  }

  showGarageError() {
    const { x = 0, y = 0, width = 500 } = this.previewBounds ?? {};
    this.loadingLabel.setText('3D INDISPONÍVEL\nVerifique se o navegador oferece WebGL.\nESC para voltar.')
      .setColor('#ff9c91').setVisible(true).setOrigin(0.5).setPosition(x, y).setFontSize(16)
      .setWordWrapWidth(width - 24);
    this.content.bringToTop(this.loadingLabel);
  }

  resizeShell(gameSize: Phaser.Structs.Size = this.scale.gameSize): void {
    super.resizeShell(gameSize);
    if (this.loadFailed) this.showGarageError();
  }

  applyPreviewBounds() {
    if (!this.preview || !this.previewBounds || !this.garageView) return;
    const { x, y, width, height } = this.previewBounds;
    this.preview!.setPosition(x, y).setDisplaySize(width, height);
    const scale = this.content.scaleX;
    this.garageView.resize(Math.max(2, width * scale), Math.max(2, height * scale));
    this.previewTexture!.setSize(this.garageView.width, this.garageView.height);
    // A resized CanvasTexture changes its frame, but an Image keeps its old
    // display origin until its frame is reapplied (otherwise the preview drifts).
    this.preview!.setTexture(this.previewKey).setDisplaySize(width, height);
  }

  update(time: number, delta: number): void {
    super.update(time, delta);
    if (!this.garageView) return;
    // Phaser smooths its UI delta on slow frames. Use its monotonic clock for
    // presentation timing, without adding another requestAnimationFrame loop.
    const elapsed = this.lastPreviewTime === null ? delta : time - this.lastPreviewTime;
    this.lastPreviewTime = time;
    this.renderPresentation(elapsed);
  }

  renderPresentation(elapsed: number): void {
    if (!this.previewTexture) return;
    const view = this.garageView;
    if (view && view.update(elapsed)) {
      this.previewTexture!.context.drawImage(view.resources.renderer.domElement, 0, 0);
      this.previewTexture!.refresh();
      this.presentationCopies += 1;
    }
  }

  onGarageReady(): void {}

  onGarageError(): void {}
}
