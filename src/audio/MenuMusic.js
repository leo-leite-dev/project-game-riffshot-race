import { renderRockLoop } from './rockLoop.js';

export class MenuMusic {
  constructor(game) {
    this.context = game.sound.context;
    this.button = document.getElementById('music-toggle');
    this.muted = false;
    this.destroyed = false;
    this.unavailable = !this.context || !(window.OfflineAudioContext || window.webkitOfflineAudioContext);
    this.volume = 0.18;
    this.onGesture = (event) => {
      if (event.type === 'keydown' && event.key.toLowerCase() === 'm' && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        this.toggle();
      } else if (event.target.closest?.('#music-toggle')) {
        // Native button keys must not also confirm a choice inside Phaser.
        if (event.type === 'keydown') event.stopPropagation();
      } else if (!event.repeat) this.activate();
    };
    this.onToggle = () => this.toggle();
    this.onVisibility = () => this.applyVolume();
    window.addEventListener('pointerdown', this.onGesture, true);
    window.addEventListener('keydown', this.onGesture, true);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.onVisibility);
    window.addEventListener('focus', this.onVisibility);
    this.button.addEventListener('click', this.onToggle);
    game.events.once('destroy', () => this.destroy());
    this.updateButton();
  }

  activate() {
    if (this.destroyed || this.unavailable) return;
    // resume() is requested directly inside the gesture, before async rendering.
    const resume = this.context.resume().catch(() => {});
    if (!this.starting) {
      this.starting = this.start(resume);
    }
  }

  async start(resume) {
    try {
      await resume;
      if (this.destroyed) return;
      const buffer = await renderRockLoop();
      if (this.destroyed) return;
      this.buffer = buffer;
      this.output = this.context.createGain();
      this.output.gain.value = 0;
      this.output.connect(this.context.destination);
      this.source = this.context.createBufferSource();
      this.source.buffer = this.buffer;
      this.source.loop = true;
      this.source.connect(this.output);
      this.source.start();
      this.applyVolume();
      this.updateButton();
    } catch {
      if (this.destroyed) return;
      // Audio is optional: unsupported or rejected playback never blocks a scene.
      this.unavailable = true;
      this.updateButton();
    }
  }

  toggle() {
    if (this.unavailable) return;
    if (this.starting) this.muted = !this.muted;
    this.activate();
    this.applyVolume();
    this.updateButton();
  }

  applyVolume() {
    if (!this.output || this.context.state === 'closed') return;
    const silent = this.muted || document.hidden || !document.hasFocus();
    this.output.gain.setTargetAtTime(silent ? 0 : this.volume, this.context.currentTime, 0.03);
  }

  updateButton() {
    this.button.disabled = this.unavailable;
    const active = !!this.source && !this.muted;
    this.button.textContent = this.unavailable ? '♫ SOM INDISPONÍVEL'
      : !this.starting ? '♫ SOM: ATIVAR' : this.muted ? '♫ SOM: OFF [M]' : '♫ SOM: ON [M]';
    this.button.setAttribute('aria-label', active ? 'Silenciar trilha sonora' : 'Ativar trilha sonora');
    this.button.setAttribute('aria-pressed', String(active));
  }

  destroy() {
    this.destroyed = true;
    window.removeEventListener('pointerdown', this.onGesture, true);
    window.removeEventListener('keydown', this.onGesture, true);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.onVisibility);
    window.removeEventListener('focus', this.onVisibility);
    this.button.removeEventListener('click', this.onToggle);
    this.source?.stop();
    this.source?.disconnect();
    this.output?.disconnect();
    this.buffer = null;
  }
}
