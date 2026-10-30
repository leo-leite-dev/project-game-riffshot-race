export type MusicSource = 'game' | 'radio' | 'none';
export const RADIO_GENRES = ['Hard Rock', 'Classic Rock', 'Heavy Metal', 'Rock', '80s Rock'] as const;
export type RadioGenre = (typeof RADIO_GENRES)[number];

export interface AudioPreferences {
  version: 1;
  musicSource: MusicSource;
  gameMusicVolume: number;
  radioVolume: number;
  effectsVolume: number;
  effectsMuted: boolean;
  radioGenre: RadioGenre;
  lastStationUuid: string | null;
  radioWasPlaying: boolean;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export type AudioPreferencesPatch = Partial<Omit<AudioPreferences, 'version'>>;
export const AUDIO_PREFERENCES_KEY = 'riffshot-racing:audio:v1';

export const DEFAULT_AUDIO_PREFERENCES: Readonly<AudioPreferences> = Object.freeze({
  version: 1,
  musicSource: 'game',
  gameMusicVolume: 0.18,
  radioVolume: 0.65,
  effectsVolume: 1,
  effectsMuted: false,
  radioGenre: 'Hard Rock',
  lastStationUuid: null,
  radioWasPlaying: false,
});

const clampVolume = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
const isGenre = (value: unknown): value is RadioGenre => RADIO_GENRES.some(genre => genre === value);

function sanitize(value: unknown): AudioPreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_AUDIO_PREFERENCES };
  const record = value as Record<string, unknown>;
  return {
    version: 1,
    musicSource: record.musicSource === 'radio' || record.musicSource === 'none' ? record.musicSource : 'game',
    gameMusicVolume: clampVolume(record.gameMusicVolume, DEFAULT_AUDIO_PREFERENCES.gameMusicVolume),
    radioVolume: clampVolume(record.radioVolume, DEFAULT_AUDIO_PREFERENCES.radioVolume),
    effectsVolume: clampVolume(record.effectsVolume, DEFAULT_AUDIO_PREFERENCES.effectsVolume),
    effectsMuted: typeof record.effectsMuted === 'boolean' ? record.effectsMuted : false,
    radioGenre: isGenre(record.radioGenre) ? record.radioGenre : DEFAULT_AUDIO_PREFERENCES.radioGenre,
    lastStationUuid: typeof record.lastStationUuid === 'string' && record.lastStationUuid.length <= 100
      ? record.lastStationUuid : null,
    radioWasPlaying: typeof record.radioWasPlaying === 'boolean' ? record.radioWasPlaying : false,
  };
}

/** Session-safe preferences are separate from championship/save data. */
export class AudioPreferencesStore {
  private readonly storage?: StorageLike;
  private state: AudioPreferences;
  private readonly listeners = new Set<(preferences: Readonly<AudioPreferences>) => void>();

  constructor(storage?: StorageLike) {
    try { this.storage = storage ?? globalThis.localStorage; } catch { this.storage = undefined; }
    this.state = this.read();
  }

  get value(): Readonly<AudioPreferences> { return this.state; }

  update(patch: AudioPreferencesPatch): Readonly<AudioPreferences> {
    this.state = sanitize({ ...this.state, ...patch });
    try { this.storage?.setItem(AUDIO_PREFERENCES_KEY, JSON.stringify(this.state)); } catch { /* Audio settings are optional. */ }
    for (const listener of this.listeners) {
      try { listener(this.state); } catch { /* A broken UI observer cannot interrupt sound or racing. */ }
    }
    return this.state;
  }

  subscribe(listener: (preferences: Readonly<AudioPreferences>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private read(): AudioPreferences {
    try {
      const raw = this.storage?.getItem(AUDIO_PREFERENCES_KEY);
      if (raw) return sanitize(JSON.parse(raw));
    } catch { /* Corrupt or blocked localStorage falls back to defaults. */ }
    return { ...DEFAULT_AUDIO_PREFERENCES };
  }
}
