import type { RadioGenre } from './AudioPreferences.ts';

export interface RadioBrowserStation {
  stationuuid: string;
  name: string;
  url: string;
  homepage: string;
  tags: string;
  codec: string;
  bitrate: number;
  hls: number;
  lastcheckok: number;
  apiServer: string;
}

type RawStation = Record<string, unknown>;
type FetchFunction = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export interface RadioBrowserClientOptions {
  fetch?: FetchFunction;
  canPlayType?: (mime: string) => string;
  random?: () => number;
  timeoutMs?: number;
  discoveryUrl?: string;
  fallbackServers?: readonly string[];
}

const DEFAULT_DISCOVERY = 'https://all.api.radio-browser.info/json/servers';
const DEFAULT_MIRRORS = ['https://de1.api.radio-browser.info'];
const MAX_MIRROR_ATTEMPTS = 3;
const CODEC_MIME: Readonly<Record<string, string>> = Object.freeze({
  MP3: 'audio/mpeg', MPEG: 'audio/mpeg', AAC: 'audio/aac', 'AAC+': 'audio/aac',
  OGG: 'audio/ogg; codecs="vorbis"', VORBIS: 'audio/ogg; codecs="vorbis"',
  OPUS: 'audio/ogg; codecs="opus"', FLAC: 'audio/flac',
});

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0;

export function supportsRadioCodec(codec: string, canPlayType: (mime: string) => string): boolean {
  const mime = CODEC_MIME[codec.trim().toUpperCase()];
  if (!mime) return false;
  try { return canPlayType(mime) !== ''; } catch { return false; }
}

function shuffled<T>(values: T[], random: () => number): T[] {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j]!, values[i]!];
  }
  return values;
}

export class RadioBrowserClient {
  private readonly fetcher: FetchFunction;
  private readonly canPlayType: (mime: string) => string;
  private readonly random: () => number;
  private readonly timeoutMs: number;
  private readonly discoveryUrl: string;
  private readonly fallbackServers: readonly string[];
  private serversPromise: Promise<string[]> | null = null;

  constructor(options: RadioBrowserClientOptions = {}) {
    this.fetcher = options.fetch ?? (typeof globalThis.fetch === 'function'
      ? globalThis.fetch.bind(globalThis)
      : async () => { throw new Error('fetch unavailable'); });
    this.canPlayType = options.canPlayType ?? (mime => {
      if (typeof document === 'undefined') return 'maybe';
      return document.createElement('audio').canPlayType(mime);
    });
    this.random = options.random ?? Math.random;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.discoveryUrl = options.discoveryUrl ?? DEFAULT_DISCOVERY;
    this.fallbackServers = options.fallbackServers ?? DEFAULT_MIRRORS;
  }

  async discoverServers(): Promise<string[]> {
    if (!this.serversPromise) this.serversPromise = this.loadServers();
    return this.serversPromise;
  }

  private async loadServers(): Promise<string[]> {
    const names: string[] = [];
    try {
      const response = await this.fetchWithTimeout(this.discoveryUrl, { headers: { Accept: 'application/json' } });
      if (response.ok) {
        const records: unknown = await response.json();
        if (Array.isArray(records)) {
          for (const record of records) {
            const name = record && typeof record === 'object' ? text((record as Record<string, unknown>).name) : '';
            if (/^[a-z0-9-]+\.api\.radio-browser\.info$/i.test(name)) names.push(`https://${name}`);
          }
        }
      }
    } catch { /* DNS discovery may be unavailable in browsers; try known HTTPS mirrors. */ }
    const unique = [...new Set([...names, ...this.fallbackServers.filter(url => url.startsWith('https://'))])];
    return shuffled(unique, this.random);
  }

  async searchStations(genre: RadioGenre): Promise<RadioBrowserStation[]> {
    const params = new URLSearchParams({
      tag: genre.toLowerCase(), hidebroken: 'true', is_https: 'true',
      order: 'clickcount', reverse: 'true', limit: '40',
    });
    const { result, server } = await this.requestJson<unknown>(`/json/stations/search?${params}`);
    if (!Array.isArray(result)) throw new Error('Resposta inválida da Radio Browser.');
    const stations: RadioBrowserStation[] = [];
    const seen = new Set<string>();
    for (const raw of result as RawStation[]) {
      const station = this.normalizeStation(raw, server);
      if (!station || seen.has(station.stationuuid)) continue;
      seen.add(station.stationuuid);
      stations.push(station);
    }
    return stations;
  }

  async countStationClick(station: RadioBrowserStation): Promise<void> {
    try {
      await this.requestJson(`/json/url/${encodeURIComponent(station.stationuuid)}`, station.apiServer);
    } catch { /* Click-count telemetry must never affect radio playback. */ }
  }

  private normalizeStation(raw: RawStation, apiServer: string): RadioBrowserStation | null {
    const stationuuid = text(raw.stationuuid);
    const stream = text(raw.url_resolved) || text(raw.url);
    const codec = text(raw.codec).toUpperCase();
    const hls = number(raw.hls);
    const lastcheckok = number(raw.lastcheckok);
    if (!stationuuid || !text(raw.name) || !stream || hls !== 0 || lastcheckok !== 1
      || !supportsRadioCodec(codec, this.canPlayType)) return null;
    let parsed: URL;
    try { parsed = new URL(stream); } catch { return null; }
    // Do not use insecure streams, local network URLs, or a proxy to bypass CORS/geoblocking.
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    return {
      stationuuid, name: text(raw.name), url: parsed.href,
      homepage: this.safeHomepage(raw.homepage), tags: text(raw.tags), codec,
      bitrate: number(raw.bitrate), hls, lastcheckok, apiServer,
    };
  }

  private safeHomepage(value: unknown): string {
    const homepage = text(value);
    try { return new URL(homepage).protocol === 'https:' ? new URL(homepage).href : ''; }
    catch { return ''; }
  }

  private async requestJson<T>(path: string, preferredServer?: string): Promise<{ result: T; server: string }> {
    const servers = await this.discoverServers();
    const ordered = preferredServer ? [preferredServer, ...servers.filter(server => server !== preferredServer)] : servers;
    let lastError: unknown;
    for (const server of ordered.slice(0, MAX_MIRROR_ATTEMPTS)) {
      try {
        const response = await this.fetchWithTimeout(`${server}${path}`, {
          headers: { Accept: 'application/json' }, credentials: 'omit', mode: 'cors', redirect: 'error',
        });
        if (!response.ok) throw new Error(`Radio Browser HTTP ${response.status}`);
        return { result: await response.json() as T, server };
      } catch (error) { lastError = error; }
    }
    throw new Error(`Radio Browser indisponível (${lastError instanceof Error ? lastError.message : 'sem resposta'}).`);
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try { return await this.fetcher(url, { ...init, signal: controller.signal }); }
    finally { clearTimeout(timer); }
  }
}
