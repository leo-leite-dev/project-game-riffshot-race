import { renderRockLoop } from './rockLoop.js';

export class MenuMusic {
  constructor(game) {
    this.game = game;
    this.context = game.sound?.context;
    this.button = document.getElementById('music-toggle');
    this.muted = false;
    this.destroyed = false;
    this.unavailable = !this.context || this.context.state === 'closed';
    this.trackUnavailable = !(window.OfflineAudioContext || window.webkitOfflineAudioContext);
    this.focused = document.hasFocus();
    this.activated = false;
    this.volume = 0.18;
    this.onGesture = (event) => {
      if (event.type === 'keydown' && event.key?.toLowerCase() === 'm' && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        this.toggle();
      } else if (event.target?.closest?.('#music-toggle')) {
        // Native button keys must not also confirm a choice inside Phaser.
        if (event.type === 'keydown') event.stopPropagation();
      } else if (!event.repeat) this.activate();
    };
    this.onToggle = () => this.toggle();
    this.onVisibility = (event) => {
      if (event.type === 'blur') this.focused = false;
      if (event.type === 'focus') this.focused = true;
      this.refreshState();
    };
    this.onContextState = () => this.refreshState();
    this.onDestroy = () => this.destroy();
    window.addEventListener('pointerdown', this.onGesture, true);
    window.addEventListener('keydown', this.onGesture, true);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.onVisibility);
    window.addEventListener('focus', this.onVisibility);
    this.button?.addEventListener('click', this.onToggle);
    this.context?.addEventListener('statechange', this.onContextState);
    game.events.once('destroy', this.onDestroy);
    this.refreshState();
  }

  activate() {
    if (this.destroyed || this.unavailable) return;
    this.activated = true;
    // resume() is requested directly inside the gesture, before async rendering.
    let resume;
    try {
      resume = Promise.resolve(this.context.resume()).catch(() => {});
    } catch {
      resume = Promise.resolve();
    }
    resume.then(() => { if (!this.destroyed) this.refreshState(); });
    if (!this.starting && !this.trackUnavailable) {
      this.starting = this.start(resume);
    }
    this.refreshState();
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
      this.refreshState();
    } catch {
      if (this.destroyed) return;
      // Audio is optional: unsupported or rejected playback never blocks a scene.
      this.releaseTrack();
      this.trackUnavailable = true;
      this.refreshState();
    }
  }

  toggle() {
    if (this.destroyed || this.unavailable) return;
    if (this.activated) this.muted = !this.muted;
    this.activate();
  }

  getAudioState() {
    const unlocked = this.context?.state === 'running';
    const available = !this.destroyed && !!this.context && this.context.state !== 'closed';
    return { muted: this.muted, hidden: document.hidden, focused: this.focused,
      unlocked, available, silent: !available || !unlocked || this.muted || document.hidden || !this.focused };
  }

  refreshState() {
    if (this.destroyed) return;
    this.unavailable = !this.context || this.context.state === 'closed';
    this.applyVolume();
    this.updateButton();
    // One global control for music and engines; OfflineAudioContext is music-only.
    this.game.events.emit('audio-state', this.getAudioState());
  }

  applyVolume() {
    if (!this.output || this.context.state === 'closed') return;
    try {
      this.output.gain.cancelScheduledValues(this.context.currentTime);
      this.output.gain.setTargetAtTime(this.getAudioState().silent ? 0 : this.volume, this.context.currentTime, 0.03);
    } catch { /* Optional audio must never interrupt navigation. */ }
  }

  updateButton() {
    if (!this.button) return;
    this.button.disabled = this.unavailable;
    const active = this.activated && !this.muted;
    this.button.textContent = this.unavailable ? '♫ SOM INDISPONÍVEL'
      : !this.activated ? '♫ SOM: ATIVAR' : this.muted ? '♫ SOM: OFF [M]' : '♫ SOM: ON [M]';
    this.button.setAttribute('aria-label', active ? 'Silenciar som' : 'Ativar som');
    this.button.setAttribute('aria-pressed', String(active));
  }

  releaseTrack() {
    try { this.source?.stop(); } catch { /* Already stopped or not yet started. */ }
    try { this.source?.disconnect(); } catch { /* Partially initialized graph. */ }
    try { this.output?.disconnect(); } catch { /* Partially initialized graph. */ }
    this.source = null;
    this.output = null;
    this.buffer = null;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.game.events.emit('audio-state', this.getAudioState());
    window.removeEventListener('pointerdown', this.onGesture, true);
    window.removeEventListener('keydown', this.onGesture, true);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.onVisibility);
    window.removeEventListener('focus', this.onVisibility);
    this.button?.removeEventListener('click', this.onToggle);
    this.context?.removeEventListener('statechange', this.onContextState);
    this.game.events.off('destroy', this.onDestroy);
    this.releaseTrack();
  }
}
