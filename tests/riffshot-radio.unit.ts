import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'eventemitter3';
import { AudioPreferencesStore, AUDIO_PREFERENCES_KEY, RADIO_GENRES } from '../src/audio/AudioPreferences.ts';
import type { AudioPreferences } from '../src/audio/AudioPreferences.ts';
import { RadioBrowserClient } from '../src/audio/RadioBrowserClient.ts';
import type { RadioBrowserStation } from '../src/audio/RadioBrowserClient.ts';
import { RiffshotRadio } from '../src/audio/RiffshotRadio.ts';
import type { MenuMusic } from '../src/audio/MenuMusic.ts';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const station = (uuid: string, name: string): RadioBrowserStation => ({
  stationuuid: uuid, name, url: `https://stream.test/${uuid}.mp3`, homepage: 'https://station.test/',
  tags: 'hard rock', codec: 'MP3', bitrate: 128, hls: 0, lastcheckok: 1,
  apiServer: 'https://de1.api.radio-browser.info',
});

class FakeMediaAudio extends EventTarget {
  paused = true;
  volume = 1;
  src = '';
  preload = 'none';
  playCalls = 0;
  pauseCalls = 0;
  failPlay = false;
  pendingPlay = false;
  load() {}
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
  play(): Promise<void> {
    this.playCalls += 1;
    if (this.failPlay) return Promise.reject(new Error('format rejected'));
    if (this.pendingPlay) return new Promise(() => {});
    this.paused = false;
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  }
  pause() {
    this.pauseCalls += 1;
    const wasPlaying = !this.paused;
    this.paused = true;
    if (wasPlaying) this.dispatchEvent(new Event('pause'));
  }
}

function setupRadio({
  client = { searchStations: async () => [station('station-1', 'Hard Rock One'), station('station-2', 'Metal Two')],
    countStationClick: async () => {} } as unknown as RadioBrowserClient,
  storage = new MemoryStorage(), audio = new FakeMediaAudio(), connectionTimeoutMs = 50,
}: { client?: RadioBrowserClient; storage?: MemoryStorage; audio?: FakeMediaAudio; connectionTimeoutMs?: number } = {}) {
  const preferences = new AudioPreferencesStore(storage);
  const events = new EventEmitter();
  let musicMode: AudioPreferences['musicSource'] = preferences.value.musicSource;
  const music = {
    get musicMode() { return musicMode; },
    setMusicSource(source: AudioPreferences['musicSource']) {
      musicMode = source;
      preferences.update({ musicSource: source });
      events.emit('music-source', source);
    },
  } as unknown as MenuMusic;
  const game = { events };
  const radio = new RiffshotRadio(game as never, music, preferences, { client, audio: audio as unknown as HTMLAudioElement, connectionTimeoutMs });
  return { radio, audio, preferences, events, music };
}

test('preferências: fonte, gênero, volumes, estação e intenção de tocar persistem e são limitados', () => {
  const storage = new MemoryStorage();
  const first = new AudioPreferencesStore(storage);
  first.update({ musicSource: 'radio', radioGenre: 'Heavy Metal', lastStationUuid: 'uuid-123',
    radioVolume: 0.47, gameMusicVolume: 1.4, effectsVolume: -0.2, radioWasPlaying: true, effectsMuted: true });
  const restored = new AudioPreferencesStore(storage);
  assert.deepEqual(restored.value, { version: 1, musicSource: 'radio', radioGenre: 'Heavy Metal',
    lastStationUuid: 'uuid-123', radioVolume: 0.47, gameMusicVolume: 1, effectsVolume: 0,
    radioWasPlaying: true, effectsMuted: true });
  assert.ok(storage.getItem(AUDIO_PREFERENCES_KEY));
  storage.setItem(AUDIO_PREFERENCES_KEY, '{broken');
  assert.equal(new AudioPreferencesStore(storage).value.musicSource, 'game');
});

test('Radio Browser: descobre mirrors HTTPS, filtra estações incompatíveis e pesquisa todos os gêneros', async () => {
  const requests: URL[] = [];
  const records = [
    { stationuuid: 'ok', name: 'Estação MP3', url_resolved: 'https://stream.test/live', homepage: 'https://station.test',
      tags: 'hard rock', codec: 'MP3', bitrate: 128, hls: 0, lastcheckok: 1 },
    { stationuuid: 'http', name: 'HTTP', url_resolved: 'http://stream.test/live', codec: 'MP3', hls: 0, lastcheckok: 1 },
    { stationuuid: 'broken', name: 'Offline', url_resolved: 'https://stream.test/offline', codec: 'MP3', hls: 0, lastcheckok: 0 },
    { stationuuid: 'hls', name: 'HLS', url_resolved: 'https://stream.test/live.m3u8', codec: 'MP3', hls: 1, lastcheckok: 1 },
    { stationuuid: 'codec', name: 'Unsupported', url_resolved: 'https://stream.test/live.flac', codec: 'FLAC', hls: 0, lastcheckok: 1 },
  ];
  const client = new RadioBrowserClient({ random: () => 0, fallbackServers: [], canPlayType: mime => mime === 'audio/mpeg' ? 'probably' : '',
    fetch: async input => {
      const url = new URL(String(input)); requests.push(url);
      return new Response(JSON.stringify(url.pathname.endsWith('/servers')
        ? [{ name: 'de1.api.radio-browser.info' }, { name: 'at1.api.radio-browser.info' }] : records),
      { status: 200, headers: { 'content-type': 'application/json' } });
    } });
  const found = await client.searchStations('Hard Rock');
  assert.deepEqual(found.map(item => item.stationuuid), ['ok']);
  assert.ok(found[0].url.startsWith('https://'));
  const searchUrl = requests.find(url => url.pathname.endsWith('/stations/search'))!;
  assert.equal(searchUrl.searchParams.get('tag'), 'hard rock');
  assert.equal(searchUrl.searchParams.get('hidebroken'), 'true');
  assert.equal(searchUrl.searchParams.get('is_https'), 'true');
  assert.equal(searchUrl.searchParams.get('limit'), '40');
  for (const genre of RADIO_GENRES) await client.searchStations(genre);
  assert.deepEqual(new Set(requests.filter(url => url.pathname.endsWith('/stations/search'))
    .map(url => url.searchParams.get('tag'))), new Set(RADIO_GENRES.map(genre => genre.toLowerCase())));
  await client.countStationClick(found[0]!);
  assert.ok(requests.some(url => url.pathname.endsWith('/json/url/ok')), 'cada início de reprodução registra o clique da estação');
  assert.ok(requests.some(url => url.hostname === 'at1.api.radio-browser.info')
    || requests.some(url => url.hostname === 'de1.api.radio-browser.info'));
});

test('Radio Browser: falha de um mirror tenta o seguinte, sem fixar a sessão em um único servidor', async () => {
  const hosts: string[] = [];
  const client = new RadioBrowserClient({ random: () => 0.99, fallbackServers: [], canPlayType: () => 'maybe', fetch: async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/servers')) return new Response(JSON.stringify([
      { name: 'down.api.radio-browser.info' }, { name: 'backup.api.radio-browser.info' }]), { status: 200 });
    hosts.push(url.hostname);
    if (url.hostname.startsWith('down.')) throw new Error('mirror indisponível');
    return new Response(JSON.stringify([{ stationuuid: 'live', name: 'Live', url_resolved: 'https://stream.test/live',
      codec: 'MP3', hls: 0, lastcheckok: 1 }]), { status: 200 });
  } });
  const found = await client.searchStations('Rock');
  assert.equal(found[0].stationuuid, 'live');
  assert.deepEqual(hosts, ['down.api.radio-browser.info', 'backup.api.radio-browser.info']);
});

test('player: sem autoplay, play/pause, troca de estação, volume separado e continuidade do serviço', async () => {
  let clicks = 0;
  const client = { searchStations: async () => [station('station-1', 'Hard Rock One'), station('station-2', 'Metal Two')],
    countStationClick: async () => { clicks += 1; } } as unknown as RadioBrowserClient;
  const { radio, audio, preferences, music } = setupRadio({ client });
  assert.equal(audio.playCalls, 0, 'restaurar/inicializar nunca inicia stream sozinho');
  await radio.searchStations('Hard Rock');
  assert.equal(radio.selectStation('station-1'), true);
  radio.setVolume(0.35);
  radio.playSelected();
  await Promise.resolve();
  assert.equal(audio.playCalls, 1);
  assert.equal(radio.state.status, 'playing');
  assert.equal(audio.volume, 0.35);
  assert.equal(music.musicMode, 'radio');
  assert.equal(preferences.value.radioWasPlaying, true);
  await radio.playAdjacent(1);
  assert.equal(radio.state.station?.stationuuid, 'station-2');
  assert.equal(radio.state.status, 'playing');
  assert.ok(clicks >= 2);
  music.setMusicSource('game');
  assert.equal(radio.state.status, 'paused');
  assert.equal(audio.paused, true);
  assert.equal(preferences.value.musicSource, 'game');
  assert.equal(preferences.value.radioWasPlaying, false);
  radio.destroy();
});

test('player: rejeição de stream informa indisponível e limita tentativas até escolher outra estação', async () => {
  const audio = new FakeMediaAudio(); audio.failPlay = true;
  const { radio } = setupRadio({ audio });
  await radio.searchStations('Classic Rock');
  radio.playSelected();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(radio.state.status, 'unavailable');
  assert.match(radio.state.playbackError, /navegador não conseguiu reproduzir/);
  radio.playSelected();
  await Promise.resolve(); await Promise.resolve();
  radio.playSelected();
  assert.match(radio.state.playbackError, /Limite de tentativas/);
  radio.selectStation('station-2');
  assert.equal(radio.state.status, 'idle');
  radio.destroy();
});

test('player: limite de conexão para uma estação que nunca inicia', async () => {
  const audio = new FakeMediaAudio(); audio.pendingPlay = true;
  const { radio } = setupRadio({ audio, connectionTimeoutMs: 5 });
  await radio.searchStations('80s Rock');
  radio.playSelected();
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(radio.state.status, 'unavailable');
  assert.match(radio.state.playbackError, /demorou para conectar/);
  radio.destroy();
});
