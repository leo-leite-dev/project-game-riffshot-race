import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { RaceEffectsAudio } from '../src/audio/RaceEffectsAudio.ts';
import type { EffectsParticipant } from '../src/audio/RaceEffectsAudio.ts';
import type { RaceEffectsAudioOptions } from '../src/audio/RaceEffectsAudio.ts';
import { RACE_AUDIO_ASSETS } from '../src/audio/raceAudioAssets.ts';
import type { RaceAudioSampleKind } from '../src/audio/raceAudioAssets.ts';
import type { CannonEvent } from '../src/race/RivalCannon.ts';

class Events {
  private listeners = new Map<string, Set<(event: Event) => void>>();
  hidden = false;
  focused = true;
  addEventListener(name: string, callback: (event: Event) => void) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(callback);
  }
  removeEventListener(name: string, callback: (event: Event) => void) { this.listeners.get(name)?.delete(callback); }
  dispatch(name: string) { for (const callback of this.listeners.get(name) ?? []) callback(new Event(name)); }
  hasFocus() { return this.focused; }
  get listenerCount() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}

class Param {
  value = 0;
  target = 0;
  response = 0;
  queue: number[] = [];
  constructor(private context: Context) {}
  cancelScheduledValues() { this.queue.length = 0; }
  setValueAtTime(value: number, time: number) {
    assert.ok(Number.isFinite(value) && Number.isFinite(time));
    this.value = value;
    this.target = value;
    this.queue.push(value);
  }
  setTargetAtTime(value: number, time: number, response: number) {
    if (this.context.failure === 'automation') throw Error('automation');
    assert.ok(Number.isFinite(value) && Number.isFinite(time) && response > 0);
    this.target = value;
    this.response = response;
    this.queue.push(value);
  }
}

class Buffer {
  readonly samples: Float32Array;
  readonly duration: number;
  constructor(length: number, readonly sampleRate: number) {
    this.samples = new Float32Array(length);
    this.duration = length / sampleRate;
  }
  getChannelData() { return this.samples; }
}

class Node {
  gain: Param;
  frequency: Param;
  Q: Param;
  playbackRate: Param;
  type = '';
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  buffer: Buffer | null = null;
  started = false;
  disconnected = false;
  stopCalls = 0;
  endTime = Infinity;
  onended: (() => void) | null = null;
  connections = new Set<Node | object>();
  constructor(readonly context: Context, readonly kind: string) {
    this.gain = new Param(context);
    this.frequency = new Param(context);
    this.Q = new Param(context);
    this.playbackRate = new Param(context);
  }
  connect(node: Node | object) {
    if (this.context.failure === 'connect') throw Error('connect');
    this.connections.add(node);
    return node;
  }
  disconnect() { this.connections.clear(); this.disconnected = true; }
  start() {
    if (this.context.failure === 'start') throw Error('start');
    this.started = true;
    this.endTime = this.context.currentTime + (this.loop ? Infinity : this.buffer?.duration ?? 0);
    const playing = this.context.created.filter(node => node.kind === 'source' && node.started);
    this.context.peakShots = Math.max(this.context.peakShots, playing.filter(node => !node.loop).length);
    this.context.peakSkids = Math.max(this.context.peakSkids, playing.filter(node => node.loop).length);
  }
  stop() { this.stopCalls += 1; this.started = false; this.onended?.(); }
  end() { this.started = false; this.onended?.(); }
}

class Context extends Events {
  state: AudioContextState = 'running';
  currentTime = 0;
  created: Node[] = [];
  buffers: Buffer[] = [];
  destination = {};
  failure = '';
  closeCalls = 0;
  resumeCalls = 0;
  peakShots = 0;
  peakSkids = 0;
  create(kind: string) {
    if (this.failure === kind) throw Error(kind);
    const node = new Node(this, kind);
    this.created.push(node);
    return node;
  }
  createGain() { return this.create('gain'); }
  createBufferSource() { return this.create('source'); }
  createBiquadFilter() { return this.create('filter'); }
  createBuffer(channels: number, length: number, sampleRate: number) {
    if (this.failure === 'buffer') throw Error('buffer');
    assert.equal(channels, 1);
    const buffer = new Buffer(length, sampleRate);
    this.buffers.push(buffer);
    return buffer;
  }
  setState(state: AudioContextState) { this.state = state; this.dispatch('statechange'); }
  advance(time: number) {
    this.currentTime = time;
    for (const node of this.created) if (node.started && node.endTime <= time) node.end();
  }
  close() { this.closeCalls += 1; }
  resume() { this.resumeCalls += 1; }
}

const asAudioBuffer = (buffer: Buffer): AudioBuffer => buffer as unknown as AudioBuffer;
class DecodingContext extends Context {
  decodeInputs: ArrayBuffer[] = [];
  decodeFailure = false;
  decodeDuration = 0.4;
  decodeWith?: (bytes: ArrayBuffer) => Promise<AudioBuffer>;
  async decodeAudioData(bytes: ArrayBuffer): Promise<AudioBuffer> {
    this.decodeInputs.push(bytes);
    if (this.decodeFailure) throw Error('private decoder message must not escape');
    if (this.decodeWith) return this.decodeWith(bytes);
    return asAudioBuffer(new Buffer(Math.round(22050 * this.decodeDuration), 22050));
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const flushSamples = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };
const sampleBuffers = (): Record<RaceAudioSampleKind, Buffer> => ({
  shot: new Buffer(44100, 22050), hit: new Buffer(8820, 22050), skid: new Buffer(71663, 22050),
});

function environment(t: TestContext, context: Context | null = new Context(), muted = false) {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  const window = new Events(), document = new Events();
  globalThis.window = window as unknown as Window & typeof globalThis;
  globalThis.document = document as unknown as Document;
  const game = { sound: { context }, events: new EventEmitter(), menuMusic: { getAudioState: () => ({ muted }) } };
  const create = (participants: readonly EffectsParticipant[] = [], options: RaceEffectsAudioOptions = {}) => new RaceEffectsAudio(
    game as unknown as ConstructorParameters<typeof RaceEffectsAudio>[0], participants, { allowSamples: true, ...options });
  t.after(() => {
    game.events.emit('destroy');
    globalThis.window = oldWindow;
    globalThis.document = oldDocument;
  });
  return { context, game, window, document, create };
}
const car = (extra: Partial<EffectsParticipant> = {}): EffectsParticipant => ({ id: 'player', isPlayer: true,
  x: 0, z: 0, heading: 0, velocityX: 0, velocityZ: 0, health: 100, destroyed: false,
  destructionSequence: 0, ...extra });
const event = (id: number, time: number, kind: CannonEvent['kind'] = 'shot', extra: Partial<CannonEvent> = {}): CannonEvent =>
  Object.freeze({ id, projectileId: id, kind, time, x: 0, y: 1, z: 0, dirX: 0, dirZ: 1, ownerId: 'player', ...extra });
const released = (context: Context) => {
  assert.ok(context.created.every(node => node.disconnected && !node.started && node.onended === null));
  assert.equal(context.closeCalls, 0);
  assert.equal(context.resumeCalls, 0);
};
const counts = (audio: RaceEffectsAudio) => {
  const { shots, impacts, explosions } = audio.diagnostics;
  return { shots, impacts, explosions };
};

test('samples MP3: descritores canônicos, fetch same-origin e decode no contexto Phaser uma única vez', async t => {
  assert.deepEqual(RACE_AUDIO_ASSETS.map(({ kind, sourceFileName, fileName, url }) => [kind, sourceFileName, fileName, url]), [
    ['shot', 'canhão_disparo_windowmaker.mp3', 'canhao_disparo_windowmaker.mp3', '/__local-audio/canhao_disparo_windowmaker.mp3'],
    ['hit', 'impacto_disparo.mp3', 'impacto_disparo.mp3', '/__local-audio/impacto_disparo.mp3'],
    ['skid', 'pneu_derrapando.mp3', 'pneu_derrapando.mp3', '/__local-audio/pneu_derrapando.mp3'],
  ]);
  assert.ok(Object.isFrozen(RACE_AUDIO_ASSETS) && RACE_AUDIO_ASSETS.every(Object.isFrozen));
  const context = new DecodingContext(), { create } = environment(t, context);
  const requests: string[] = [], payloads: ArrayBuffer[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    requests.push(url);
    assert.equal(options.mode, 'same-origin');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    const bytes = new Uint8Array([requests.length]).buffer;
    payloads.push(bytes);
    return { ok: true, arrayBuffer: async () => bytes };
  });
  const audio = create();
  const ready = audio.samplesReady;
  assert.equal(ready, audio.prepareSamples());
  await ready;
  assert.deepEqual(requests, RACE_AUDIO_ASSETS.map(asset => asset.url));
  assert.deepEqual(context.decodeInputs, payloads);
  assert.equal(audio.diagnostics.sampleStatus, 'ready');
  assert.equal(audio.diagnostics.decodedSamples, 3);
  assert.equal(audio.diagnostics.sampleLoadAttempts, 3);
  assert.equal(audio.diagnostics.sampleErrorCount, 0);
  assert.deepEqual(audio.diagnostics.sampleFaults, {});
  assert.equal(audio.outputNode, null); // Loading alone never creates playback nodes.
  assert.equal(context.created.length, 0);
  for (let frame = 0; frame < 5; frame += 1) audio.update([], 'racing', frame / 60);
  await audio.prepareSamples();
  assert.equal(requests.length, 3);
  assert.equal(context.decodeInputs.length, 3);
  audio.destroy();
  released(context);
});

test('samples MP3: produção não busca arquivos privados e conserva os efeitos procedurais', async t => {
  const { create } = environment(t);
  let fetchAttempts = 0;
  t.mock.method(globalThis, 'fetch', async () => { fetchAttempts += 1; throw new Error('fetch privado inesperado'); });
  const audio = create([], { allowSamples: false });
  await audio.samplesReady;
  assert.equal(audio.diagnostics.sampleStatus, 'fallback');
  assert.equal(audio.diagnostics.sampleLoadAttempts, 0);
  assert.equal(fetchAttempts, 0);
  audio.update([car()], 'racing', 1, [event(1, 1, 'shot')]);
  assert.equal(audio.diagnostics.shots, 1);
  assert.equal(audio.diagnostics.generatedBuffers, 4);
  audio.destroy();
});

test('samples MP3: vozes reutilizam identidades decodificadas, skid integral para jogador/NPC e limpeza natural', async t => {
  const context = new Context(), { create } = environment(t, context);
  const samples = sampleBuffers(), calls: RaceAudioSampleKind[] = [];
  const driver = car({ vx: 12, vz: 20 });
  const bot = car({ id: 'bot', isPlayer: false, x: 40, vx: 12, vz: 20 });
  const cars = [driver, bot];
  const audio = create(cars, { loadSample: async (asset, shared, signal) => {
    assert.equal(shared as unknown, context);
    assert.equal(signal.aborted, false);
    calls.push(asset.kind);
    return asAudioBuffer(samples[asset.kind]);
  } });
  await audio.samplesReady;
  audio.update(cars, 'racing', 0, [event(1, 0), event(2, 0, 'hit', { targetId: 'player' })]);
  const sources = context.created.filter(node => node.kind === 'source');
  assert.equal(sources[0].buffer, samples.shot);
  assert.equal(sources[1].buffer, samples.hit);
  assert.equal(sources.filter(source => source.loop).length, 2);
  for (const source of sources.filter(source => source.loop)) {
    assert.equal(source.buffer, samples.skid);
    assert.equal(source.loopStart, 0);
    assert.equal(source.loopEnd, samples.skid.duration);
    assert.equal(source.playbackRate.value, 1);
    assert.ok(source.playbackRate.target >= 0.95 && source.playbackRate.target <= 1.05);
  }
  assert.ok(context.created.filter(node => node.kind === 'filter').every(node => node.type === 'allpass'));
  const levels = audio.diagnostics.voices;
  assert.ok(levels[0].targetLevel > levels[1].targetLevel);
  context.advance(0.5);
  assert.equal(audio.diagnostics.activeShots, 1); // Hit ended; the longer original shot is still playing.
  assert.ok(sources[1].disconnected && sources[1].onended === null);
  context.advance(3);
  assert.equal(audio.diagnostics.activeShots, 0);
  audio.update(cars, 'racing', 3, [event(3, 3), event(4, 3, 'hit', { targetId: 'player' })]);
  const repeated = context.created.filter(node => node.kind === 'source' && !node.loop).slice(-2);
  assert.equal(repeated[0].buffer, samples.shot);
  assert.equal(repeated[1].buffer, samples.hit);
  bot._visualImpact = 8;
  audio.update(cars, 'racing', 3.1);
  audio.update(cars, 'racing', 3.17);
  const collision = context.created.filter(node => node.kind === 'source').at(-1)!;
  assert.equal(audio.diagnostics.collisionImpacts, 1);
  assert.ok(!Object.values(samples).includes(collision.buffer!));
  driver.destroyed = true; driver.destructionSequence = 1;
  audio.update(cars, 'racing', 3.2);
  const explosion = context.created.filter(node => node.kind === 'source').at(-1)!;
  assert.equal(audio.diagnostics.explosions, 1);
  assert.notEqual(explosion.buffer, collision.buffer);
  assert.ok(!Object.values(samples).includes(explosion.buffer!));
  assert.equal(audio.diagnostics.generatedBuffers, 4);
  assert.equal(audio.diagnostics.decodedSamples, 3);
  assert.deepEqual(calls, ['shot', 'hit', 'skid']);
  for (const asset of RACE_AUDIO_ASSETS) assert.equal(audio.diagnostics.sampleSources[asset.kind], asset.url);
  assert.equal(audio.diagnostics.sampleSources.collision, 'procedural');
  assert.equal(audio.diagnostics.sampleSources.explosion, 'procedural');
  audio.destroy();
  assert.equal(audio.diagnostics.decodedSamples, 0);
  released(context);
});

test('samples MP3: decode tardio troca somente o loop ativo no próximo update, sem replay de one-shots', async t => {
  const context = new Context(), { create } = environment(t, context);
  const samples = sampleBuffers(), pending = deferred<AudioBuffer>();
  const driver = car({ vx: 12, vz: 20 }), audio = create([driver], { loadSample: () => pending.promise });
  audio.update([driver], 'racing', 0, [event(1, 0), event(2, 0, 'hit')]);
  const fallbackLoop = context.created.find(node => node.loop)!;
  const fallbackShot = context.created.find(node => node.kind === 'source' && !node.loop)!;
  assert.equal(fallbackLoop.loopStart, 0.025);
  const nodesBefore = audio.diagnostics.createdNodes;
  pending.resolve(asAudioBuffer(samples.skid));
  await audio.samplesReady;
  assert.equal(audio.diagnostics.createdNodes, nodesBefore);
  assert.equal(audio.diagnostics.shots, 1);
  assert.equal(audio.diagnostics.impacts, 1);
  assert.ok(fallbackLoop.started && fallbackShot.started);
  audio.update([driver], 'racing', 0.1);
  assert.ok(fallbackLoop.disconnected && !fallbackLoop.started);
  const sampleLoop = context.created.filter(node => node.loop).at(-1)!;
  assert.equal(sampleLoop.buffer, samples.skid);
  assert.equal(sampleLoop.loopStart, 0);
  assert.equal(context.peakSkids, 1);
  assert.equal(audio.diagnostics.activeShots, 2);
  assert.equal(audio.diagnostics.shots, 1);
  assert.equal(audio.diagnostics.impacts, 1);
  audio.destroy();
  released(context);
});

test('samples MP3: falhas fetch/decode/buffer têm fallback por asset, diagnóstico seguro e nenhum retry por frame', async t => {
  const { create, game } = environment(t);
  // Use the native fetch/decode route without any network I/O.
  let mode = '';
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (mode === 'fetch') throw Error('private fetch message must not escape');
    return {
      ok: mode !== 'http' && !(mode === 'partial' && url.endsWith('/impacto_disparo.mp3')),
      arrayBuffer: async () => {
        if (mode === 'body') throw Error('private response message must not escape');
        return new ArrayBuffer(2);
      },
    };
  });
  for (const failure of ['fetch', 'http', 'body', 'decode', 'invalid-buffer', 'partial']) {
    mode = failure;
    const context = new DecodingContext();
    context.decodeFailure = failure === 'decode';
    if (failure === 'invalid-buffer') context.decodeDuration = 0;
    game.sound.context = context;
    const driver = car({ vx: 12, vz: 20 });
    const audio = create([driver]);
    const calls = fetchMock.mock.callCount();
    await assert.doesNotReject(audio.samplesReady);
    assert.equal(audio.diagnostics.sampleStatus, failure === 'partial' ? 'partial' : 'fallback');
    assert.equal(audio.diagnostics.decodedSamples, failure === 'partial' ? 2 : 0);
    assert.equal(audio.diagnostics.sampleErrorCount, failure === 'partial' ? 1 : 3);
    const expectedFault = failure === 'decode' ? 'decode' : failure === 'invalid-buffer' ? 'invalid-buffer' : 'fetch';
    assert.equal(audio.diagnostics.sampleFaults.hit, expectedFault);
    assert.equal(audio.diagnostics.sampleSources.hit, 'procedural');
    assert.equal(JSON.stringify(audio.diagnostics).includes('private'), false);
    assert.doesNotThrow(() => audio.update([driver], 'racing', 0, [event(1, 0), event(2, 0, 'hit')]));
    assert.equal(audio.diagnostics.shots, 1);
    assert.equal(audio.diagnostics.impacts, 1);
    assert.equal(audio.diagnostics.skidVoices, 1);
    assert.equal(audio.diagnostics.errorCount, 0);
    assert.equal(audio.diagnostics.unavailable, false);
    audio.update([driver], 'racing', 0.1);
    await audio.prepareSamples();
    assert.equal(fetchMock.mock.callCount(), calls);
    audio.destroy();
    released(context);
  }
  // An explicitly injected loader may fail too; it must never reject readiness.
  const optional = create([], { loadSample: () => { throw Error('private optional loader'); } });
  await optional.samplesReady;
  assert.equal(optional.diagnostics.sampleErrorCount, 3);
  assert.equal(optional.diagnostics.sampleFaults.shot, 'loader');
  optional.destroy();
});

test('samples MP3: sem decoder/contexto não faz fetch e mantém API de fallback', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', () => { throw Error('network is forbidden in this fixture'); });
  const closed = new Context(); closed.state = 'closed';
  const { create, game } = environment(t);
  for (const context of [new Context(), null, closed]) {
    game.sound.context = context;
    const audio = create();
    await audio.prepareSamples();
    assert.equal(audio.diagnostics.sampleLoadAttempts, 0);
    assert.equal(audio.diagnostics.decodedSamples, 0);
    assert.equal(audio.diagnostics.sampleStatus, 'fallback');
    assert.equal(audio.diagnostics.sampleFaults.shot, context && context.state !== 'closed' ? 'decode-unsupported' : 'context-unavailable');
    audio.update([], 'racing', 0, [event(1, 0)]);
    assert.equal(audio.diagnostics.shots, context?.state === 'running' ? 1 : 0);
    audio.destroy();
    await audio.prepareSamples();
    if (context) released(context);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('samples MP3: destroy aborta fetch, resolve readiness e ignora decode tardio mesmo com sucesso parcial', async t => {
  const context = new DecodingContext(), { create, game } = environment(t, context);
  const signals: AbortSignal[] = [];
  const fetchMock = t.mock.method(globalThis, 'fetch', (_url: string, options: RequestInit) => {
    const signal = options.signal as AbortSignal;
    signals.push(signal);
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }));
  });
  const audio = create(), ready = audio.samplesReady;
  audio.destroy(); audio.destroy();
  await ready;
  await flushSamples();
  assert.ok(signals.length === 3 && signals.every(signal => signal.aborted));
  assert.equal(context.decodeInputs.length, 0);
  assert.equal(audio.diagnostics.sampleStatus, 'aborted');
  assert.equal(audio.diagnostics.sampleErrorCount, 0);
  assert.equal(audio.diagnostics.decodedSamples, 0);
  await audio.prepareSamples();
  assert.equal(fetchMock.mock.callCount(), 3);
  released(context);

  const decoding = new DecodingContext(), deferredDecodes = Array.from({ length: 3 }, () => deferred<AudioBuffer>());
  let decodeIndex = 0;
  decoding.decodeWith = () => deferredDecodes[decodeIndex++].promise;
  game.sound.context = decoding;
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(2) }));
  const late = create();
  await flushSamples();
  assert.equal(decodeIndex, 3);
  deferredDecodes[0].resolve(asAudioBuffer(sampleBuffers().shot));
  await flushSamples();
  assert.equal(late.diagnostics.decodedSamples, 1);
  game.events.emit('destroy');
  await late.samplesReady; // Does not await the two decoders which ignore cancellation.
  assert.equal(late.diagnostics.decodedSamples, 0);
  deferredDecodes[1].reject(Error('private late decoder failure'));
  deferredDecodes[2].resolve(asAudioBuffer(sampleBuffers().skid));
  await flushSamples();
  assert.equal(late.diagnostics.sampleStatus, 'aborted');
  assert.equal(late.diagnostics.decodedSamples, 0);
  assert.equal(late.diagnostics.sampleErrorCount, 0);
  assert.equal(late.diagnostics.nodes, 0);
  assert.equal(late.outputNode, null);
  released(decoding);
});

test('samples MP3: carregamento termina durante mute/suspensão sem iniciar fontes nem reproduzir histórico', async t => {
  const context = new Context(); context.state = 'suspended';
  const { create, game } = environment(t, context, true);
  const pending = deferred<AudioBuffer>(), samples = sampleBuffers();
  const driver = car({ vx: 12, vz: 20 }), audio = create([driver], { loadSample: () => pending.promise });
  audio.update([driver], 'racing', 0, [event(1, 0), event(2, 0, 'hit')]);
  pending.resolve(asAudioBuffer(samples.skid));
  await audio.samplesReady;
  assert.equal(audio.diagnostics.sampleStatus, 'ready');
  assert.equal(audio.diagnostics.decodedSamples, 3);
  assert.equal(context.created.length, 0);
  assert.equal(audio.diagnostics.generatedBuffers, 0);
  context.setState('running');
  game.events.emit('audio-state', false);
  audio.update([driver], 'racing', 1, [event(3, 1), event(4, 1, 'hit')]);
  assert.equal(audio.diagnostics.activeShots, 0);
  assert.equal(audio.diagnostics.shots, 0);
  assert.equal(audio.diagnostics.impacts, 0);
  assert.equal(context.created.find(node => node.loop)!.buffer, samples.skid);
  audio.update([driver], 'racing', 1.1, [event(5, 1.1)]);
  assert.equal(audio.diagnostics.shots, 1);
  assert.equal(audio.diagnostics.sampleLoadAttempts, 3);
  audio.destroy();
  released(context);
});

test('efeitos: eventos readonly frescos, IDs duplicados, stale, futuro, inválidos e expire', t => {
  const { create } = environment(t);
  const participants = Object.freeze([Object.freeze(car())]), audio = create(participants);
  const events = Object.freeze([event(1, 9), event(2, 9.8), event(3, 9.6, 'hit'),
    event(4, 9.9, 'expire'), event(5, 11), event(6, NaN), event(7, 10, 'shot', { x: Infinity }),
    event(8, 9.4, 'hit'), event(9, 10, 'hit')]);
  audio.update(participants, 'racing', 10, events);
  assert.deepEqual(counts(audio), { shots: 1, impacts: 2, explosions: 0 });
  assert.equal(audio.diagnostics.discardedEvents, 6);
  assert.equal(audio.diagnostics.activeShots, 3);
  audio.update(participants, 'racing', 10, events);
  audio.update(participants, 'racing', 11, [event(5, 11), event(0, 11), event(NaN, 11)]);
  assert.deepEqual(counts(audio), { shots: 1, impacts: 2, explosions: 0 });
  assert.equal(audio.diagnostics.lastEventId, 9);
});

test('efeitos: quatro buffers originais finitos, distintos e reutilizados; onended libera nós naturalmente', t => {
  const context = new Context(), { create } = environment(t, context);
  const driver = car(), audio = create([driver]);
  audio.update([driver], 'racing', 0, [event(1, 0), event(2, 0, 'hit')]);
  assert.ok(audio.outputNode);
  assert.equal(audio.diagnostics.generatedBuffers, 4);
  assert.equal(context.buffers.length, 4);
  const signatures = context.buffers.map(buffer => {
    assert.ok(buffer.samples.every(sample => Number.isFinite(sample) && Math.abs(sample) <= 0.91));
    const energy = buffer.samples.reduce((sum, sample) => sum + sample * sample, 0);
    assert.ok(energy > 1);
    return `${buffer.duration}:${energy}`;
  });
  assert.equal(new Set(signatures).size, 4);
  const sources = context.created.filter(node => node.kind === 'source');
  assert.notEqual(sources[0].buffer, sources[1].buffer);
  const output = audio.outputNode;
  context.advance(2); // Actual source completion, no update or cleanup timer needed.
  assert.equal(audio.diagnostics.activeShots, 0);
  assert.equal(audio.diagnostics.nodes, 1);
  assert.ok(sources.every(node => node.disconnected && !node.onended && node.stopCalls === 0));
  audio.update([driver], 'racing', 2, [event(3, 2)]);
  assert.equal(context.created.at(-2)!.buffer, sources[0].buffer);
  assert.equal(audio.outputNode, output);
  assert.equal(context.buffers.length, 4);
  audio.destroy();
  assert.equal(audio.outputNode, null);
  released(context);
});

test('efeitos: oito one-shots no máximo, excesso descartado sem backlog e contagens só de sons iniciados', t => {
  const context = new Context(), { create } = environment(t, context);
  const audio = create();
  audio.update([], 'running', 1, Array.from({ length: 20 }, (_, i) => event(i + 1, 1, i % 2 ? 'hit' : 'shot')));
  assert.deepEqual(counts(audio), { shots: 4, impacts: 4, explosions: 0 });
  assert.equal(audio.diagnostics.activeShots, 8);
  assert.equal(audio.diagnostics.droppedOneShots, 12);
  assert.equal(context.peakShots, 8);
  assert.equal(audio.diagnostics.nodes, 17);
  context.advance(2);
  audio.update([], 'racing', 2);
  assert.equal(audio.diagnostics.activeShots, 0);
  assert.equal(audio.diagnostics.shots, 4);
  audio.update([], 'racing', 2, [event(21, 2)]);
  assert.equal(audio.diagnostics.shots, 5);
});

test('efeitos: limites simultâneos de tiros, impactos, explosões e skid; hit sem jogador não é local', t => {
  const context = new Context(), { create } = environment(t, context);
  const cars = Array.from({ length: 4 }, (_, i) => car({ id: `car-${i}`, isPlayer: i === 0, vx: 12, vz: 20 }));
  const audio = create(cars);
  audio.update(cars, 'racing', 0);
  for (const car of cars) { car.destroyed = true; car.destructionSequence = 1; }
  audio.update(cars, 'racing', 0.1, Array.from({ length: 8 }, (_, i) => event(i + 1, 0.1, i % 2 ? 'hit' : 'shot')));
  for (const car of cars) car.destroyed = false;
  audio.update(cars, 'racing', 0.2);
  assert.deepEqual(counts(audio), { shots: 2, impacts: 2, explosions: 4 });
  assert.equal(audio.diagnostics.activeShots, 8);
  assert.equal(audio.diagnostics.skidVoices, 4);
  assert.equal(audio.diagnostics.nodes, 29); // 1 master + 8 * 2 one-shot + 4 * 3 skid.
  assert.equal(context.peakShots, 8);
  assert.equal(context.peakSkids, 4);
  assert.equal(audio.diagnostics.droppedOneShots, 4);
  audio.destroy();
  released(context);
  const distant = create();
  distant.update([], 'racing', 1, [event(1, 1, 'hit')]);
  assert.ok(context.created.at(-1)!.gain.value < 0.52);
});

test('efeitos: destruição por sequência, sem replay de morto inicial, respawn ou entrada tardia', t => {
  const { create } = environment(t);
  const driver = car({ destroyed: true, destructionSequence: 3 });
  const audio = create([driver]);
  audio.update([driver], 'racing', 1);
  assert.equal(audio.diagnostics.explosions, 0);
  driver.destroyed = false;
  audio.update([driver], 'racing', 2);
  driver.destroyed = true; driver.destructionSequence = 4;
  audio.update([driver], 'racing', 3);
  audio.update([driver], 'racing', 4);
  assert.equal(audio.diagnostics.explosions, 1);
  // Observing an already respawned sequence consumes it, even if later marked dead.
  driver.destroyed = false; driver.destructionSequence = 5;
  audio.update([driver], 'racing', 5);
  driver.destroyed = true;
  audio.update([driver], 'racing', 6);
  const join = car({ id: 'join', destroyed: true, destructionSequence: 9 });
  audio.update([driver, join], 'racing', 7);
  assert.equal(audio.diagnostics.explosions, 1);
  join.destructionSequence = 10;
  audio.update([driver, join], 'racing', 8);
  assert.equal(audio.diagnostics.explosions, 2);
  audio.update([], 'racing', 9);
  audio.update([join], 'racing', 10);
  assert.equal(audio.diagnostics.explosions, 2);
});

test('efeitos: colisão procedural respeita limiar, baseline, decay, rearme, cooldown e pool compartilhado', t => {
  const context = new Context(), { create } = environment(t, context);
  const driver = car({ _visualImpact: 9 });
  const bot = car({ id: 'wall-bot', isPlayer: false, x: 70, _visualImpact: 0 });
  const cars = Object.freeze([driver, bot]), audio = create(cars);
  const step = (time: number, impact: number, botImpact = 0) => {
    driver._visualImpact = impact; bot._visualImpact = botImpact;
    audio.update(cars, 'racing', time);
    assert.equal(driver._visualImpact, impact); // Audio only observes the physics value.
  };
  audio.update(cars, 'racing', 0);
  step(0.01, 2.9);
  step(0.02, 0);
  step(0.1, 3.2, 8);
  step(0.14, 3.1, 7);
  assert.equal(audio.diagnostics.collisionImpacts, 0); // Short cannon-precedence grace.
  step(0.17, 3, 6);
  assert.equal(audio.diagnostics.collisionImpacts, 2);
  assert.equal(audio.diagnostics.impacts, 0); // Cannon counts keep their original meaning.
  const sources = context.created.filter(node => node.kind === 'source');
  assert.equal(sources[0].buffer, sources[1].buffer);
  const playerGain = [...sources[0].connections][0] as Node;
  const botGain = [...sources[1].connections][0] as Node;
  assert.ok(botGain.gain.value < playerGain.gain.value);
  step(0.25, 2.5, 5);
  step(0.3, 3, 4); // Rising while not rearmed cannot repeat the crack.
  step(0.31, 0);
  step(0.32, 8); // Rearmed, but still inside the per-car 0.3 s cooldown.
  step(0.5, 8);
  assert.equal(audio.diagnostics.collisionImpacts, 2);
  step(0.55, 0);
  step(0.6, 8);
  step(0.67, 7);
  assert.equal(audio.diagnostics.collisionImpacts, 3);
  step(0.7, 0);
  step(0.95, 8);
  step(1.4, 4); // An overdue candidate is dropped, never replayed after a long gap.
  assert.equal(audio.diagnostics.collisionImpacts, 3);
  context.advance(2);
  step(1.5, 0);
  step(1.6, 8);
  audio.update(cars, 'racing', 1.67, Array.from({ length: 8 }, (_, i) => event(i + 1, 1.67)));
  assert.equal(audio.diagnostics.activeShots, 8);
  assert.equal(audio.diagnostics.droppedOneShots, 1);
  assert.equal(audio.diagnostics.collisionImpacts, 3);
  context.advance(3);
  step(2, 7);
  assert.equal(audio.diagnostics.collisionImpacts, 3);
  assert.equal(audio.diagnostics.generatedBuffers, 4);
  audio.destroy();
  released(context);
});

test('efeitos: colisão procedural cede ao hit do canhão no mesmo frame, entre frames e por shotImpactSequence', t => {
  const { create } = environment(t);
  const driver = car({ _visualImpact: 0, shotImpactSequence: 0 });
  const bot = car({ id: 'other', isPlayer: false, _visualImpact: 0 });
  const cars = [driver, bot], audio = create(cars);
  audio.update(cars, 'racing', 0);
  driver._visualImpact = 6; // A 20 HP projectile raises this visual value to 6.
  audio.update(cars, 'racing', 0.1, [event(1, 0.1, 'hit', { targetId: 'player' })]);
  audio.update(cars, 'racing', 0.17);
  assert.equal(audio.diagnostics.impacts, 1);
  assert.equal(audio.diagnostics.collisionImpacts, 0);
  driver._visualImpact = 0;
  audio.update(cars, 'racing', 0.5);
  driver._visualImpact = 6; bot._visualImpact = 8;
  audio.update(cars, 'racing', 0.6); // Telemetry observed before the event arrives.
  audio.update(cars, 'racing', 0.63, [event(2, 0.6, 'hit', { targetId: 'player' })]);
  audio.update(cars, 'racing', 0.7);
  assert.equal(audio.diagnostics.impacts, 2);
  assert.equal(audio.diagnostics.collisionImpacts, 1); // The unrelated bot still collides.
  driver._visualImpact = 0; bot._visualImpact = 0;
  audio.update(cars, 'racing', 0.9);
  driver._visualImpact = 6; driver.shotImpactSequence = 1;
  audio.update(cars, 'racing', 1);
  audio.update(cars, 'racing', 1.1); // Sequence guard also covers a longer event delay.
  assert.equal(audio.diagnostics.collisionImpacts, 1);
  audio.update(cars, 'racing', 1.2, [event(3, 1, 'hit', { targetId: 'player' })]);
  assert.equal(audio.diagnostics.impacts, 3);
  driver._visualImpact = 0;
  audio.update(cars, 'racing', 1.5);
  driver._visualImpact = 6;
  audio.update(cars, 'racing', 1.6, [event(3, 1, 'hit', { targetId: 'player' })]);
  audio.update(cars, 'racing', 1.7);
  assert.equal(audio.diagnostics.impacts, 3); // Duplicate/stale cannon hits have no fallback crack.
  assert.equal(audio.diagnostics.collisionImpacts, 1);
});

test('efeitos: colisão procedural descarta candidatos e histórico em mute, suspensão e frames ignorados', t => {
  const context = new Context(), { create, game } = environment(t, context);
  for (const mode of ['mute', 'suspended', 'waiting', 'invalid']) {
    const driver = car({ _visualImpact: 0 }), audio = create([driver]);
    audio.update([driver], 'racing', 0);
    driver._visualImpact = 8;
    audio.update([driver], 'racing', 0.1);
    assert.equal(audio.diagnostics.collisionImpacts, 0);
    if (mode === 'mute') game.events.emit('audio-state', true);
    if (mode === 'suspended') context.setState('suspended');
    if (mode === 'waiting') audio.update([driver], 'waiting', 0.2);
    if (mode === 'invalid') audio.update([driver], 'racing', NaN);
    driver._visualImpact = 14; // More physics history, with no audible frame in between.
    if (mode === 'mute') game.events.emit('audio-state', false);
    if (mode === 'suspended') context.setState('running');
    audio.update([driver], 'racing', 1);
    audio.update([driver], 'racing', 1.1);
    assert.equal(audio.diagnostics.collisionImpacts, 0, mode);
    assert.equal(audio.diagnostics.activeShots, 0, mode);
    driver._visualImpact = 0;
    audio.update([driver], 'racing', 1.2);
    driver._visualImpact = 8;
    audio.update([driver], 'racing', 1.4);
    audio.update([driver], 'racing', 1.47);
    assert.equal(audio.diagnostics.collisionImpacts, 1, mode);
    driver._visualImpact = 0;
    audio.update([driver], 'racing', 1.8);
    driver._visualImpact = 8;
    audio.update([driver], 'racing', 1.9);
    driver.destroyed = true;
    audio.update([driver], 'racing', 2);
    driver.destroyed = false;
    audio.update([driver], 'racing', 2.1);
    assert.equal(audio.diagnostics.collisionImpacts, 1, mode);
    audio.destroy(); audio.destroy();
  }
  released(context);
});

test('efeitos: skid usa projeção lateral, velocidade real e limiares; curva e liberação suaves', t => {
  const context = new Context(), { create } = environment(t, context);
  const driver = car(), audio = create([driver]);
  audio.update([driver], 'racing', 0);
  for (const motion of [{ velocityX: 4, velocityZ: 20 }, { velocityX: 6, velocityZ: 0 },
    { velocityX: 0, velocityZ: 30 }, { heading: Math.PI / 2, velocityX: 30, velocityZ: 0 }]) {
    Object.assign(driver, { heading: 0 }, motion);
    audio.update([driver], 'racing', 0.1);
    assert.equal(audio.diagnostics.skidVoices, 0);
  }
  Object.assign(driver, { heading: Math.PI / 2, velocityX: 20, velocityZ: 10 });
  audio.update([driver], 'racing', 0.2);
  const voice = audio.diagnostics.voices[0];
  assert.ok(Math.abs(voice.lateralSpeed - 10) < 1e-10);
  assert.ok(voice.level > 0 && voice.level < voice.targetLevel);
  const source = context.created.find(node => node.loop)!;
  const filter = context.created.find(node => node.kind === 'filter')!;
  assert.equal(filter.type, 'bandpass');
  assert.equal(source.loopStart, 0.025);
  assert.ok(source.playbackRate.target > 0.85);
  const filterLow = filter.frequency.target;
  driver.velocityZ = 16;
  audio.update([driver], 'racing', 0.3);
  assert.ok(filter.frequency.target > filterLow);
  assert.ok(audio.diagnostics.voices[0].targetLevel > voice.targetLevel);
  driver.velocityZ = 0;
  audio.update([driver], 'racing', 0.4);
  assert.equal(audio.diagnostics.voices[0].targetLevel, 0);
  assert.ok(audio.diagnostics.skidLevels[0] > 0);
  audio.update([driver], 'racing', 2);
  audio.update([driver], 'racing', 2.1);
  assert.equal(audio.diagnostics.skidVoices, 0);
  assert.ok(source.disconnected && !source.started);
});

test('efeitos: envelope de skid independente de FPS, nós reutilizados e filas de automação limitadas', t => {
  const context = new Context(), { create } = environment(t, context);
  const driver = car({ vx: 12, vz: 20 });
  const run = (fps: number) => {
    const audio = create([driver]);
    audio.update([driver], 'racing', 0);
    const created = audio.diagnostics.createdNodes;
    for (let frame = 1; frame <= fps * 2; frame += 1) {
      context.currentTime = frame / fps;
      audio.update([driver], 'racing', frame / fps);
    }
    assert.equal(audio.diagnostics.createdNodes, created);
    assert.equal(audio.diagnostics.nodes, 4);
    const level = audio.diagnostics.skidLevels[0];
    audio.destroy();
    return level;
  };
  assert.ok(Math.abs(run(30) - run(144)) < 1e-12);
  assert.ok(context.created.every(node => [node.gain, node.frequency, node.playbackRate].every(param => param.queue.length <= 1)));
  released(context);
});

test('efeitos: skid até quatro vozes, jogador prioritário, bots próximos e atenuação por distância', t => {
  const context = new Context(), { create } = environment(t, context);
  const driver = car({ vx: 12, vz: 20 });
  const bots = [140, 100, 70, 20, 0].map((x, i) => car({ id: `bot-${i}`, isPlayer: false, x, vx: 12, vz: 20 }));
  const audio = create([...bots, driver]);
  audio.update([...bots, driver], 'racing', 0);
  audio.update([...bots, driver], 'racing', 1);
  const voices = audio.diagnostics.voices;
  assert.deepEqual(voices.map(voice => voice.id), ['player', 'bot-4', 'bot-3', 'bot-2']);
  assert.ok(voices.every((voice, i) => i === 0 || voice.level < voices[i - 1].level));
  audio.update([driver], 'racing', 2, [event(1, 2)]);
  const localShot = context.created.at(-1)!.gain.value;
  audio.update([driver], 'racing', 2, [event(2, 2, 'shot', { ownerId: 'bot', x: 100 })]);
  assert.ok(context.created.at(-1)!.gain.value < localShot);
  const replacements = Array.from({ length: 6 }, (_, i) => car({ id: `new-${i}`, isPlayer: i === 5, vx: 12, vz: 20 }));
  audio.update(replacements, 'racing', 3);
  assert.equal(audio.diagnostics.skidVoices, 4);
  assert.equal(context.peakSkids, 4);
  assert.ok(audio.diagnostics.voices.some(voice => voice.id === 'new-5'));
});

for (const suppression of ['mute', 'boolean', 'blur', 'hidden', 'suspended', 'unavailable', 'state-focused', 'state-hidden']) {
  test(`efeitos: ${suppression} interrompe nós e descarta eventos/destruições sem backlog, mesmo sem frames`, t => {
    const context = new Context(), { create, game, window, document } = environment(t, context);
    const driver = car({ vx: 12, vz: 20 }), audio = create([driver]);
    audio.update([driver], 'racing', 0, [event(1, 0)]);
    const output = audio.outputNode;
    const toggle = (silent: boolean) => {
      if (suppression === 'mute') game.events.emit('audio-state', { muted: silent });
      if (suppression === 'boolean') game.events.emit('audio-state', silent);
      if (suppression === 'blur') window.dispatch(silent ? 'blur' : 'focus');
      if (suppression === 'hidden') { document.hidden = silent; document.dispatch('visibilitychange'); }
      if (suppression === 'suspended') context.setState(silent ? 'suspended' : 'running');
      if (suppression === 'unavailable') game.events.emit('audio-state', { available: !silent });
      if (suppression === 'state-focused') game.events.emit('audio-state', { focused: !silent });
      if (suppression === 'state-hidden') game.events.emit('audio-state', { hidden: silent });
    };
    toggle(true);
    assert.equal(audio.silent, true);
    assert.equal(audio.diagnostics.activeShots, 0);
    assert.equal(audio.diagnostics.skidVoices, 0);
    assert.equal(context.created[0].gain.value, 0);
    driver.destroyed = true; driver.destructionSequence = 1;
    // No update at all while silent: the next frame must consume accumulated history.
    toggle(false);
    audio.update([driver], 'racing', 1, [event(2, 1), event(3, 1, 'hit')]);
    assert.deepEqual(counts(audio), { shots: 1, impacts: 0, explosions: 0 });
    assert.equal(audio.outputNode, output);
    driver.destroyed = false;
    audio.update([driver], 'racing', 1.1, [event(4, 1.1)]);
    assert.equal(audio.diagnostics.shots, 2);
    toggle(true);
    driver.destroyed = true; driver.destructionSequence = 2;
    audio.update([driver], 'racing', 2, [event(5, 2)]);
    toggle(false);
    audio.update([driver], 'racing', 2, [event(5, 2)]);
    assert.deepEqual(counts(audio), { shots: 2, impacts: 0, explosions: 0 });
    assert.equal(context.buffers.length, 4);
    audio.destroy();
    released(context);
  });
}

test('efeitos: mute inicial e contexto suspenso não criam nós; retomar não reproduz fila antiga', t => {
  const context = new Context();
  context.state = 'suspended';
  const { create, game } = environment(t, context, true);
  const driver = car(), audio = create([driver]);
  audio.update([driver], 'racing', 0, [event(1, 0)]);
  assert.equal(audio.outputNode, null);
  assert.equal(context.buffers.length, 0);
  context.setState('running');
  game.events.emit('audio-state', false);
  audio.update([driver], 'racing', 1, [event(2, 1)]);
  assert.equal(audio.diagnostics.shots, 0);
  audio.update([driver], 'racing', 2, [event(3, 2)]);
  assert.equal(audio.diagnostics.shots, 1);
});

test('efeitos: estados fora da corrida e tempo inválido consomem eventos sem alterar participantes', t => {
  const context = new Context(), { create } = environment(t, context);
  const driver = car({ vx: 15, vz: 20 }), audio = create([driver]);
  const original = { ...driver };
  let id = 0;
  for (const status of ['waiting', 'countdown', 'ready', 'finished', 'unknown']) {
    audio.update([driver], status, ++id, [event(id, id)]);
  }
  audio.update([driver], 'racing', 6, [event(++id, 6)]);
  audio.update([driver], 'racing', NaN, [event(++id, 7)]);
  audio.update([driver], 'racing', 5, [event(++id, 5)]);
  assert.equal(audio.diagnostics.shots, 0);
  assert.equal(audio.diagnostics.skidVoices, 0);
  assert.deepEqual(driver, original);
});

for (const failure of ['gain', 'source', 'filter', 'buffer', 'connect', 'start', 'automation']) {
  test(`efeitos: falha opcional ${failure} limpa inclusive inicialização parcial e nunca afeta gameplay`, t => {
    const context = new Context(), { create } = environment(t, context);
    const driver = car({ vx: 12, vz: 20 }), audio = create([driver]);
    if (failure === 'automation') audio.update([driver], 'racing', 0, [event(1, 0)]);
    context.failure = failure;
    assert.doesNotThrow(() => audio.update([driver], 'racing', 1, [event(2, 1)]));
    assert.equal(audio.diagnostics.errorCount, 1);
    assert.equal(audio.diagnostics.unavailable, true);
    assert.equal(audio.diagnostics.nodes, 0);
    assert.equal(audio.diagnostics.activeShots, 0);
    assert.equal(audio.diagnostics.skidVoices, 0);
    assert.equal(audio.outputNode, null);
    audio.update([driver], 'racing', 2);
    audio.destroy(); audio.destroy();
    assert.equal(audio.diagnostics.errorCount, 1);
    released(context);
  });
}

test('efeitos: destroy idempotente remove listeners, callbacks e fontes sem fechar contexto compartilhado', t => {
  const context = new Context(), { create, game, window, document } = environment(t, context);
  const driver = car({ vx: 12, vz: 20 }), audio = create([driver]);
  audio.update([driver], 'racing', 0, [event(1, 0)]);
  assert.equal(game.events.listenerCount('audio-state'), 1);
  assert.equal(window.listenerCount + document.listenerCount + context.listenerCount, 4);
  const staleEnd = context.created.find(node => node.onended)?.onended;
  game.events.emit('destroy');
  audio.destroy(); staleEnd?.();
  audio.update([driver], 'racing', 1, [event(2, 1)]);
  game.events.emit('audio-state', false); window.dispatch('focus'); context.dispatch('statechange');
  assert.equal(audio.diagnostics.destroyed, true);
  assert.equal(audio.diagnostics.nodes, 0);
  assert.equal(audio.diagnostics.shots, 1);
  assert.equal(game.events.listenerCount('audio-state') + game.events.listenerCount('destroy'), 0);
  assert.equal(window.listenerCount + document.listenerCount + context.listenerCount, 0);
  assert.equal(audio.outputNode, null);
  assert.ok(context.created.every(node => node.stopCalls <= 1));
  released(context);
});

test('efeitos: contexto ausente/fechado oferece API silenciosa e destroy seguro', t => {
  const closed = new Context(); closed.state = 'closed';
  for (const context of [null, closed]) {
    const { create } = environment(t, context);
    const audio = create();
    assert.doesNotThrow(() => audio.update([], 'racing', 1, [event(1, 1)]));
    assert.equal(audio.silent, true);
    assert.equal(audio.diagnostics.nodes, 0);
    audio.destroy(); audio.destroy();
    assert.equal(audio.diagnostics.errorCount, 0);
  }
  released(closed);
});
