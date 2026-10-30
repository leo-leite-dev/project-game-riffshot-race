import type Phaser from 'phaser';
import { renderRockLoop } from './rockLoop';
import { AudioPreferencesStore } from './AudioPreferences.ts';
import type { MusicSource } from './AudioPreferences.ts';
import { RaceTrackAudioLibrary } from './RaceTrackAudioLibrary.ts';
import type { RaceTrackAudioId, RaceTrackAudioInfo, RaceTrackAudioKind } from './RaceTrackAudioLibrary.ts';

type AudioState = {
  muted: boolean;
  hidden: boolean;
  focused: boolean;
  unlocked: boolean;
  available: boolean;
  silent: boolean;
  effectsVolume: number;
  musicVolume: number;
  musicSource: MusicSource;
};

type AudioGame = Phaser.Game & {
  sound: Phaser.Sound.BaseSoundManager & { context?: AudioContext };
};
type OfflineAudioContextConstructor = new (numberOfChannels: number, length: number, sampleRate: number) => OfflineAudioContext;
type AudioWindow = Window & {
  OfflineAudioContext?: OfflineAudioContextConstructor;
  webkitOfflineAudioContext?: OfflineAudioContextConstructor;
};
type ScheduledRaceAnnouncer = {
  raceId: string; trackId: string; timer: number | null;
  promise: Promise<boolean>; resolve: (played: boolean) => void;
};

export class MenuMusic {
  private readonly game: AudioGame;
  private readonly context: AudioContext | undefined;
  private readonly button: HTMLButtonElement | null;
  private muted: boolean;
  private destroyed: boolean;
  private unavailable: boolean;
  private trackUnavailable: boolean;
  private focused: boolean;
  private activated: boolean;
  private volume: number;
  private effectsVolume: number;
  private musicSource: MusicSource;
  private readonly preferences: AudioPreferencesStore;
  private starting: Promise<void> | undefined;
  private buffer: AudioBuffer | null = null;
  private output: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private trackAudio: HTMLAudioElement | null = null;
  private announcerAudio: HTMLAudioElement | null = null;
  private announcerObjectUrl: string | null = null;
  private finishRaceAnnouncer: ((finished: boolean) => void) | null = null;
  private announcerGeneration = 0;
  private readonly announcerTimeoutMs = 45_000;
  private scheduledRaceAnnouncer: ScheduledRaceAnnouncer | null = null;
  private raceTrackMusicId: string | null = null;
  private raceTrackAudioUrl: string | null = null;
  private raceTrackLoadGeneration = 0;
  private readonly raceTrackAudioLibrary: RaceTrackAudioLibrary;
  private readonly raceTrackOverrides = new Map<RaceTrackAudioId, { info: RaceTrackAudioInfo; blob: Blob }>();
  private readonly raceTrackAnnouncerOverrides = new Map<RaceTrackAudioId, { info: RaceTrackAudioInfo; blob: Blob }>();
  private readonly raceTrackOverridesReady: Promise<void>;
  private readonly onGesture: (event: Event) => void;
  private readonly onToggle: () => void;
  private readonly onVisibility: (event: Event) => void;
  private readonly onContextState: () => void;
  private readonly onDestroy: () => void;

  constructor(game: AudioGame, preferences = new AudioPreferencesStore(),
    raceTrackAudioLibrary = new RaceTrackAudioLibrary()) {
    this.game = game;
    this.preferences = preferences;
    this.raceTrackAudioLibrary = raceTrackAudioLibrary;
    this.context = game.sound?.context;
    this.button = document.getElementById('music-toggle') as HTMLButtonElement | null;
    const saved = preferences.value;
    this.muted = saved.effectsMuted;
    this.destroyed = false;
    this.unavailable = !this.context || this.context.state === 'closed';
    const audioWindow = window as AudioWindow;
    this.trackUnavailable = !(audioWindow.OfflineAudioContext || audioWindow.webkitOfflineAudioContext);
    this.focused = document.hasFocus();
    this.activated = false;
    this.volume = saved.gameMusicVolume;
    this.effectsVolume = saved.effectsVolume;
    this.musicSource = saved.musicSource;
    this.onGesture = (event) => {
      const keyboardEvent = event instanceof KeyboardEvent ? event : null;
      if (!(event instanceof KeyboardEvent) || !event.repeat) this.activate();
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
    this.raceTrackOverridesReady = this.preloadRaceTrackOverrides();
    this.refreshState();
  }

  activate() {
    if (this.destroyed || this.unavailable) return;
    this.activated = true;
    // resume() is requested directly inside the gesture, before async rendering.
    let resume;
    try {
      resume = Promise.resolve(this.context?.resume()).catch(() => {});
    } catch {
      resume = Promise.resolve();
    }
    resume.then(() => { if (!this.destroyed) this.refreshState(); });
    if (this.musicSource === 'game' && !this.starting && !this.trackUnavailable) {
      this.starting = this.start(resume);
    }
    this.refreshState();
  }

  async start(resume: Promise<void>) {
    try {
      await resume;
      if (this.destroyed) return;
      const buffer = await renderRockLoop();
      if (this.destroyed) return;
      this.buffer = buffer;
      const context = this.context;
      if (!context) return;
      this.output = context.createGain();
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
    this.muted = !this.muted;
    this.preferences.update({ effectsMuted: this.muted });
    this.activate();
  }

  setMusicSource(source: MusicSource) {
    if (this.destroyed) return;
    this.musicSource = source;
    this.preferences.update({ musicSource: source });
    this.game.events.emit('music-source', source);
    if (source === 'game' && this.activated && !this.starting && !this.trackUnavailable) {
      this.start(Promise.resolve());
    }
    this.applyVolume();
    this.refreshState();
  }

  setGameMusicVolume(value: number) {
    if (!Number.isFinite(value)) return;
    this.volume = Math.max(0, Math.min(1, value));
    this.preferences.update({ gameMusicVolume: this.volume });
    this.applyVolume();
    this.refreshState();
  }

  setEffectsVolume(value: number) {
    if (!Number.isFinite(value)) return;
    this.effectsVolume = Math.max(0, Math.min(1, value));
    this.preferences.update({ effectsVolume: this.effectsVolume });
    this.refreshState();
  }

  get musicMode() { return this.musicSource; }
  get currentEffectsVolume() { return this.effectsVolume; }
  get currentRaceTrackMusicId() { return this.raceTrackMusicId; }

  /** Load local dev overrides early so the actual play() can happen in Confirm's user gesture. */
  private async preloadRaceTrackOverrides(): Promise<void> {
    try {
      const entries = await this.raceTrackAudioLibrary.list();
      for (const entry of entries) {
        const loaded = await this.raceTrackAudioLibrary.get(entry.trackId, entry.kind);
        if (loaded && !this.destroyed) {
          if (entry.kind === 'music') this.raceTrackOverrides.set(entry.trackId, loaded);
          else this.raceTrackAnnouncerOverrides.set(entry.trackId, loaded);
        }
      }
      this.game.events.emit('race-track-audio-overrides', this.getRaceTrackAudioOverrides());
    } catch { /* IndexedDB is optional; built-in track themes still work. */ }
  }

  getRaceTrackAudioOverrides(): readonly RaceTrackAudioInfo[] {
    return [...this.raceTrackOverrides.values(), ...this.raceTrackAnnouncerOverrides.values()].map(({ info }) => info);
  }

  async setRaceTrackAudioOverride(trackId: string, file: File | null,
    kind: RaceTrackAudioKind = 'music'): Promise<RaceTrackAudioInfo | null> {
    if (this.destroyed) throw new Error('O player de música foi encerrado.');
    await this.raceTrackOverridesReady;
    if (!file) {
      await this.raceTrackAudioLibrary.remove(trackId, kind);
      if (kind === 'music') {
        this.raceTrackOverrides.delete(trackId as RaceTrackAudioId);
        if (this.raceTrackMusicId === trackId) await this.startRaceTrackMusic(trackId, true);
      } else this.raceTrackAnnouncerOverrides.delete(trackId as RaceTrackAudioId);
      this.game.events.emit('race-track-audio-overrides', this.getRaceTrackAudioOverrides());
      return null;
    }
    const info = await this.raceTrackAudioLibrary.save(trackId, file, kind);
    const loaded = await this.raceTrackAudioLibrary.get(trackId, kind);
    if (!loaded) throw new Error('O MP3 não pôde ser relido do armazenamento local.');
    if (kind === 'music') {
      this.raceTrackOverrides.set(info.trackId, loaded);
      if (this.raceTrackMusicId === trackId) await this.startRaceTrackMusic(trackId, true);
    } else this.raceTrackAnnouncerOverrides.set(info.trackId, loaded);
    this.game.events.emit('race-track-audio-overrides', this.getRaceTrackAudioOverrides());
    return info;
  }

  scheduleRaceAnnouncer(trackId: string, raceId: string, delayMs = 2000): Promise<boolean> {
    this.cancelRaceAnnouncer();
    let resolve!: (played: boolean) => void;
    const promise = new Promise<boolean>(done => { resolve = done; });
    const scheduled: ScheduledRaceAnnouncer = { trackId, raceId, timer: null, promise, resolve };
    scheduled.timer = window.setTimeout(() => {
      scheduled.timer = null;
      void this.startRaceAnnouncer(trackId).then(resolve, () => resolve(false));
    }, Math.max(0, delayMs));
    this.scheduledRaceAnnouncer = scheduled;
    return promise;
  }

  playRaceAnnouncer(trackId: string, raceId?: string): Promise<boolean> {
    const scheduled = this.scheduledRaceAnnouncer;
    if (scheduled && scheduled.trackId === trackId && (!raceId || scheduled.raceId === raceId)) {
      return scheduled.promise;
    }
    return this.startRaceAnnouncer(trackId);
  }

  private async startRaceAnnouncer(trackId: string): Promise<boolean> {
    if (this.destroyed) return false;
    await this.raceTrackOverridesReady;
    let override = this.raceTrackAnnouncerOverrides.get(trackId as RaceTrackAudioId);
    if (!override) {
      try {
        override = (await this.raceTrackAudioLibrary.get(trackId, 'announcer')) ?? undefined;
        if (override && !this.destroyed) this.raceTrackAnnouncerOverrides.set(trackId as RaceTrackAudioId, override);
      } catch { return false; }
    }
    if (!override || this.destroyed) return false;
    if (this.finishRaceAnnouncer) this.finishRaceAnnouncer(false);
    const generation = ++this.announcerGeneration;
    const audio = document.createElement('audio');
    audio.preload = 'auto';
    audio.loop = false;
    const objectUrl = URL.createObjectURL(override.blob);
    audio.src = objectUrl;
    audio.volume = this.volume;
    this.announcerAudio = audio;
    this.announcerObjectUrl = objectUrl;
    this.game.events.emit('race-announcer-state', { trackId, status: 'playing' });
    return new Promise<boolean>(resolve => {
      let settled = false;
      const finish = (completed: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
        if (generation === this.announcerGeneration) {
          this.announcerAudio = null;
          this.announcerObjectUrl = null;
          this.finishRaceAnnouncer = null;
          try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch { /* Narration is optional. */ }
          URL.revokeObjectURL(objectUrl);
          this.game.events.emit('race-announcer-state', { trackId, status: completed ? 'finished' : 'unavailable' });
        }
        resolve(completed);
      };
      const onEnded = () => finish(true);
      const onError = () => finish(false);
      const timer = setTimeout(() => finish(false), this.announcerTimeoutMs);
      this.finishRaceAnnouncer = finish;
      audio.addEventListener('ended', onEnded, { once: true });
      audio.addEventListener('error', onError, { once: true });
      try { void audio.play().catch(() => finish(false)); } catch { finish(false); }
    });
  }

  cancelRaceAnnouncer(): void {
    const scheduled = this.scheduledRaceAnnouncer;
    this.scheduledRaceAnnouncer = null;
    if (scheduled?.timer !== null && scheduled?.timer !== undefined) window.clearTimeout(scheduled.timer);
    scheduled?.resolve(false);
    if (this.finishRaceAnnouncer) {
      this.finishRaceAnnouncer(false);
      return;
    }
    this.announcerGeneration += 1;
    const audio = this.announcerAudio, url = this.announcerObjectUrl;
    this.announcerAudio = null;
    this.announcerObjectUrl = null;
    if (audio) {
      try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch { /* Narration is optional. */ }
    }
    if (url) URL.revokeObjectURL(url);
  }

  /** Temporarily overrides the selected music for one race without changing its saved preference. */
  async startRaceTrackMusic(trackId: string, forceRestart = false): Promise<void> {
    if (this.destroyed) return;
    const generation = ++this.raceTrackLoadGeneration;
    const builtInUrl = trackId === 'neon-furnace' ? '/assets/audio/neon-furnace-theme.mp3' : null;
    let override = this.raceTrackOverrides.get(trackId as RaceTrackAudioId);
    if (!override && !builtInUrl) {
      await this.raceTrackOverridesReady;
      if (this.destroyed || generation !== this.raceTrackLoadGeneration) return;
      override = this.raceTrackOverrides.get(trackId as RaceTrackAudioId);
    }
    if (!override && !builtInUrl) {
      try {
        override = (await this.raceTrackAudioLibrary.get(trackId)) ?? undefined;
        if (override && !this.destroyed) this.raceTrackOverrides.set(trackId as RaceTrackAudioId, override);
      } catch { /* A custom theme is optional; fall back to the built-in theme below. */ }
    }
    if (this.destroyed || generation !== this.raceTrackLoadGeneration) return;
    if (!override && !builtInUrl) return;
    if (!forceRestart && this.raceTrackMusicId === trackId && this.trackAudio && !this.trackAudio.paused) return;
    this.stopRaceTrackMusic();
    const audio = document.createElement('audio');
    audio.preload = 'auto';
    audio.loop = true;
    if (override) {
      this.raceTrackAudioUrl = URL.createObjectURL(override.blob);
      audio.src = this.raceTrackAudioUrl;
    } else audio.src = builtInUrl!;
    audio.volume = this.volume;
    audio.addEventListener('error', this.onRaceTrackError, { once: true });
    this.trackAudio = audio;
    this.raceTrackMusicId = trackId;
    this.game.events.emit('race-track-music', { active: true, trackId });
    this.applyVolume();
    void audio.play().then(() => this.refreshState()).catch(() => this.handleRaceTrackFailure());
    this.game.events.emit('race-track-music-state', { trackId, status: 'connecting' });
  }

  stopRaceTrackMusic(): void {
    // Invalidate a custom-track lookup still pending in IndexedDB as well as
    // stopping a source that has already started.
    this.raceTrackLoadGeneration += 1;
    if (!this.raceTrackMusicId && !this.trackAudio) return;
    const previousId = this.raceTrackMusicId;
    const audio = this.trackAudio;
    this.trackAudio = null;
    this.raceTrackMusicId = null;
    if (audio) {
      audio.removeEventListener('error', this.onRaceTrackError);
      try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch { /* Track audio is optional. */ }
    }
    if (this.raceTrackAudioUrl) URL.revokeObjectURL(this.raceTrackAudioUrl);
    this.raceTrackAudioUrl = null;
    this.raceTrackLoadGeneration += 1;
    this.game.events.emit('race-track-music', { active: false, trackId: previousId });
    this.game.events.emit('race-track-music-state', { trackId: previousId, status: 'stopped' });
    if (!this.destroyed && this.activated && this.musicSource === 'game' && !this.starting && !this.trackUnavailable) {
      this.start(Promise.resolve());
    }
    this.applyVolume();
    this.refreshState();
  }

  private readonly onRaceTrackError = () => this.handleRaceTrackFailure();

  private handleRaceTrackFailure(): void {
    const trackId = this.raceTrackMusicId;
    if (!trackId) return;
    this.game.events.emit('race-track-music-state', { trackId, status: 'unavailable' });
    this.stopRaceTrackMusic();
  }

  getAudioState(): AudioState {
    const unlocked = this.context?.state === 'running';
    const available = !this.destroyed && !!this.context && this.context.state !== 'closed';
    return { muted: this.muted, hidden: document.hidden, focused: this.focused,
      unlocked, available, effectsVolume: this.effectsVolume, musicVolume: this.volume, musicSource: this.musicSource,
      silent: !available || !unlocked || this.muted || document.hidden || !this.focused };
  }

  refreshState(): void {
    if (this.destroyed) return;
    this.unavailable = !this.context || this.context.state === 'closed';
    this.applyVolume();
    this.updateButton();
    // Effects and music have separate channels and level controls.
    this.game.events.emit('audio-state', this.getAudioState());
  }

  applyVolume() {
    if (!this.output || !this.context || this.context.state === 'closed') return;
    try {
      this.output.gain.cancelScheduledValues(this.context.currentTime);
      const state = this.getAudioState();
      const musicSilent = !state.available || !state.unlocked || state.hidden || !state.focused;
      this.output.gain.setTargetAtTime(musicSilent || this.musicSource !== 'game' || !!this.raceTrackMusicId ? 0 : this.volume,
        this.context.currentTime, 0.03);
      if (this.trackAudio) this.trackAudio.volume = musicSilent ? 0 : this.volume;
    } catch { /* Optional audio must never interrupt navigation. */ }
  }

  updateButton() {
    if (!this.button) return;
    this.button.disabled = this.unavailable;
    const active = !this.muted;
    this.button.textContent = this.unavailable ? '♫ SOM INDISPONÍVEL'
      : active ? '♫ EFEITOS: ON' : '♫ EFEITOS: OFF';
    this.button.setAttribute('aria-label', active ? 'Silenciar efeitos sonoros' : 'Ativar efeitos sonoros');
    this.button.setAttribute('aria-pressed', String(active));
  }

  releaseTrack() {
    try { this.source?.stop(); } catch { /* Already stopped or not yet started. */ }
    try { this.source?.disconnect(); } catch { /* Partially initialized graph. */ }
    try { this.output?.disconnect(); } catch { /* Partially initialized graph. */ }
    this.source = null;
    this.output = null;
    this.buffer = null;
    this.stopRaceTrackMusic();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.raceTrackLoadGeneration += 1;
    this.game.events.emit('audio-state', this.getAudioState());
    window.removeEventListener('pointerdown', this.onGesture, true);
    window.removeEventListener('keydown', this.onGesture, true);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.onVisibility);
    window.removeEventListener('focus', this.onVisibility);
    this.button?.removeEventListener('click', this.onToggle);
    this.context?.removeEventListener('statechange', this.onContextState);
    this.game.events.off('destroy', this.onDestroy);
    this.cancelRaceAnnouncer();
    this.raceTrackAudioLibrary.close();
    this.trackAudio?.removeEventListener('error', this.onRaceTrackError);
    try { this.trackAudio?.pause(); this.trackAudio?.removeAttribute('src'); this.trackAudio?.load(); } catch { /* Optional track cleanup. */ }
    this.trackAudio = null;
    this.raceTrackMusicId = null;
    this.releaseTrack();
  }
}
