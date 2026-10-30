import type Phaser from 'phaser';
import { AudioPreferencesStore } from './AudioPreferences.ts';
import type { MusicSource, RadioGenre } from './AudioPreferences.ts';
import { MenuMusic } from './MenuMusic.ts';
import { RadioBrowserClient } from './RadioBrowserClient.ts';
import type { RadioBrowserStation } from './RadioBrowserClient.ts';

export type RadioPlaybackStatus = 'idle' | 'connecting' | 'playing' | 'paused' | 'unavailable';
export interface RadioPlayerState {
  status: RadioPlaybackStatus;
  station: RadioBrowserStation | null;
  stations: readonly RadioBrowserStation[];
  genre: RadioGenre;
  volume: number;
  searching: boolean;
  searchError: string;
  playbackError: string;
  resumeAfterGesture: boolean;
  mode: MusicSource;
  previousAvailable: boolean;
  nextAvailable: boolean;
}

type RadioGame = Pick<Phaser.Game, 'events'>;
export interface RiffshotRadioOptions {
  client?: RadioBrowserClient;
  audio?: HTMLAudioElement;
  connectionTimeoutMs?: number;
}

const MAX_USER_PLAY_ATTEMPTS = 2;

/** One app-lifetime stream player, intentionally independent from Phaser scenes. */
export class RiffshotRadio {
  readonly audio: HTMLAudioElement;
  private readonly game: RadioGame;
  private readonly menuMusic: MenuMusic;
  private readonly preferences: AudioPreferencesStore;
  private readonly client: RadioBrowserClient;
  private readonly connectionTimeoutMs: number;
  private status: RadioPlaybackStatus;
  private station: RadioBrowserStation | null = null;
  private stations: RadioBrowserStation[] = [];
  private genre: RadioGenre;
  private searching = false;
  private searchError = '';
  private playbackError = '';
  private attempts = 0;
  private searchGeneration = 0;
  private connectionTimer: ReturnType<typeof setTimeout> | undefined;
  private destroyed = false;
  private pausedForRaceTrack = false;
  private readonly unsubscribePreferences: () => void;
  private readonly onMusicSource: (source: MusicSource) => void;
  private readonly onRaceTrackMusic: (event: { active?: boolean }) => void;
  private readonly onPlaying: () => void;
  private readonly onWaiting: () => void;
  private readonly onPause: () => void;
  private readonly onError: () => void;
  private readonly onEnded: () => void;
  private readonly onDestroy: () => void;

  constructor(game: RadioGame, menuMusic: MenuMusic, preferences = new AudioPreferencesStore(),
    options: RiffshotRadioOptions = {}) {
    this.game = game;
    this.menuMusic = menuMusic;
    this.preferences = preferences;
    this.client = options.client ?? new RadioBrowserClient();
    this.connectionTimeoutMs = options.connectionTimeoutMs ?? 12_000;
    this.audio = options.audio ?? document.createElement('audio');
    this.audio.preload = 'none';
    this.audio.volume = preferences.value.radioVolume;
    this.genre = preferences.value.radioGenre;
    this.status = preferences.value.radioWasPlaying ? 'paused' : 'idle';

    this.onMusicSource = source => {
      if (source !== 'radio' && (this.status === 'playing' || this.status === 'connecting')) this.pause();
      this.emitState();
    };
    this.onRaceTrackMusic = event => {
      if (event.active) {
        this.pausedForRaceTrack = this.status === 'playing' || this.status === 'connecting';
        if (this.pausedForRaceTrack) this.pause();
      } else if (this.pausedForRaceTrack) {
        this.pausedForRaceTrack = false;
        if (this.menuMusic.musicMode === 'radio') this.playSelected();
      }
    };
    this.onPlaying = () => {
      this.clearConnectionTimer();
      if (this.destroyed) return;
      this.status = 'playing';
      this.playbackError = '';
      this.preferences.update({ radioWasPlaying: true });
      this.emitState();
    };
    this.onWaiting = () => {
      if (this.status !== 'playing' && this.station) {
        this.status = 'connecting';
        this.emitState();
      }
    };
    this.onPause = () => {
      this.clearConnectionTimer();
      if (this.status === 'playing' || this.status === 'connecting') {
        this.status = 'paused';
        this.preferences.update({ radioWasPlaying: false });
        this.emitState();
      }
    };
    this.onError = () => this.failPlayback('A emissora ou o formato não está disponível neste navegador. Escolha outra estação.');
    this.onEnded = () => this.failPlayback('A transmissão foi encerrada. Você pode tentar novamente ou escolher outra estação.');
    this.onDestroy = () => this.destroy();

    this.audio.addEventListener('playing', this.onPlaying);
    this.audio.addEventListener('waiting', this.onWaiting);
    this.audio.addEventListener('stalled', this.onWaiting);
    this.audio.addEventListener('pause', this.onPause);
    this.audio.addEventListener('error', this.onError);
    this.audio.addEventListener('ended', this.onEnded);
    this.game.events.on('music-source', this.onMusicSource);
    this.game.events.on('race-track-music', this.onRaceTrackMusic);
    this.game.events.once('destroy', this.onDestroy);
    this.unsubscribePreferences = this.preferences.subscribe(value => {
      this.audio.volume = value.radioVolume;
      this.genre = value.radioGenre;
      this.emitState();
    });
  }

  get state(): RadioPlayerState {
    const selectedIndex = this.station ? this.stations.findIndex(item => item.stationuuid === this.station?.stationuuid) : -1;
    return {
      status: this.status, station: this.station, stations: this.stations, genre: this.genre,
      volume: this.preferences.value.radioVolume, searching: this.searching,
      searchError: this.searchError, playbackError: this.playbackError,
      resumeAfterGesture: this.preferences.value.radioWasPlaying && this.status === 'paused',
      mode: this.menuMusic.musicMode,
      previousAvailable: selectedIndex >= 0 && this.stations.length > 1,
      nextAvailable: selectedIndex >= 0 && this.stations.length > 1,
    };
  }

  async searchStations(genre: RadioGenre = this.genre): Promise<readonly RadioBrowserStation[]> {
    if (this.destroyed) return [];
    const generation = ++this.searchGeneration;
    this.genre = genre;
    this.preferences.update({ radioGenre: genre });
    this.searching = true;
    this.searchError = '';
    this.emitState();
    try {
      const found = await this.client.searchStations(genre);
      if (this.destroyed || generation !== this.searchGeneration) return this.stations;
      this.stations = found;
      const lastUuid = this.preferences.value.lastStationUuid;
      const restored = lastUuid ? found.find(item => item.stationuuid === lastUuid) : undefined;
      this.station = restored ?? found[0] ?? null;
      if (lastUuid && !restored) this.preferences.update({ radioWasPlaying: false, lastStationUuid: null });
      this.attempts = 0;
      if (!found.length) this.searchError = 'Nenhuma estação compatível encontrada. Tente outro gênero.';
    } catch {
      if (generation === this.searchGeneration) this.searchError = 'Não foi possível consultar a Radio Browser. Tente novamente.';
    } finally {
      if (generation === this.searchGeneration) {
        this.searching = false;
        this.emitState();
      }
    }
    return this.stations;
  }

  setGenre(genre: RadioGenre): void {
    if (this.destroyed || this.genre === genre) return;
    this.searchGeneration += 1;
    this.searching = false;
    if (this.status === 'playing' || this.status === 'connecting') this.pause();
    this.genre = genre;
    this.stations = [];
    this.station = null;
    this.status = 'idle';
    this.searchError = '';
    this.playbackError = '';
    this.preferences.update({ radioGenre: genre, lastStationUuid: null, radioWasPlaying: false });
    this.emitState();
  }

  selectStation(stationUuid: string): boolean {
    if (this.destroyed) return false;
    const selected = this.stations.find(item => item.stationuuid === stationUuid);
    if (!selected) return false;
    if (this.station?.stationuuid !== selected.stationuuid) {
      if (!this.audio.paused) this.audio.pause();
      this.clearConnectionTimer();
      this.station = selected;
      this.status = 'idle';
      this.attempts = 0;
      this.playbackError = '';
      this.preferences.update({ lastStationUuid: selected.stationuuid, radioWasPlaying: false });
      this.emitState();
    }
    return true;
  }

  /** Called directly by a user gesture; no API request is awaited before play(). */
  playSelected(): void {
    if (this.destroyed) return;
    const station = this.station;
    if (!station) {
      this.status = 'unavailable';
      this.playbackError = 'Escolha uma estação na lista antes de reproduzir.';
      this.emitState();
      return;
    }
    if (this.attempts >= MAX_USER_PLAY_ATTEMPTS) {
      this.status = 'unavailable';
      this.playbackError = 'Limite de tentativas atingido. Escolha outra estação para continuar.';
      this.emitState();
      return;
    }
    this.attempts += 1;
    this.menuMusic.setMusicSource('radio');
    this.clearConnectionTimer();
    this.playbackError = '';
    this.status = 'connecting';
    this.preferences.update({ lastStationUuid: station.stationuuid, radioWasPlaying: true });
    this.audio.volume = this.preferences.value.radioVolume;
    try {
      this.audio.src = station.url;
      this.audio.preload = 'none';
      this.audio.load();
      this.connectionTimer = setTimeout(() => {
        if (this.status === 'connecting') this.failPlayback('A emissora demorou para conectar. Tente novamente ou escolha outra.');
      }, this.connectionTimeoutMs);
      // Fire-and-forget: a click-count failure must not gate the browser's autoplay gesture.
      void this.client.countStationClick(station);
      void this.audio.play().catch(() => this.failPlayback('O navegador não conseguiu reproduzir esta transmissão. Escolha outra estação.'));
    } catch {
      this.failPlayback('O navegador não conseguiu iniciar a transmissão. Toque em reproduzir para tentar novamente.');
    }
    this.emitState();
  }

  togglePlayback(): void {
    if (this.status === 'playing' || this.status === 'connecting') this.pause();
    else this.playSelected();
  }

  pause(): void {
    if (this.destroyed) return;
    this.clearConnectionTimer();
    this.audio.pause();
    this.status = this.station ? 'paused' : 'idle';
    this.preferences.update({ radioWasPlaying: false });
    this.emitState();
  }

  playAdjacent(direction: -1 | 1): void {
    if (!this.stations.length) return;
    const index = this.station ? this.stations.findIndex(item => item.stationuuid === this.station?.stationuuid) : -1;
    const next = index < 0 ? (direction > 0 ? 0 : this.stations.length - 1)
      : (index + direction + this.stations.length) % this.stations.length;
    const station = this.stations[next];
    if (station) { this.selectStation(station.stationuuid); this.playSelected(); }
  }

  setVolume(value: number): void {
    if (!Number.isFinite(value)) return;
    const volume = Math.max(0, Math.min(1, value));
    this.audio.volume = volume;
    this.preferences.update({ radioVolume: volume });
  }

  private failPlayback(message: string): void {
    if (this.destroyed) return;
    this.clearConnectionTimer();
    this.status = 'unavailable';
    this.playbackError = message;
    this.preferences.update({ radioWasPlaying: false });
    try { this.audio.pause(); } catch { /* An unavailable stream is best-effort. */ }
    this.emitState();
  }

  private clearConnectionTimer(): void {
    if (this.connectionTimer !== undefined) clearTimeout(this.connectionTimer);
    this.connectionTimer = undefined;
  }

  private emitState(): void { this.game.events.emit('riffshot-radio-state', this.state); }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.searchGeneration += 1;
    this.clearConnectionTimer();
    this.unsubscribePreferences();
    this.game.events.off('music-source', this.onMusicSource);
    this.game.events.off('race-track-music', this.onRaceTrackMusic);
    this.game.events.off('destroy', this.onDestroy);
    this.audio.removeEventListener('playing', this.onPlaying);
    this.audio.removeEventListener('waiting', this.onWaiting);
    this.audio.removeEventListener('stalled', this.onWaiting);
    this.audio.removeEventListener('pause', this.onPause);
    this.audio.removeEventListener('error', this.onError);
    this.audio.removeEventListener('ended', this.onEnded);
    try { this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); } catch { /* Optional stream cleanup. */ }
  }
}
