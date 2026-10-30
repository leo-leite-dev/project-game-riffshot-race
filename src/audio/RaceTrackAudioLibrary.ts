import { RACE_TRACKS } from '../data/raceTracks.ts';

export type RaceTrackAudioId = (typeof RACE_TRACKS)[number]['id'];
export type RaceTrackAudioKind = 'music' | 'announcer';
export interface RaceTrackAudioInfo { trackId: RaceTrackAudioId; kind: RaceTrackAudioKind; fileName: string; bytes: number }
interface StoredMp3 { fileName: string; bytes: number; blob: Blob }
interface StoredTrackAudio { trackId: RaceTrackAudioId; music?: StoredMp3; announcer?: StoredMp3; blob?: Blob; fileName?: string; bytes?: number }

const DATABASE_NAME = 'riffshot-racing-track-audio';
const STORE_NAME = 'track-audio';
const MAX_TRACK_AUDIO_BYTES = 25 * 1024 * 1024;
const TRACK_IDS = new Set<string>(RACE_TRACKS.map(track => track.id));

/** Per-browser development music overrides. MP3 bytes live in IndexedDB, never in save/localStorage. */
export class RaceTrackAudioLibrary {
  private readonly factory: IDBFactory | undefined;
  private database: Promise<IDBDatabase> | null = null;

  constructor(factory: IDBFactory | undefined = globalThis.indexedDB) { this.factory = factory; }

  async save(trackId: string, file: File, kind: RaceTrackAudioKind = 'music'): Promise<RaceTrackAudioInfo> {
    this.validateTrack(trackId);
    if (!(file instanceof Blob) || !file.name.toLowerCase().endsWith('.mp3')
      || (file.type !== '' && file.type !== 'audio/mpeg')) throw new Error('Escolha um arquivo MP3 (audio/mpeg).');
    if (file.size < 128 || file.size > MAX_TRACK_AUDIO_BYTES) {
      throw new Error('O MP3 precisa ter entre 128 bytes e 25 MiB.');
    }
    const blob = new Blob([file], { type: 'audio/mpeg' });
    const db = await this.open();
    const existing = await this.readEntry(db, trackId);
    const next: StoredTrackAudio = { ...existing, trackId: trackId as RaceTrackAudioId,
      [kind]: { fileName: file.name.slice(0, 180), bytes: file.size, blob } };
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(next);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Falha ao salvar o MP3 neste navegador.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('O armazenamento do MP3 foi cancelado.'));
    });
    return { trackId: trackId as RaceTrackAudioId, kind, fileName: file.name.slice(0, 180), bytes: file.size };
  }

  async get(trackId: string, kind: RaceTrackAudioKind = 'music'): Promise<{ info: RaceTrackAudioInfo; blob: Blob } | null> {
    this.validateTrack(trackId);
    const db = await this.open();
    const entry = await this.readEntry(db, trackId);
    const media = entry[kind] ?? (kind === 'music' && entry.blob && entry.fileName && entry.bytes
      ? { blob: entry.blob, fileName: entry.fileName, bytes: entry.bytes } : undefined);
    return media ? { info: { trackId: entry.trackId, kind, fileName: media.fileName, bytes: media.bytes }, blob: media.blob } : null;
  }

  async list(): Promise<RaceTrackAudioInfo[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve((request.result as StoredTrackAudio[]).flatMap(entry => {
        const music = entry.music ?? (entry.blob && entry.fileName && entry.bytes
          ? { blob: entry.blob, fileName: entry.fileName, bytes: entry.bytes } : undefined);
        return [
          ...(music ? [{ trackId: entry.trackId, kind: 'music' as const, fileName: music.fileName, bytes: music.bytes }] : []),
          ...(entry.announcer ? [{ trackId: entry.trackId, kind: 'announcer' as const,
            fileName: entry.announcer.fileName, bytes: entry.announcer.bytes }] : []),
        ];
      }));
      request.onerror = () => reject(request.error ?? new Error('Não foi possível consultar os MP3 salvos.'));
    });
  }

  async remove(trackId: string, kind: RaceTrackAudioKind = 'music'): Promise<void> {
    this.validateTrack(trackId);
    const db = await this.open();
    const entry = await this.readEntry(db, trackId);
    delete entry[kind];
    if (kind === 'music') { delete entry.blob; delete entry.fileName; delete entry.bytes; }
    const empty = !entry.music && !entry.announcer && !entry.blob;
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      if (empty) transaction.objectStore(STORE_NAME).delete(trackId);
      else transaction.objectStore(STORE_NAME).put(entry);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Não foi possível remover o MP3 salvo.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('A remoção do MP3 foi cancelada.'));
    });
  }

  close(): void {
    if (!this.database) return;
    void this.database.then(db => db.close()).catch(() => {});
    this.database = null;
  }

  private validateTrack(trackId: string): asserts trackId is RaceTrackAudioId {
    if (!TRACK_IDS.has(trackId)) throw new Error('Essa pista não existe no catálogo.');
  }

  private readEntry(db: IDBDatabase, trackId: string): Promise<StoredTrackAudio> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(trackId);
      request.onsuccess = () => resolve((request.result as StoredTrackAudio | undefined) ?? { trackId: trackId as RaceTrackAudioId });
      request.onerror = () => reject(request.error ?? new Error('Não foi possível ler a biblioteca local de MP3.'));
    });
  }

  private open(): Promise<IDBDatabase> {
    if (!this.factory) return Promise.reject(new Error('O armazenamento local de áudio não está disponível neste navegador.'));
    if (!this.database) {
      this.database = new Promise((resolve, reject) => {
        const request = this.factory!.open(DATABASE_NAME, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) {
            request.result.createObjectStore(STORE_NAME, { keyPath: 'trackId' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Não foi possível abrir o armazenamento local de áudio.'));
        request.onblocked = () => reject(new Error('Feche outras abas do jogo para atualizar o armazenamento local de áudio.'));
      });
    }
    return this.database;
  }
}
