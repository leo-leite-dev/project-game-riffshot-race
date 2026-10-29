import type Phaser from 'phaser';
import type * as THREE from 'three';

export const RACE_RENDER_LIMITS = Object.freeze({ width: 1280, height: 720, pixelRatio: 1.25 });

type RaceLayerScene = {
  garageView: {
    resources: { renderer: THREE.WebGLRenderer };
    resize: (width: number, height: number, limits: typeof RACE_RENDER_LIMITS) => void;
  };
  game: { canvas: HTMLCanvasElement; renderer: { gl?: WebGLRenderingContext | WebGL2RenderingContext } };
  cameras: { main: Phaser.Cameras.Scene2D.Camera };
  backdrop: { image: Phaser.GameObjects.Image; motion: Phaser.GameObjects.Graphics };
  alive: boolean;
};

// Only composition: no timing, input or simulation. The shared Three canvas is
// borrowed for one race and returned offscreen before the garage is resumed.
export class RaceCanvasLayer {
  declare scene: RaceLayerScene;
  declare canvas: HTMLCanvasElement;
  declare parent: HTMLElement | null;
  declare oldCameraColor: string;
  declare active: boolean;
  declare destroyed: boolean;
  declare supported: boolean;

  constructor(scene: RaceLayerScene) {
    this.scene = scene;
    this.canvas = scene.garageView.resources.renderer.domElement;
    this.parent = scene.game.canvas.parentElement;
    this.oldCameraColor = scene.cameras.main.backgroundColor.rgba;
    this.active = false;
    this.destroyed = false;
    const context = scene.game.renderer.gl;
    this.supported = !!this.parent && (!context || context.getContextAttributes()?.alpha === true);
  }

  mount() {
    if (!this.supported) return false;
    try {
      this.canvas.classList.add('race-three-canvas');
      this.canvas.setAttribute('aria-hidden', 'true');
      this.parent!.classList.add('race-layered');
      this.parent!.insertBefore(this.canvas, this.scene.game.canvas);
      this.scene.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
      this.scene.backdrop.image.setVisible(false);
      this.scene.backdrop.motion.setVisible(false);
      this.active = true;
      this.resize();
      return true;
    } catch (_error) {
      this.restore();
      return false;
    }
  }

  resize() {
    if (!this.active) return;
    const rect = this.scene.game.canvas.getBoundingClientRect();
    const parentRect = this.parent!.getBoundingClientRect();
    Object.assign(this.canvas.style, {
      left: `${rect.left - parentRect.left}px`, top: `${rect.top - parentRect.top}px`,
      width: `${rect.width}px`, height: `${rect.height}px`,
    });
    const dpr = Math.min(window.devicePixelRatio || 1, RACE_RENDER_LIMITS.pixelRatio);
    this.scene.garageView.resize(rect.width * dpr, rect.height * dpr, RACE_RENDER_LIMITS);
  }

  restore() {
    this.canvas.remove();
    this.canvas.classList.remove('race-three-canvas');
    this.canvas.removeAttribute('aria-hidden');
    // Discard CSS dimensions added by the direct layer, not renderer settings.
    this.canvas.removeAttribute('style');
    this.parent?.classList.remove('race-layered');
    if (this.scene.alive) {
      this.scene.cameras.main.setBackgroundColor(this.oldCameraColor);
      this.scene.backdrop.image.setVisible(true);
      this.scene.backdrop.motion.setVisible(true);
    }
    this.active = false;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.restore();
  }
}
