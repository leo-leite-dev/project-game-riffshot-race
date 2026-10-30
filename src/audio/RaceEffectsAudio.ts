import type Phaser from 'phaser';
import type { CannonEvent } from '../race/RivalCannon.ts';
import { RACE_AUDIO_ASSETS } from './raceAudioAssets.ts';
import type { RaceAudioAsset, RaceAudioSampleKind } from './raceAudioAssets.ts';

export type RaceAudioSampleLoader = (asset: RaceAudioAsset, context: AudioContext,
  signal: AbortSignal) => Promise<AudioBuffer>;
export interface RaceEffectsAudioOptions { loadSample?: RaceAudioSampleLoader; allowSamples?: boolean }
type SampleStatus = 'idle' | 'loading' | 'ready' | 'partial' | 'fallback' | 'aborted';
type SampleFault = 'context-unavailable' | 'decode-unsupported' | 'fetch-unavailable'
  | 'fetch' | 'decode' | 'invalid-buffer' | 'loader';
class SampleLoadError extends Error {
  constructor(readonly code: SampleFault) { super(code); }
}
const loadRaceSample: RaceAudioSampleLoader = async (asset, context, signal) => {
  let bytes: ArrayBuffer;
  try {
    // Root-relative allowlisted URLs; redirects cannot send this request off-origin.
    const response = await globalThis.fetch(asset.url, {
      signal, mode: 'same-origin', credentials: 'same-origin', redirect: 'error',
    });
    if (!response.ok) throw new SampleLoadError('fetch');
    bytes = await response.arrayBuffer();
  } catch { throw new SampleLoadError('fetch'); }
  if (signal.aborted) throw new SampleLoadError('fetch');
  if (context.state === 'closed') throw new SampleLoadError('context-unavailable');
  try { return await context.decodeAudioData(bytes); }
  catch { throw new SampleLoadError('decode'); }
};

/** Raw physics telemetry; presentation/interpolated poses must not be supplied. */
export interface EffectsParticipant {
  id?: string | number;
  isPlayer?: boolean;
  x?: number; z?: number; heading?: number;
  vx?: number; vz?: number; velocityX?: number; velocityZ?: number;
  health?: number; destroyed?: boolean; finished?: boolean;
  destructionSequence?: number;
  _visualImpact?: number;
  /** Existing simulation telemetry: projectile impulses belong to CannonEvent audio. */
  shotImpactSequence?: number;
}
type Key = string | number | EffectsParticipant;
type AudioState = { muted?: boolean; silent?: boolean; available?: boolean; focused?: boolean; hidden?: boolean; effectsVolume?: number };
type AudioGame = Phaser.Game & { menuMusic?: { getAudioState(): AudioState } };
type SoundKind = 'shot' | 'hit' | 'explosion';
type OneShot = { source: AudioBufferSourceNode; gain: GainNode };
type Collision = {
  impact: number; shotSequence: number; armed: boolean; nextTime: number;
  pendingAt: number | null; pendingLevel: number;
};
type Skid = {
  car: EffectsParticipant; source: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode;
  level: number; targetLevel: number; lateralSpeed: number; speed: number;
  sampled: boolean;
};
const MAX_SHOTS = 8, MAX_SKIDS = 4;
const COLLISION_THRESHOLD = 3, COLLISION_REARM = 1.5, COLLISION_COOLDOWN = 0.3;
const COLLISION_GRACE = 0.06, COLLISION_MAX_AGE = 0.2;
const SAMPLE_RATE = 22050;
const finite = (value: number | undefined, fallback = 0) => Number.isFinite(value) ? value as number : fallback;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const keyFor = (car: EffectsParticipant): Key => car.id ?? car;
const alive = (car: EffectsParticipant) => !car.destroyed && finite(car.health, 100) > 0 && !car.finished;
const safely = (action: () => void) => { try { action(); } catch { /* Optional audio cleanup. */ } };

/**
 * Dev-only optional samples on Phaser's shared context, with procedural fallbacks.
 * prepareSamples()/samplesReady settle once (including failure or cancellation);
 * callers may await them before countdown. Loading never starts/replays voices.
 * One instance per simulation/event sequence. Call once per frame AFTER physics;
 * simulationElapsed and CannonEvent.time are seconds. Event IDs are monotonic,
 * as in RivalCannon.consumeEvents(); expire never implies an audible hit.
 *
 * Counts are cumulative successfully started sounds (not received events). Full
 * pools DROP excess, never queue them. Silence stops sources and consumes history.
 * After an asynchronous silence/resume, the first audible update also discards
 * bursts: events accumulated while RAF was paused must never play on return.
 * Collision cracks reuse the synthetic hit buffer: rising impact >= 3, rearm below 1.5,
 * 0.3 s per-car cooldown and 0.06 s cannon-precedence grace (no timers). Impacts
 * counts cannon hits; collisionImpacts separately counts started collision cracks.
 */
export class RaceEffectsAudio {
  private readonly game: AudioGame;
  private readonly context: AudioContext | undefined;
  private participants: readonly EffectsParticipant[];
  private audioState: AudioState | null;
  private focused: boolean;
  private unavailable: boolean;
  private destroyed = false;
  private output: GainNode | null = null;
  private buffers: Record<SoundKind | 'skid', AudioBuffer> | null = null;
  private readonly sampleLoader: RaceAudioSampleLoader | undefined;
  private readonly sampleLoadingAllowed: boolean;
  private samplePreparation: Promise<void> | null = null;
  private sampleAbort: AbortController | null = null;
  private sampleBuffers: Partial<Record<RaceAudioSampleKind, AudioBuffer>> = {};
  private sampleStatus: SampleStatus = 'idle';
  private readonly sampleStatuses: Record<RaceAudioSampleKind, SampleStatus> = {
    shot: 'idle', hit: 'idle', skid: 'idle',
  };
  private readonly sampleFaults: Partial<Record<RaceAudioSampleKind, SampleFault>> = {};
  private sampleErrorCount = 0;
  private sampleLoadAttempts = 0;
  private readonly nodes = new Set<AudioNode>();
  private readonly oneShots = new Set<OneShot>();
  private readonly skids = new Map<Key, Skid>();
  private readonly sequences = new Map<Key, number>();
  private readonly collisions = new Map<Key, Collision>();
  private readonly selected: EffectsParticipant[] = [];
  private lastEventId = 0;
  private lastElapsed: number | null = null;
  private discardNextBursts = false;
  private shots = 0;
  private impacts = 0;
  private collisionImpacts = 0;
  private explosions = 0;
  private droppedOneShots = 0;
  private discardedEvents = 0;
  private createdNodes = 0;
  private generatedBuffers = 0;
  private updateCount = 0;
  private errorCount = 0;
  private readonly onAudioState: (state: AudioState | boolean) => void;
  private readonly onVisibility: (event: Event) => void;
  private readonly onContextState: () => void;
  private readonly onDestroy: () => void;

  constructor(game: AudioGame, participants: readonly EffectsParticipant[] = [], options: RaceEffectsAudioOptions = {}) {
    this.game = game;
    this.context = (game.sound as Phaser.Sound.WebAudioSoundManager | undefined)?.context;
    this.participants = participants;
    this.audioState = game.menuMusic?.getAudioState() ?? null;
    this.focused = globalThis.document?.hasFocus() ?? true;
    this.unavailable = !this.context || this.context.state === 'closed';
    this.sampleLoader = options.loadSample;
    this.sampleLoadingAllowed = options.allowSamples ?? (options.loadSample !== undefined || import.meta.env?.DEV === true);
    this.observeDestructions(false);
    this.observeCollisions(false, 0, []);
    this.discardNextBursts = this.silent;
    this.onAudioState = state => {
      this.audioState = typeof state === 'boolean' ? { muted: state } : state;
      this.refreshSilence();
    };
    this.onVisibility = event => {
      if (event.type === 'blur') this.focused = false;
      if (event.type === 'focus') this.focused = true;
      this.refreshSilence();
    };
    this.onContextState = () => this.refreshSilence();
    this.onDestroy = () => this.destroy();
    game.events.on('audio-state', this.onAudioState);
    game.events.once('destroy', this.onDestroy);
    globalThis.document?.addEventListener('visibilitychange', this.onVisibility);
    globalThis.window?.addEventListener('blur', this.onVisibility);
    globalThis.window?.addEventListener('focus', this.onVisibility);
    this.context?.addEventListener('statechange', this.onContextState);
    if (this.sampleLoadingAllowed) void this.prepareSamples();
    else {
      this.sampleStatus = 'fallback';
      for (const { kind } of RACE_AUDIO_ASSETS) this.sampleStatuses[kind] = 'fallback';
      this.samplePreparation = Promise.resolve();
    }
  }

  get outputNode(): GainNode | null { return this.output; }

  get samplesReady(): Promise<void> { return this.prepareSamples(); }

  /** One attempt per asset per instance, even if called repeatedly or during mute. */
  prepareSamples(): Promise<void> {
    if (this.samplePreparation) return this.samplePreparation;
    if (!this.sampleLoadingAllowed) {
      this.sampleStatus = 'fallback';
      for (const { kind } of RACE_AUDIO_ASSETS) this.sampleStatuses[kind] = 'fallback';
      this.samplePreparation = Promise.resolve();
      return this.samplePreparation;
    }
    const context = this.context;
    const unsupported: SampleFault | null = !context || context.state === 'closed' ? 'context-unavailable'
      : !this.sampleLoader && typeof context.decodeAudioData !== 'function' ? 'decode-unsupported'
        : !this.sampleLoader && typeof globalThis.fetch !== 'function' ? 'fetch-unavailable' : null;
    if (unsupported) {
      this.sampleStatus = 'fallback';
      for (const { kind } of RACE_AUDIO_ASSETS) {
        this.sampleStatuses[kind] = 'fallback';
        this.sampleFaults[kind] = unsupported;
      }
      this.samplePreparation = Promise.resolve();
      return this.samplePreparation;
    }
    const controller = new AbortController();
    this.sampleAbort = controller;
    this.sampleStatus = 'loading';
    for (const { kind } of RACE_AUDIO_ASSETS) this.sampleStatuses[kind] = 'loading';
    this.samplePreparation = new Promise<void>(resolve => {
      const finish = () => { controller.signal.removeEventListener('abort', finish); resolve(); };
      controller.signal.addEventListener('abort', finish, { once: true });
      // Each task catches its own errors; a decoder/optional loader that ignores
      // abort can finish later, but cannot retain readiness or publish any result.
      void Promise.all(RACE_AUDIO_ASSETS.map(asset => this.loadSample(asset, controller))).then(() => {
        if (!this.destroyed && !this.unavailable && !controller.signal.aborted) {
          const count = Object.keys(this.sampleBuffers).length;
          this.sampleStatus = count === 3 ? 'ready' : count > 0 ? 'partial' : 'fallback';
        }
        finish();
      });
    });
    return this.samplePreparation;
  }

  private async loadSample(asset: RaceAudioAsset, controller: AbortController): Promise<void> {
    this.sampleLoadAttempts += 1;
    try {
      const buffer = await (this.sampleLoader ?? loadRaceSample)(asset, this.context!, controller.signal);
      if (this.destroyed || this.unavailable || controller.signal.aborted) return;
      if (this.context?.state === 'closed') throw new SampleLoadError('context-unavailable');
      if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0) throw new SampleLoadError('invalid-buffer');
      this.sampleBuffers[asset.kind] = buffer;
      this.sampleStatuses[asset.kind] = 'ready';
    } catch (error) {
      if (this.destroyed || this.unavailable || controller.signal.aborted) return;
      this.sampleStatuses[asset.kind] = 'fallback';
      this.sampleErrorCount += 1;
      // Only fixed codes, never arbitrary messages/URLs from fetch or a loader.
      this.sampleFaults[asset.kind] = error instanceof SampleLoadError ? error.code : 'loader';
    }
  }

  private cancelSamples(): void {
    this.sampleStatus = 'aborted';
    for (const { kind } of RACE_AUDIO_ASSETS) this.sampleStatuses[kind] = 'aborted';
    this.sampleBuffers = {};
    this.sampleAbort?.abort();
    this.sampleAbort = null;
  }

  get silent(): boolean {
    const state = this.audioState;
    return this.destroyed || this.unavailable || this.context?.state !== 'running'
      || !!state?.muted || !!state?.silent || state?.available === false
      || state?.focused === false || !!state?.hidden || !this.focused || !!globalThis.document?.hidden;
  }

  private node<T extends AudioNode>(node: T): T {
    this.nodes.add(node);
    this.createdNodes += 1;
    return node;
  }

  private target(param: AudioParam, value: number, response: number): void {
    const now = this.context?.currentTime ?? 0;
    // Replacing, rather than appending, bounds automation over arbitrarily long races.
    param.cancelScheduledValues(now);
    param.setTargetAtTime(value, now, response);
  }

  private refreshSilence(): void {
    if (this.destroyed || !this.silent) return;
    this.discardNextBursts = true;
    this.observeDestructions(false);
    this.observeCollisions(false, this.lastElapsed ?? 0, []);
    try { this.stopVoices(); } catch { this.fail(); }
  }

  private initialize(): void {
    const context = this.context;
    if (!context) return;
    if (!this.output) {
      this.output = this.node(context.createGain());
      this.output.gain.value = 0;
      this.output.connect(context.destination);
    }
    if (this.buffers) return;
    // Fixed-rate PCM is automatically resampled by Web Audio. Each timbre is
    // baked once; even its tonal components need no per-event oscillator graph.
    const make = (kind: SoundKind | 'skid', duration: number): AudioBuffer => {
      const buffer = context.createBuffer(1, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
      const data = buffer.getChannelData(0);
      let seed = 0x4f524947, low = 0, phase = 0, peak = 0;
      for (let i = 0; i < data.length; i += 1) {
        const t = i / SAMPLE_RATE;
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        const noise = (seed >>> 0) / 2147483648 - 1;
        low += (noise - low) * (kind === 'explosion' ? 0.055 : 0.3);
        let sample: number;
        if (kind === 'skid') {
          sample = noise * 0.72 + Math.sin(2 * Math.PI * 390 * t) * 0.035
            + Math.sin(2 * Math.PI * 613 * t) * 0.018;
        } else {
          const explosion = kind === 'explosion', shot = kind === 'shot';
          phase += 2 * Math.PI * ((explosion ? 29 : 48) + (explosion ? 68 : 145)
            * Math.exp(-t * (explosion ? 7 : 24))) / SAMPLE_RATE;
          const attack = Math.min(1, t / 0.003);
          const tail = Math.min(1, (duration - t) / 0.035);
          const boom = Math.sin(phase) * Math.exp(-t * (explosion ? 4.6 : 18));
          const metal = (Math.sin(t * 2 * Math.PI * 1373) + Math.sin(t * 2 * Math.PI * 2219))
            * Math.exp(-t * (shot ? 48 : 35));
          sample = attack * tail * (explosion
            ? boom * 0.68 + low * 2.3 * Math.exp(-t * 3.8)
            : shot ? boom * 0.8 + metal * 0.13 + noise * 0.23 * Math.exp(-t * 42)
              : metal * 0.29 + noise * 0.7 * Math.exp(-t * 30) + low * 0.25 * Math.exp(-t * 22));
        }
        data[i] = sample;
        peak = Math.max(peak, Math.abs(sample));
      }
      if (kind === 'skid') {
        // Crossfade the noise seam, preserving a continuous loop (including tone).
        const seam = Math.floor(SAMPLE_RATE * 0.025);
        for (let i = 0; i < seam; i += 1) {
          const index = data.length - seam + i, blend = i / (seam - 1);
          data[index] = data[index] * (1 - blend) + data[i] * blend;
        }
      }
      const scale = 0.9 / Math.max(1, peak);
      for (let i = 0; i < data.length; i += 1) data[i] *= scale;
      this.generatedBuffers += 1;
      return buffer;
    };
    this.buffers = { shot: make('shot', 0.26), hit: make('hit', 0.19),
      explosion: make('explosion', 1.15), skid: make('skid', 1) };
  }

  private attenuation(x: number | undefined, z: number | undefined, player?: EffectsParticipant): number {
    if (!player) return 0.45;
    const distance = Math.hypot(finite(x) - finite(player.x), finite(z) - finite(player.z));
    return 1 / (1 + (distance / 28) ** 2);
  }

  private play(kind: SoundKind | 'collision', level: number): void {
    if (this.oneShots.size >= MAX_SHOTS) { this.droppedOneShots += 1; return; }
    const context = this.context;
    if (!context || !this.output || !this.buffers) return;
    const source = this.node(context.createBufferSource());
    const gain = this.node(context.createGain());
    const voice = { source, gain };
    this.oneShots.add(voice);
    // The MP3 impact is exclusively the cannon hit; body/wall cracks stay synthetic.
    source.buffer = kind === 'shot' || kind === 'hit' ? this.sampleBuffers[kind] ?? this.buffers[kind]
      : this.buffers[kind === 'collision' ? 'hit' : kind];
    gain.gain.value = level * (kind === 'explosion' ? 0.8 : kind === 'shot' ? 0.66 : 0.52);
    source.connect(gain).connect(this.output);
    source.onended = () => this.releaseShot(voice, true);
    source.start();
    if (kind === 'shot') this.shots += 1;
    else if (kind === 'hit') this.impacts += 1;
    else if (kind === 'collision') this.collisionImpacts += 1;
    else this.explosions += 1;
  }

  private observeDestructions(play: boolean, player?: EffectsParticipant): void {
    for (const car of this.participants) {
      const key = keyFor(car), sequence = finite(car.destructionSequence);
      const previous = this.sequences.get(key);
      this.sequences.set(key, Math.max(previous ?? 0, sequence));
      // First sight (including joining dead) is a baseline, never a destruction.
      // A living respawn is also consumed, not replayed on a later dead snapshot.
      if (play && previous !== undefined && sequence > previous && car.destroyed) {
        this.play('explosion', car.isPlayer ? 1 : 0.65 * this.attenuation(car.x, car.z, player));
      }
    }
    for (const key of this.sequences.keys()) {
      if (!this.participants.some(car => keyFor(car) === key)) this.sequences.delete(key);
    }
  }

  private observeCollisions(play: boolean, elapsed: number, events: readonly CannonEvent[],
    player?: EffectsParticipant): void {
    for (const car of this.participants) {
      const key = keyFor(car), impact = Math.max(0, finite(car._visualImpact));
      const shotSequence = finite(car.shotImpactSequence);
      const state = this.collisions.get(key);
      if (!state) {
        // First sight is only a baseline, including joining with an old impact.
        this.collisions.set(key, { impact, shotSequence, armed: impact < COLLISION_REARM,
          nextTime: 0, pendingAt: null, pendingLevel: 0 });
        continue;
      }
      const cannonHit = shotSequence > state.shotSequence || (car.id !== undefined
        && events.some(event => event.kind === 'hit' && event.targetId === car.id));
      const rising = impact >= COLLISION_THRESHOLD && impact > state.impact + 0.25;
      state.impact = impact;
      state.shotSequence = Math.max(state.shotSequence, shotSequence);
      if (!play || !alive(car) || cannonHit) {
        state.pendingAt = null;
        state.armed = impact < COLLISION_REARM;
        if (cannonHit && Number.isFinite(elapsed)) state.nextTime = elapsed + COLLISION_COOLDOWN;
        continue;
      }
      if (state.pendingAt !== null) {
        const age = elapsed - state.pendingAt;
        if (age >= COLLISION_GRACE) {
          // One frame/short grace gives a delayed CannonEvent precedence. A long
          // frame cannot turn this bounded candidate into a playback backlog.
          if (age <= COLLISION_MAX_AGE) this.play('collision', state.pendingLevel);
          state.pendingAt = null;
        }
      }
      if (impact < COLLISION_REARM) state.armed = true;
      if (rising && state.armed) {
        state.armed = false; // Consume even during cooldown/full pool; never defer a retry.
        if (elapsed >= state.nextTime) {
          state.nextTime = elapsed + COLLISION_COOLDOWN;
          state.pendingAt = elapsed;
          state.pendingLevel = (0.4 + 0.6 * clamp01((impact - COLLISION_THRESHOLD) / 13))
            * (car.isPlayer ? 1 : 0.65 * this.attenuation(car.x, car.z, player));
        }
      }
    }
    for (const key of this.collisions.keys()) {
      if (!this.participants.some(car => keyFor(car) === key)) this.collisions.delete(key);
    }
  }

  private slip(car: EffectsParticipant): { lateral: number; speed: number; intensity: number } {
    const heading = finite(car.heading), vx = finite(car.vx ?? car.velocityX), vz = finite(car.vz ?? car.velocityZ);
    const lateral = Math.abs(vx * Math.cos(heading) - vz * Math.sin(heading));
    const speed = Math.hypot(vx, vz);
    // Smoothstep avoids a hard onset at either threshold; independent of FPS.
    const slip = clamp01((lateral - 4) / 12), pace = clamp01((speed - 7) / 9);
    return { lateral, speed, intensity: alive(car) ? slip * slip * (3 - 2 * slip) * pace : 0 };
  }

  private skidTarget(car: EffectsParticipant, player?: EffectsParticipant): number {
    return this.slip(car).intensity * (car.isPlayer ? 0.65 : 0.22 * this.attenuation(car.x, car.z, player));
  }

  private createSkid(car: EffectsParticipant): Skid {
    const context = this.context;
    if (!context || !this.buffers || !this.output) throw new Error('Áudio indisponível');
    const source = this.node(context.createBufferSource());
    const filter = this.node(context.createBiquadFilter());
    const gain = this.node(context.createGain());
    const sampled = !!this.sampleBuffers.skid;
    const voice: Skid = { car, source, filter, gain, level: 0, targetLevel: 0, lateralSpeed: 0, speed: 0, sampled };
    this.skids.set(keyFor(car), voice);
    source.buffer = this.sampleBuffers.skid ?? this.buffers.skid;
    source.loop = true;
    // Only the synthetic noise has a crossfaded seam. Use the full decoded MP3.
    source.loopStart = sampled ? 0 : 0.025;
    source.loopEnd = source.buffer.duration;
    source.playbackRate.value = sampled ? 1 : 0.85;
    filter.type = sampled ? 'allpass' : 'bandpass';
    filter.Q.value = 0.8;
    filter.frequency.value = 900;
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.output);
    source.start();
    return voice;
  }

  private updateSkids(dt: number, player?: EffectsParticipant): void {
    this.selected.length = 0;
    for (const car of this.participants) {
      if (this.skidTarget(car, player) > 0 || (this.skids.get(keyFor(car))?.level ?? 0) > 0.001) {
        this.selected.push(car);
      }
    }
    this.selected.sort((a, b) => Number(!!b.isPlayer) - Number(!!a.isPlayer)
      || this.skidTarget(b, player) - this.skidTarget(a, player));
    this.selected.length = Math.min(this.selected.length, MAX_SKIDS);
    // Release departures before allocating, even on complete roster replacement.
    for (const [key, voice] of this.skids) {
      if (!this.selected.some(car => keyFor(car) === key)) {
        this.releaseSkid(voice);
        this.skids.delete(key);
      }
    }
    for (const car of this.selected) {
      let voice = this.skids.get(keyFor(car));
      if (voice && voice.source.buffer !== (this.sampleBuffers.skid ?? this.buffers?.skid)) {
        // A live fallback loop adopts a decoded sample only on the next update,
        // releasing before replacement to preserve the four-voice bound.
        this.releaseSkid(voice);
        this.skids.delete(keyFor(car));
        voice = undefined;
      }
      voice ??= this.createSkid(car);
      const slip = this.slip(car), target = this.skidTarget(car, player);
      const response = target > voice.level ? 0.06 : 0.14;
      voice.car = car;
      voice.targetLevel = target;
      voice.level += (target - voice.level) * (1 - Math.exp(-dt / response));
      voice.lateralSpeed = slip.lateral;
      voice.speed = slip.speed;
      this.target(voice.gain.gain, target, response);
      if (!voice.sampled) this.target(voice.filter.frequency, 850 + slip.intensity * 1650, 0.09);
      this.target(voice.source.playbackRate, voice.sampled ? 0.95 + slip.intensity * 0.1 : 0.85 + slip.intensity * 0.4, 0.09);
    }
  }

  update(participants: readonly EffectsParticipant[] = this.participants, status = 'racing',
    simulationElapsed = 0, cannonEvents: readonly CannonEvent[] = []): void {
    if (this.destroyed || this.unavailable) return;
    this.participants = participants;
    this.updateCount += 1;
    const validTime = Number.isFinite(simulationElapsed) && simulationElapsed >= 0
      && (this.lastElapsed === null || simulationElapsed >= this.lastElapsed);
    const dt = validTime && this.lastElapsed !== null ? simulationElapsed - this.lastElapsed : 0;
    if (validTime) this.lastElapsed = simulationElapsed;
    const running = validTime && (status === 'racing' || status === 'running');
    const audible = running && !this.silent;
    const bursts = audible && !this.discardNextBursts;
    try {
      if (audible) {
        this.initialize();
        this.target(this.output!.gain, 0.32 * Math.max(0, Math.min(1, this.audioState?.effectsVolume ?? 1)), 0.025);
      }
      else this.stopVoices();
      const player = participants.find(car => car.isPlayer);
      this.observeDestructions(bursts, player);
      for (const event of cannonEvents) {
        if (!Number.isSafeInteger(event.id) || event.id <= this.lastEventId) continue;
        this.lastEventId = event.id;
        const age = simulationElapsed - event.time;
        if (!bursts || !Number.isFinite(age) || age < 0
          || !Number.isFinite(event.x) || !Number.isFinite(event.z)
          || (event.kind !== 'shot' && event.kind !== 'hit')
          || age > (event.kind === 'shot' ? 0.3 : 0.5)) {
          this.discardedEvents += 1;
          continue;
        }
        const local = player?.id !== undefined
          && (event.kind === 'hit' ? event.targetId === player.id : event.ownerId === player.id);
        this.play(event.kind, local ? 1 : 0.65 * this.attenuation(event.x, event.z, player));
      }
      // Cannon hits reserve their target even when filtered/dropped, so their
      // physical impulse can never become a fallback collision crack this frame.
      this.observeCollisions(bursts, simulationElapsed, cannonEvents, player);
      if (audible) this.updateSkids(dt, player);
      // Keep a gate while silent, including when RAF continues in the background.
      this.discardNextBursts = !audible;
    } catch { this.fail(); }
  }

  private releaseNode(node: AudioNode, ended = false): void {
    if (!this.nodes.delete(node)) return;
    const source = node as AudioNode & { stop?: () => void; onended?: unknown };
    if (typeof source.stop === 'function') {
      source.onended = null;
      if (!ended) safely(() => source.stop?.());
    }
    safely(() => node.disconnect());
  }

  private releaseShot(voice: OneShot, ended = false): void {
    if (!this.oneShots.delete(voice)) return;
    this.releaseNode(voice.source, ended);
    this.releaseNode(voice.gain);
  }

  private releaseSkid(voice: Skid): void {
    this.releaseNode(voice.source);
    this.releaseNode(voice.filter);
    this.releaseNode(voice.gain);
  }

  private stopVoices(): void {
    // Immediate zero prevents interrupted/suspended tails leaking on resume.
    if (this.output) {
      const now = this.context?.currentTime ?? 0;
      this.output.gain.cancelScheduledValues(now);
      this.output.gain.setValueAtTime(0, now);
    }
    for (const voice of this.oneShots) this.releaseShot(voice);
    for (const voice of this.skids.values()) this.releaseSkid(voice);
    this.skids.clear();
    this.selected.length = 0;
  }

  private releaseAll(): void {
    // Also visits partially constructed sources not yet assigned to a voice.
    for (const node of this.nodes) this.releaseNode(node);
    this.oneShots.clear();
    this.skids.clear();
    this.output = null;
    this.buffers = null;
    this.selected.length = 0;
  }

  private fail(): void {
    this.errorCount += 1;
    this.unavailable = true;
    this.cancelSamples();
    this.releaseAll();
  }

  get diagnostics() {
    const voices = [...this.skids.values()];
    const sampleSources = { shot: 'procedural', hit: 'procedural', skid: 'procedural',
      explosion: 'procedural', collision: 'procedural' };
    for (const asset of RACE_AUDIO_ASSETS) {
      if (this.sampleBuffers[asset.kind]) sampleSources[asset.kind] = asset.url;
    }
    return {
      shots: this.shots, impacts: this.impacts, collisionImpacts: this.collisionImpacts, explosions: this.explosions,
      skidVoices: this.skids.size, skidLevels: voices.map(voice => voice.level),
      nodes: this.nodes.size, activeShots: this.oneShots.size,
      silent: this.silent, destroyed: this.destroyed, errorCount: this.errorCount,
      unavailable: this.unavailable, contextState: this.context?.state ?? 'unavailable',
      maxOneShots: MAX_SHOTS, maxSkidVoices: MAX_SKIDS,
      createdNodes: this.createdNodes, generatedBuffers: this.generatedBuffers,
      droppedOneShots: this.droppedOneShots, discardedEvents: this.discardedEvents,
      lastEventId: this.lastEventId, updateCount: this.updateCount,
      sampleStatus: this.sampleStatus, sampleStatuses: { ...this.sampleStatuses },
      sampleSources,
      decodedSamples: Object.keys(this.sampleBuffers).length, sampleLoadAttempts: this.sampleLoadAttempts,
      sampleErrorCount: this.sampleErrorCount, sampleFaults: { ...this.sampleFaults },
      voices: voices.map(voice => ({ id: voice.car.id, level: voice.level, targetLevel: voice.targetLevel,
        lateralSpeed: voice.lateralSpeed, speed: voice.speed })),
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.game.events.off('audio-state', this.onAudioState);
    this.game.events.off('destroy', this.onDestroy);
    globalThis.document?.removeEventListener('visibilitychange', this.onVisibility);
    globalThis.window?.removeEventListener('blur', this.onVisibility);
    globalThis.window?.removeEventListener('focus', this.onVisibility);
    this.context?.removeEventListener('statechange', this.onContextState);
    this.cancelSamples();
    this.releaseAll();
    this.sequences.clear();
    this.collisions.clear();
    this.participants = [];
    // Phaser owns the shared context: never close, suspend or resume it here.
  }
}
