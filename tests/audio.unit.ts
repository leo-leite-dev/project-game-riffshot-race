import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { TestContext } from 'node:test';
import { MenuMusic } from '../src/audio/MenuMusic.ts';
import { ENGINE_PROFILES, RaceEngineAudio } from '../src/audio/RaceEngineAudio.ts';

type Listener = (event: { type: string; target: object; key?: string; repeat?: boolean }) => void;
type Attributes = Record<string, string>;

class Events {
  listeners: Map<string, Set<Listener>> = new Map();
  attributes: Attributes = {};
  hidden = false;
  disabled = false;
  OfflineAudioContext?: typeof Context;
  addEventListener(name: string, callback: Listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    const listeners = this.listeners.get(name);
    if (!listeners) throw new Error(`listeners not initialized for ${name}`);
    listeners.add(callback);
  }
  removeEventListener(name: string, callback: Listener) { this.listeners.get(name)?.delete(callback); }
  dispatch(name: string, values: Partial<Listener extends (event: infer E) => void ? E : never> = {}) {
    const event = { type: name, target: {}, preventDefault() {}, stopPropagation() {}, ...values };
    for (const callback of this.listeners.get(name) ?? []) callback(event);
  }
  get listenerCount() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
  hasFocus() { return true; }
  getElementById() { return this; }
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
}

class Param {
  context: Context; value = 0; queue: number[] = []; target = 0; response = 0;
  constructor(context: Context) { this.context = context; }
  cancelScheduledValues() { this.queue.length = 0; }
  setTargetAtTime(value: number, _time: number, response: number) {
    if (this.context.failAutomation) throw Error('automation failed');
    assert.ok(Number.isFinite(value));
    assert.ok(response > 0);
    this.target = value;
    this.response = response;
    this.queue.push(value);
  }
  setValueAtTime(value: number) { this.value = value; }
  linearRampToValueAtTime(value: number) { this.value = value; }
  exponentialRampToValueAtTime(value: number) { this.value = value; }
}

class AudioNode {
  context: Context; kind: string; connections = new Set<AudioNode | object>(); started = false; stops = 0; disconnected = false;
  frequency: Param; detune: Param; gain: Param; Q: Param; threshold: Param; ratio: Param;
  type = ''; loop = false;
  constructor(context: Context, kind: string) {
    this.context = context; this.kind = kind; this.connections = new Set();
    this.started = false; this.stops = 0; this.disconnected = false;
    this.frequency = new Param(context); this.detune = new Param(context); this.gain = new Param(context);
    this.Q = new Param(context); this.threshold = new Param(context); this.ratio = new Param(context);
  }
  connect(node: AudioNode | object) {
    if (this.context.failConnect) throw Error('connect failed');
    this.connections.add(node); return node;
  }
  disconnect() { this.connections.clear(); this.disconnected = true; }
  start() {
    if (this.context.failStart) throw Error('start failed');
    this.started = true;
    if (this.kind === 'oscillator') {
      const active = this.context.created.filter(node => node.kind === 'oscillator' && node.started).length;
      this.context.peakOscillators = Math.max(this.context.peakOscillators ?? 0, active);
    }
  }
  stop() { this.stops += 1; this.started = false; }
}

class Context extends Events {
  state: string; currentTime = 0; created: AudioNode[] = []; destination = {}; resumeCalls = 0; closeCalls = 0;
  failAutomation = false; failConnect = false; failStart = false; failKind?: string; rejectResume = false; throwResume = false; peakOscillators = 0;
  constructor(state = 'running') {
    super(); this.state = state; this.currentTime = 0; this.created = [];
    this.destination = {}; this.resumeCalls = 0; this.closeCalls = 0;
  }
  create(kind: string) {
    if (this.failKind === kind) throw Error(`create ${kind} failed`);
    const node = new AudioNode(this, kind); this.created.push(node); return node;
  }
  createGain() { return this.create('gain'); }
  createOscillator() { return this.create('oscillator'); }
  createBiquadFilter() { return this.create('filter'); }
  createBufferSource() { return this.create('source'); }
  createDynamicsCompressor() { return this.create('compressor'); }
  createWaveShaper() { return this.create('shaper'); }
  createBuffer(_channels: number, length: number, sampleRate: number) {
    const samples = new Float32Array(length);
    return { getChannelData: () => samples, duration: length / sampleRate };
  }
  setState(state: string) { this.state = state; this.dispatch('statechange'); }
  resume() {
    this.resumeCalls += 1;
    if (this.rejectResume) return Promise.reject(Error('locked'));
    if (this.throwResume) throw Error('resume failed');
    this.setState('running'); return Promise.resolve();
  }
  close() { this.closeCalls += 1; }
}

type MockGame = { sound: { context: Context | null }; events: EventEmitter; menuMusic?: MenuMusicInspection };
type MenuMusicInspection = { source: AudioNode | null; output: AudioNode | null; volume: number; muted: boolean;
  trackUnavailable: boolean; unavailable: boolean; setEffectsVolume(value: number): void;
  setMusicSource(source: 'game' | 'radio' | 'none'): void; toggle(): void;
  startRaceTrackMusic(trackId: string): void; stopRaceTrackMusic(): void;
  currentRaceTrackMusicId: string | null; destroy(): void };
type AudioInspection = { voices: Map<string | number | object, VoiceInspection>; output: AudioNode | null };
type VoiceInspection = { filter: AudioNode; oscillators: AudioNode[]; harmonicGains: AudioNode[]; pitchHz: number; level: number; profile: (typeof ENGINE_PROFILES)[string] };
type EnvironmentOptions = { state?: string; offline?: string; context?: Context | null };
function environment(t: TestContext, { state = 'running', offline = 'missing', context: supplied }: EnvironmentOptions = {}) {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  const oldKeyboardEvent = globalThis.KeyboardEvent;
  const oldElement = globalThis.Element;
  const window = new Events(), document = new Events(), button = new Events();
  const trackAudioInstances: Array<EventTarget & { src: string; paused: boolean; volume: number; loop: boolean;
    playCalls: number; pauseCalls: number; play(): Promise<void>; pause(): void; removeAttribute(name: string): void;
    load(): void; dispatchEvent(event: Event): boolean }> = [];
  document.getElementById = () => button;
  (document as unknown as { createElement: (name: string) => unknown }).createElement = ((name: string) => {
    if (name !== 'audio') return new EventTarget();
    const audio = new EventTarget() as EventTarget & { src: string; paused: boolean; volume: number; loop: boolean;
      playCalls: number; pauseCalls: number; play(): Promise<void>; pause(): void; removeAttribute(name: string): void;
      load(): void; dispatchEvent(event: Event): boolean };
    Object.assign(audio, { src: '', paused: true, volume: 1, loop: false, playCalls: 0, pauseCalls: 0,
      play() { audio.playCalls += 1; audio.paused = false; audio.dispatchEvent(new Event('playing')); return Promise.resolve(); },
      pause() { audio.pauseCalls += 1; audio.paused = true; },
      removeAttribute(attribute: string) { if (attribute === 'src') this.src = ''; }, load() {} });
    trackAudioInstances.push(audio);
    return audio;
  }) as Document['createElement'];
  if (offline !== 'missing') {
    window.OfflineAudioContext = class extends Context {
      constructor() {
        if (offline === 'constructor-fails') throw Error('offline init failed');
        super();
      }
      startRendering() {
        if (offline === 'fails') return Promise.reject(Error('offline render failed'));
        return Promise.resolve(this.createBuffer(1, 16, 22050));
      }
    };
  }
  globalThis.window = window as unknown as Window & typeof globalThis; globalThis.document = document as unknown as Document;
  globalThis.KeyboardEvent = class KeyboardEvent {} as unknown as typeof KeyboardEvent;
  globalThis.Element = class Element {} as unknown as typeof Element;
  const context = supplied === null ? null : supplied ?? new Context(state);
  const game: MockGame = { sound: { context }, events: new EventEmitter() };
  t.after(() => {
    game.events.emit('destroy');
    globalThis.window = oldWindow; globalThis.document = oldDocument;
    globalThis.KeyboardEvent = oldKeyboardEvent;
    globalThis.Element = oldElement;
  });
  return { game, context, window, document, button, trackAudioInstances };
}

type Car = { id: string; vehicleId: string; isPlayer: boolean; heading: number; vx?: number; vz?: number; velocityX?: number; velocityZ?: number; x: number; z: number; vehicle: { maxSpeed: number }; throttle: number; health: number; maxHealth: number; finished?: boolean; destroyed?: boolean; respawnProtection?: number; _aiThrottle?: number };
const car = (vehicleId = 'rift-blaze', extra: Partial<Car> = {}): Car => ({ id: 'player', vehicleId, isPlayer: true,
  heading: 0, vx: 0, vz: 0, x: 0, z: 0, vehicle: { maxSpeed: 30 },
  throttle: 0, health: 100, maxHealth: 100, ...extra });
const inspectAudio = (audio: RaceEngineAudio): AudioInspection => audio as unknown as AudioInspection;
const raceAudio = (game: MockGame, participants: Car[]) => new RaceEngineAudio(
  game as unknown as ConstructorParameters<typeof RaceEngineAudio>[0], participants);
const menuMusic = (game: MockGame) => new MenuMusic(game as unknown as ConstructorParameters<typeof MenuMusic>[0]);
const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
const assertContext: (context: Context | null) => asserts context is Context = context => { assert.ok(context); };
const assertReleased = (context: Context) => {
  assert.ok(context.created.every(node => node.disconnected && !node.started));
  assert.equal(context.closeCalls, 0);
};

test('perfis: cinco timbres originais configuram osciladores, harmônicos, filtros e resposta distintos', t => {
  const { game, context } = environment(t);
  const signatures = new Set(), pitches = new Set();
  for (const [id, profile] of Object.entries(ENGINE_PROFILES)) {
    const driver = car(id), audio = raceAudio(game, [driver]);
    audio.update();
    const voice = inspectAudio(audio).voices.get(driver.id);
    if (!voice) throw new Error(`voice not created for ${driver.id}`);
    assert.equal(voice.filter.type, 'lowpass');
    assert.equal(voice.filter.frequency.target, profile.cutoff);
    assert.deepEqual(voice.oscillators.map(osc => osc.type), profile.tones.map(tone => tone[0]));
    assert.deepEqual(voice.oscillators.map(osc => osc.detune.value), profile.tones.map(tone => tone[3]));
    assert.deepEqual(voice.harmonicGains.map(gain => gain.gain.value), profile.tones.map(tone => tone[2]));
    signatures.add(JSON.stringify([profile.tones, voice.filter.frequency.target, profile.response]));
    driver.vz = 24; driver.throttle = 1;
    audio.update();
    assert.ok(voice.pitchHz > profile.idleHz);
    assert.equal(voice.oscillators[0].frequency.response, profile.response);
    assert.ok(voice.filter.frequency.target > profile.cutoff);
    pitches.add(voice.pitchHz);
    audio.destroy();
  }
  assert.equal(signatures.size, 5); assert.equal(pitches.size, 5);
  assertContext(context);
  assertReleased(context);
});

test('telemetria: projeção longitudinal, ré, throttle público, fallback velocityX/Z e status idle', t => {
  const { game } = environment(t);
  const driver = car(), audio = raceAudio(game, [driver]);
  audio.update();
  const voice = inspectAudio(audio).voices.get(driver.id); assert.ok(voice); const idle = voice.pitchHz;
  driver.vx = 30; // Pure lateral velocity at heading zero is not engine RPM.
  driver._aiThrottle = 1;
  audio.update(); assert.equal(voice.pitchHz, idle);
  driver.throttle = 1;
  audio.update(); const loaded = voice.pitchHz; assert.ok(loaded > idle);
  driver.throttle = 0; driver.vz = 15;
  audio.update(); const forward = voice.pitchHz;
  driver.vz = -15; audio.update(); assert.equal(voice.pitchHz, forward);
  delete driver.vx; delete driver.vz;
  driver.heading = Math.PI / 2; driver.velocityX = 15; driver.velocityZ = 0;
  audio.update(); assert.equal(voice.pitchHz, forward);
  for (const status of ['waiting', 'countdown', 'ready', 'finished', 'unknown']) {
    audio.update([driver], status); assert.equal(voice.pitchHz, idle);
  }
  audio.update([driver], 'running'); assert.equal(voice.pitchHz, forward);
  driver.finished = true; audio.update(); assert.equal(voice.pitchHz, idle);
  driver.finished = false; driver.velocityX = Infinity; driver.throttle = NaN;
  audio.update(); assert.equal(voice.pitchHz, idle);
});

test('mixagem: até quatro vozes, prioridade ao jogador e bots atenuados por distância', t => {
  const { game, context } = environment(t);
  assertContext(context);
  const driver = car();
  const bots = Array.from({ length: 5 }, (_, index) => car('volt-vector', {
    id: `bot-${index}`, isPlayer: false, x: index * 100,
  }));
  const audio = raceAudio(game, [...bots, driver]);
  audio.update();
  assert.equal(audio.diagnostics.voiceCount, 4);
  assert.equal(audio.diagnostics.nodes, 33);
  assert.equal(audio.diagnostics.oscillatorCount, 12);
  assert.ok(inspectAudio(audio).voices.has(driver.id));
  assert.ok(inspectAudio(audio).voices.get('bot-0')!.level < inspectAudio(audio).voices.get(driver.id)!.level);
  assert.ok(inspectAudio(audio).voices.get('bot-1')!.level < inspectAudio(audio).voices.get('bot-0')!.level);
  const replacement = [0, 1, 2, 3].map(index => car('widowmaker', { id: `new-${index}`, isPlayer: index === 0 }));
  audio.update(replacement);
  assert.equal(audio.diagnostics.voiceCount, 4); assert.equal(audio.diagnostics.nodes, 33);
  assert.equal(context.peakOscillators, 12);
});

test('mixagem: motores de bot e rival próximos são audíveis sem superar o jogador', t => {
  const { game } = environment(t);
  const driver = car();
  const bot = car('volt-vector', { id: 'bot', isPlayer: false, x: 25 });
  const rival = car('widowmaker', { id: 'rival', isPlayer: false, x: -25 });
  const audio = raceAudio(game, [driver, bot, rival]);
  audio.update();
  const voices = inspectAudio(audio).voices;
  const playerLevel = voices.get(driver.id)!.level;
  for (const id of [bot.id, rival.id]) {
    const ratio = voices.get(id)!.level / playerLevel;
    assert.ok(ratio > 0.5 && ratio < 0.75, `25 m: ${id} não pode sumir nem abafar o jogador (${ratio})`);
  }
  bot.x = 100;
  audio.update();
  assert.ok(voices.get(bot.id)!.level < voices.get(rival.id)!.level / 3);
});

test('lifecycle: frames reutilizam nós e automação limitada; remoção, troca de carro e respawn não vazam', t => {
  const { game, context } = environment(t);
  assertContext(context);
  const driver = car(), bot = car('iron-bastion', { id: 'bot', isPlayer: false });
  const audio = raceAudio(game, [driver, bot]);
  audio.update(); const created = audio.diagnostics.createdNodes;
  for (let frame = 0; frame < 600; frame += 1) {
    context.currentTime = frame / 60; driver.vz = frame % 30; audio.update();
  }
  assert.equal(audio.diagnostics.createdNodes, created);
  assert.equal(audio.diagnostics.nodes, 17);
  assert.ok(context.created.every(node => node.frequency.queue.length <= 1 && node.gain.queue.length <= 1));
  driver.destroyed = true; audio.update(); assert.equal(inspectAudio(audio).voices.get(driver.id)!.level, 0);
  driver.destroyed = false; driver.health = 0; audio.update(); assert.equal(inspectAudio(audio).voices.get(driver.id)!.level, 0);
  driver.health = 100; driver.respawnProtection = 2; audio.update(); assert.ok(inspectAudio(audio).voices.get(driver.id)!.level > 0);
  const oldVoice = inspectAudio(audio).voices.get(bot.id); assert.ok(oldVoice);
  audio.update([driver]);
  assert.equal(audio.diagnostics.nodes, 9);
  assert.ok(oldVoice.harmonicGains.every(node => node.disconnected));
  driver.vehicleId = 'widowmaker'; audio.update();
  assert.equal(audio.diagnostics.nodes, 9);
  assert.equal(inspectAudio(audio).voices.get(driver.id)!.profile, ENGINE_PROFILES.widowmaker);
  audio.destroy(); audio.destroy(); audio.update();
  assert.equal(audio.diagnostics.nodes, 0); assert.equal(audio.diagnostics.voiceCount, 0);
  assertReleased(context);
});

test('canais separados: mute/volume de efeitos não silenciam música; rádio e blur controlam canais corretamente', async t => {
  const { game, context, window, document, button } = environment(t, { state: 'suspended', offline: 'works' });
  assertContext(context);
  game.menuMusic = menuMusic(game) as unknown as MenuMusicInspection;
  const states: Array<{ unlocked: boolean; silent: boolean }> = []; game.events.on('audio-state', state => states.push(state));
  const audio = raceAudio(game, [car()]);
  audio.update(); assert.equal(audio.diagnostics.nodes, 0);
  window.dispatch('keydown', { key: 'Enter' });
  await flush(); audio.update();
  const source = game.menuMusic.source;
  assert.ok(source?.started); assert.equal(source.loop, true);
  assert.equal(game.menuMusic.volume, 0.18);
  assert.equal(inspectAudio(audio).output!.gain.target, 0.24);
  assert.ok(states.some(state => state.unlocked && !state.silent));
  game.menuMusic.toggle();
  assert.equal(game.menuMusic.muted, true);
  assert.equal(inspectAudio(audio).output!.gain.target, 0);
  const menuOutput = game.menuMusic.output;
  if (!menuOutput) throw new Error('menu output not created');
  assert.equal(menuOutput.gain.target, 0.18);
  button.dispatch('click');
  assert.equal(game.menuMusic!.muted, false); assert.equal(inspectAudio(audio).output!.gain.target, 0.24);
  assert.equal(menuOutput.gain.target, 0.18);
  assert.equal(button.attributes['aria-label'], 'Silenciar efeitos sonoros');
  assert.equal(button.attributes['aria-pressed'], 'true');
  game.menuMusic.setEffectsVolume(0.25);
  assert.equal(inspectAudio(audio).output!.gain.target, 0.06);
  assert.equal(menuOutput.gain.target, 0.18);
  game.menuMusic.setMusicSource('radio');
  assert.equal(menuOutput.gain.target, 0);
  assert.equal(inspectAudio(audio).output!.gain.target, 0.06);
  game.menuMusic.setMusicSource('none');
  assert.equal(menuOutput.gain.target, 0);
  game.menuMusic.setMusicSource('game');
  assert.equal(menuOutput.gain.target, 0.18);
  for (const hide of ['blur', 'hidden']) {
    if (hide === 'blur') window.dispatch('blur');
    else { document.hidden = true; document.dispatch('visibilitychange'); }
    assert.equal(inspectAudio(audio).output!.gain.target, 0); assert.equal(game.menuMusic!.output!.gain.target, 0);
    audio.update(); assert.equal(audio.diagnostics.silent, true);
    if (hide === 'blur') window.dispatch('focus');
    else { document.hidden = false; document.dispatch('visibilitychange'); }
    assert.equal(inspectAudio(audio).output!.gain.target, 0.06);
  }
  context.setState('suspended'); assert.equal(inspectAudio(audio).output!.gain.target, 0);
  window.dispatch('pointerdown'); await flush();
  assert.equal(inspectAudio(audio).output!.gain.target, 0.06);
  assert.equal(game.menuMusic.source, source); // Original loop is never replaced.
  game.events.emit('destroy');
  assert.equal(window.listenerCount + document.listenerCount + button.listenerCount + context.listenerCount, 0);
  assert.equal(game.events.listenerCount('audio-state'), 1); // Only this test's observer.
  assert.equal(game.events.listenerCount('destroy'), 0);
  assertReleased(context);
});

test('Neon Furnace: música da pista substitui temporariamente a trilha do jogo e limpa ao encerrar', async t => {
  const { game, context, window, trackAudioInstances } = environment(t, { state: 'suspended', offline: 'works' });
  assertContext(context);
  game.menuMusic = menuMusic(game) as unknown as MenuMusicInspection;
  const states: Array<{ active: boolean; trackId: string | null }> = [];
  game.events.on('race-track-music', state => states.push(state));
  window.dispatch('pointerdown'); await flush();
  const music = game.menuMusic!;
  const gameSource = music.source;
  const gameOutput = music.output;
  assert.ok(gameSource && gameOutput);
  assert.equal((gameOutput as unknown as GainNode).gain.value, 0);
  music.startRaceTrackMusic('voltage-run');
  assert.equal(trackAudioInstances.length, 0, 'Voltage Run mantém a seleção musical normal');
  music.startRaceTrackMusic('neon-furnace');
  await flush();
  assert.equal(trackAudioInstances.length, 1);
  assert.equal(trackAudioInstances[0].src, '/assets/audio/neon-furnace-theme.mp3');
  assert.equal(trackAudioInstances[0].loop, true);
  assert.equal(trackAudioInstances[0].paused, false);
  assert.equal(music.currentRaceTrackMusicId, 'neon-furnace');
  assert.equal(((gameOutput as unknown as GainNode).gain as unknown as { target: number }).target, 0,
    'trilha original pausada enquanto toca a da pista');
  music.stopRaceTrackMusic();
  assert.equal(trackAudioInstances[0].paused, true);
  assert.equal(((gameOutput as unknown as GainNode).gain as unknown as { target: number }).target, 0.18,
    'trilha previamente escolhida fica audível de novo depois da corrida');
  assert.equal(gameSource.started, true, 'fonte procedural compartilhada não foi duplicada/recriada');
  assert.equal(music.currentRaceTrackMusicId, null);
  assert.deepEqual(states, [{ active: true, trackId: 'neon-furnace' }, { active: false, trackId: 'neon-furnace' }]);
  game.events.emit('destroy');
  assert.equal(trackAudioInstances[0].src, '');
  assertReleased(context);
});

test('Neon Furnace: erro ao carregar a faixa remove o override e deixa a trilha selecionada como fallback', async t => {
  const { game, context, window, trackAudioInstances } = environment(t, { state: 'suspended', offline: 'works' });
  assertContext(context);
  game.menuMusic = menuMusic(game) as unknown as MenuMusicInspection;
  window.dispatch('pointerdown'); await flush();
  const music = game.menuMusic!;
  const output = music.output;
  if (!output) throw new Error('procedural output ausente');
  music.startRaceTrackMusic('neon-furnace');
  trackAudioInstances[0].dispatchEvent(new Event('error'));
  assert.equal(trackAudioInstances[0].paused, true);
  assert.equal(music.currentRaceTrackMusicId, null);
  assert.equal((output as unknown as AudioNode).gain.target, 0.18);
  game.events.emit('destroy');
  assertReleased(context);
});

  for (const offline of ['missing', 'constructor-fails', 'fails']) {
  test(`offline ${offline}: falha da trilha não bloqueia motor, unlock ou mute global`, async t => {
    const { game, context, window, button } = environment(t, { state: 'suspended', offline });
    assertContext(context);
    game.menuMusic = menuMusic(game) as unknown as MenuMusicInspection;
    const audio = raceAudio(game, [car()]);
    window.dispatch('pointerdown'); await flush(); audio.update();
    assert.equal(game.menuMusic.trackUnavailable, true);
    assert.equal(game.menuMusic.unavailable, false); assert.equal(button.disabled, false);
    assert.equal(game.menuMusic.source ?? null, null);
    assert.equal(audio.diagnostics.voiceCount, 1); assert.equal(audio.diagnostics.silent, false);
    button.dispatch('click'); assert.equal(inspectAudio(audio).output!.gain.target, 0);
    assert.equal(context.resumeCalls, 2);
  });
}

test('unlock rejeitado ou síncrono pode ser retomado sem propagar erro ou criar vozes suspensas', async t => {
  const { game, context, window } = environment(t, { state: 'suspended' });
  assertContext(context);
  game.menuMusic = menuMusic(game) as unknown as MenuMusicInspection;
  const audio = raceAudio(game, [car()]);
  context.rejectResume = true;
  window.dispatch('pointerdown'); await flush(); audio.update();
  assert.equal(audio.diagnostics.nodes, 0);
  context.rejectResume = false; context.throwResume = true;
  assert.doesNotThrow(() => window.dispatch('pointerdown')); await flush();
  context.throwResume = false;
  window.dispatch('pointerdown'); await flush(); audio.update();
  assert.equal(audio.diagnostics.voiceCount, 1);
});

test('falha parcial no player da trilha libera nós e mantém motores disponíveis', async t => {
  const { game, context, window, button } = environment(t, { offline: 'works' });
  assertContext(context);
  game.menuMusic = menuMusic(game) as unknown as MenuMusicInspection;
  context.failKind = 'source';
  window.dispatch('pointerdown'); await flush();
  assert.equal(game.menuMusic.trackUnavailable, true);
  assert.equal(game.menuMusic.output, null);
  assert.ok(context.created.every(node => node.disconnected));
  assert.equal(button.disabled, false);
  const audio = raceAudio(game, [car()]);
  audio.update(); assert.equal(audio.diagnostics.voiceCount, 1);
});

for (const failure of ['gain', 'filter', 'oscillator', 'connect', 'start', 'automation']) {
  test(`catch-safe: falha ${failure} limpa inicialização parcial sem fechar contexto Phaser`, t => {
    const { game, context } = environment(t);
    assertContext(context);
    const audio = raceAudio(game, [car()]);
    if (failure === 'automation') { audio.update(); context.failAutomation = true; }
    else if (failure === 'connect') context.failConnect = true;
    else if (failure === 'start') context.failStart = true;
    else context.failKind = failure;
    assert.doesNotThrow(() => audio.update());
    assert.equal(audio.diagnostics.unavailable, true);
    assert.equal(audio.diagnostics.errorCount, 1);
    assert.equal(audio.diagnostics.nodes, 0);
    assert.equal(audio.diagnostics.voiceCount, 0);
    audio.update(); audio.destroy();
    assertReleased(context);
  });
}

test('contexto ausente/fechado não bloqueia API, botão ou destroy', async t => {
  for (const context of [null, new Context('closed')]) {
    const { game, button, window } = environment(t, { context });
    game.menuMusic = menuMusic(game) as unknown as MenuMusicInspection;
    const audio = raceAudio(game, [car()]);
    assert.doesNotThrow(() => { audio.update(); window.dispatch('pointerdown'); button.dispatch('click'); });
    await flush();
    assert.equal(button.disabled, true); assert.equal(audio.diagnostics.nodes, 0);
    audio.destroy(); game.menuMusic.destroy();
  }
});

test('destroy antes da renderização não inicia trilha nem deixa callbacks; evento booleano também silencia', async t => {
  const { game, context, window } = environment(t, { offline: 'works' });
  assertContext(context);
  game.menuMusic = menuMusic(game) as unknown as MenuMusicInspection;
  const audio = raceAudio(game, [car()]);
  audio.update();
  game.events.emit('audio-state', true); assert.equal(inspectAudio(audio).output!.gain.target, 0);
  game.events.emit('audio-state', false); assert.equal(inspectAudio(audio).output!.gain.target, 0.24);
  window.dispatch('pointerdown'); game.menuMusic.destroy();
  await flush();
  assert.equal(game.menuMusic.source, null);
  assert.equal(inspectAudio(audio).output!.gain.target, 0);
  audio.destroy(); assertReleased(context);
});
