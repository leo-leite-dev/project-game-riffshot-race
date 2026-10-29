import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { MenuMusic } from '../src/audio/MenuMusic.js';
import { ENGINE_PROFILES, RaceEngineAudio } from '../src/audio/RaceEngineAudio.js';

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(callback);
  }
  removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
  dispatch(name, values = {}) {
    const event = { type: name, target: {}, preventDefault() {}, stopPropagation() {}, ...values };
    for (const callback of this.listeners.get(name) ?? []) callback(event);
  }
  get listenerCount() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}

class Param {
  constructor(context) { this.context = context; this.value = 0; this.queue = []; }
  cancelScheduledValues() { this.queue.length = 0; }
  setTargetAtTime(value, time, response) {
    if (this.context.failAutomation) throw Error('automation failed');
    assert.ok(Number.isFinite(value));
    assert.ok(response > 0);
    this.target = value;
    this.response = response;
    this.queue.push(value);
  }
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
}

class AudioNode {
  constructor(context, kind) {
    this.context = context; this.kind = kind; this.connections = new Set();
    this.started = false; this.stops = 0; this.disconnected = false;
    for (const name of ['frequency', 'detune', 'gain', 'Q', 'threshold', 'ratio']) this[name] = new Param(context);
  }
  connect(node) {
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
  constructor(state = 'running') {
    super(); this.state = state; this.currentTime = 0; this.created = [];
    this.destination = {}; this.resumeCalls = 0; this.closeCalls = 0;
  }
  create(kind) {
    if (this.failKind === kind) throw Error(`create ${kind} failed`);
    const node = new AudioNode(this, kind); this.created.push(node); return node;
  }
  createGain() { return this.create('gain'); }
  createOscillator() { return this.create('oscillator'); }
  createBiquadFilter() { return this.create('filter'); }
  createBufferSource() { return this.create('source'); }
  createDynamicsCompressor() { return this.create('compressor'); }
  createWaveShaper() { return this.create('shaper'); }
  createBuffer(channels, length, sampleRate) {
    const samples = new Float32Array(length);
    return { getChannelData: () => samples, duration: length / sampleRate };
  }
  setState(state) { this.state = state; this.dispatch('statechange'); }
  resume() {
    this.resumeCalls += 1;
    if (this.rejectResume) return Promise.reject(Error('locked'));
    if (this.throwResume) throw Error('resume failed');
    this.setState('running'); return Promise.resolve();
  }
  close() { this.closeCalls += 1; }
}

function environment(t, { state = 'running', offline = 'missing', context: supplied } = {}) {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  const window = new Events(), document = new Events(), button = new Events();
  button.attributes = {};
  button.setAttribute = (name, value) => { button.attributes[name] = value; };
  document.hidden = false; document.hasFocus = () => true;
  document.getElementById = () => button;
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
  globalThis.window = window; globalThis.document = document;
  const context = supplied === null ? null : supplied ?? new Context(state);
  const game = { sound: { context }, events: new EventEmitter() };
  t.after(() => {
    game.events.emit('destroy');
    globalThis.window = oldWindow; globalThis.document = oldDocument;
  });
  return { game, context, window, document, button };
}

const car = (vehicleId = 'rift-blaze', extra = {}) => ({ id: 'player', vehicleId, isPlayer: true,
  heading: 0, vx: 0, vz: 0, x: 0, z: 0, vehicle: { maxSpeed: 30 },
  throttle: 0, health: 100, maxHealth: 100, ...extra });
const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
const assertReleased = context => {
  assert.ok(context.created.every(node => node.disconnected && !node.started));
  assert.equal(context.closeCalls, 0);
};

test('perfis: cinco timbres originais configuram osciladores, harmônicos, filtros e resposta distintos', t => {
  const { game, context } = environment(t);
  const signatures = new Set(), pitches = new Set();
  for (const [id, profile] of Object.entries(ENGINE_PROFILES)) {
    const driver = car(id), audio = new RaceEngineAudio(game, [driver]);
    audio.update();
    const voice = audio.voices.get(driver.id);
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
  assertReleased(context);
});

test('telemetria: projeção longitudinal, ré, throttle público, fallback velocityX/Z e status idle', t => {
  const { game } = environment(t);
  const driver = car(), audio = new RaceEngineAudio(game, [driver]);
  audio.update();
  const voice = audio.voices.get(driver.id), idle = voice.pitchHz;
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
  const driver = car();
  const bots = Array.from({ length: 5 }, (_, index) => car('volt-vector', {
    id: `bot-${index}`, isPlayer: false, x: index * 100,
  }));
  const audio = new RaceEngineAudio(game, [...bots, driver]);
  audio.update();
  assert.equal(audio.diagnostics.voiceCount, 4);
  assert.equal(audio.diagnostics.nodes, 33);
  assert.equal(audio.diagnostics.oscillatorCount, 12);
  assert.ok(audio.voices.has(driver.id));
  assert.ok(audio.voices.get('bot-0').level < audio.voices.get(driver.id).level);
  assert.ok(audio.voices.get('bot-1').level < audio.voices.get('bot-0').level);
  const replacement = [0, 1, 2, 3].map(index => car('widowmaker', { id: `new-${index}`, isPlayer: index === 0 }));
  audio.update(replacement);
  assert.equal(audio.diagnostics.voiceCount, 4); assert.equal(audio.diagnostics.nodes, 33);
  assert.equal(context.peakOscillators, 12);
});

test('lifecycle: frames reutilizam nós e automação limitada; remoção, troca de carro e respawn não vazam', t => {
  const { game, context } = environment(t);
  const driver = car(), bot = car('iron-bastion', { id: 'bot', isPlayer: false });
  const audio = new RaceEngineAudio(game, [driver, bot]);
  audio.update(); const created = audio.diagnostics.createdNodes;
  for (let frame = 0; frame < 600; frame += 1) {
    context.currentTime = frame / 60; driver.vz = frame % 30; audio.update();
  }
  assert.equal(audio.diagnostics.createdNodes, created);
  assert.equal(audio.diagnostics.nodes, 17);
  assert.ok(context.created.every(node => node.frequency.queue.length <= 1 && node.gain.queue.length <= 1));
  driver.destroyed = true; audio.update(); assert.equal(audio.voices.get(driver.id).level, 0);
  driver.destroyed = false; driver.health = 0; audio.update(); assert.equal(audio.voices.get(driver.id).level, 0);
  driver.health = 100; driver.respawnProtection = 2; audio.update(); assert.ok(audio.voices.get(driver.id).level > 0);
  const oldVoice = audio.voices.get(bot.id);
  audio.update([driver]);
  assert.equal(audio.diagnostics.nodes, 9);
  assert.ok(oldVoice.harmonicGains.every(node => node.disconnected));
  driver.vehicleId = 'widowmaker'; audio.update();
  assert.equal(audio.diagnostics.nodes, 9);
  assert.equal(audio.voices.get(driver.id).profile, ENGINE_PROFILES.widowmaker);
  audio.destroy(); audio.destroy(); audio.update();
  assert.equal(audio.diagnostics.nodes, 0); assert.equal(audio.diagnostics.voiceCount, 0);
  assertReleased(context);
});

test('controle compartilhado: gesture desbloqueia; M/botão, blur e visibility silenciam trilha e motores', async t => {
  const { game, context, window, document, button } = environment(t, { state: 'suspended', offline: 'works' });
  game.menuMusic = new MenuMusic(game);
  const states = []; game.events.on('audio-state', state => states.push(state));
  const audio = new RaceEngineAudio(game, [car()]);
  audio.update(); assert.equal(audio.diagnostics.nodes, 0);
  window.dispatch('keydown', { key: 'Enter' });
  await flush(); audio.update();
  const source = game.menuMusic.source;
  assert.ok(source?.started); assert.equal(source.loop, true);
  assert.equal(game.menuMusic.volume, 0.18);
  assert.equal(audio.output.gain.target, 0.24);
  assert.ok(states.some(state => state.unlocked && !state.silent));
  window.dispatch('keydown', { key: 'm' });
  assert.equal(game.menuMusic.muted, true);
  assert.equal(audio.output.gain.target, 0);
  assert.equal(game.menuMusic.output.gain.target, 0);
  window.dispatch('keydown', { key: 'm', repeat: true });
  assert.equal(game.menuMusic.muted, true);
  button.dispatch('click');
  assert.equal(game.menuMusic.muted, false); assert.equal(audio.output.gain.target, 0.24);
  assert.equal(button.attributes['aria-label'], 'Silenciar som');
  assert.equal(button.attributes['aria-pressed'], 'true');
  for (const hide of ['blur', 'hidden']) {
    if (hide === 'blur') window.dispatch('blur');
    else { document.hidden = true; document.dispatch('visibilitychange'); }
    assert.equal(audio.output.gain.target, 0); assert.equal(game.menuMusic.output.gain.target, 0);
    audio.update(); assert.equal(audio.diagnostics.silent, true);
    if (hide === 'blur') window.dispatch('focus');
    else { document.hidden = false; document.dispatch('visibilitychange'); }
    assert.equal(audio.output.gain.target, 0.24);
  }
  context.setState('suspended'); assert.equal(audio.output.gain.target, 0);
  window.dispatch('pointerdown'); await flush();
  assert.equal(audio.output.gain.target, 0.24);
  assert.equal(game.menuMusic.source, source); // Original loop is never replaced.
  game.events.emit('destroy');
  assert.equal(window.listenerCount + document.listenerCount + button.listenerCount + context.listenerCount, 0);
  assert.equal(game.events.listenerCount('audio-state'), 1); // Only this test's observer.
  assert.equal(game.events.listenerCount('destroy'), 0);
  assertReleased(context);
});

for (const offline of ['missing', 'constructor-fails', 'fails']) {
  test(`offline ${offline}: falha da trilha não bloqueia motor, unlock ou mute global`, async t => {
    const { game, context, window, button } = environment(t, { state: 'suspended', offline });
    game.menuMusic = new MenuMusic(game);
    const audio = new RaceEngineAudio(game, [car()]);
    window.dispatch('pointerdown'); await flush(); audio.update();
    assert.equal(game.menuMusic.trackUnavailable, true);
    assert.equal(game.menuMusic.unavailable, false); assert.equal(button.disabled, false);
    assert.equal(game.menuMusic.source ?? null, null);
    assert.equal(audio.diagnostics.voiceCount, 1); assert.equal(audio.diagnostics.silent, false);
    button.dispatch('click'); assert.equal(audio.output.gain.target, 0);
    assert.equal(context.resumeCalls, 2);
  });
}

test('unlock rejeitado ou síncrono pode ser retomado sem propagar erro ou criar vozes suspensas', async t => {
  const { game, context, window } = environment(t, { state: 'suspended' });
  game.menuMusic = new MenuMusic(game);
  const audio = new RaceEngineAudio(game, [car()]);
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
  game.menuMusic = new MenuMusic(game);
  context.failKind = 'source';
  window.dispatch('pointerdown'); await flush();
  assert.equal(game.menuMusic.trackUnavailable, true);
  assert.equal(game.menuMusic.output, null);
  assert.ok(context.created.every(node => node.disconnected));
  assert.equal(button.disabled, false);
  const audio = new RaceEngineAudio(game, [car()]);
  audio.update(); assert.equal(audio.diagnostics.voiceCount, 1);
});

for (const failure of ['gain', 'filter', 'oscillator', 'connect', 'start', 'automation']) {
  test(`catch-safe: falha ${failure} limpa inicialização parcial sem fechar contexto Phaser`, t => {
    const { game, context } = environment(t);
    const audio = new RaceEngineAudio(game, [car()]);
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
    game.menuMusic = new MenuMusic(game);
    const audio = new RaceEngineAudio(game, [car()]);
    assert.doesNotThrow(() => { audio.update(); window.dispatch('pointerdown'); button.dispatch('click'); });
    await flush();
    assert.equal(button.disabled, true); assert.equal(audio.diagnostics.nodes, 0);
    audio.destroy(); game.menuMusic.destroy();
  }
});

test('destroy antes da renderização não inicia trilha nem deixa callbacks; evento booleano também silencia', async t => {
  const { game, context, window } = environment(t, { offline: 'works' });
  game.menuMusic = new MenuMusic(game);
  const audio = new RaceEngineAudio(game, [car()]);
  audio.update();
  game.events.emit('audio-state', true); assert.equal(audio.output.gain.target, 0);
  game.events.emit('audio-state', false); assert.equal(audio.output.gain.target, 0.24);
  window.dispatch('pointerdown'); game.menuMusic.destroy();
  await flush();
  assert.equal(game.menuMusic.source, null);
  assert.equal(audio.output.gain.target, 0);
  audio.destroy(); assertReleased(context);
});
