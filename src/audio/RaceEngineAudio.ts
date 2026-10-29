import type Phaser from 'phaser';

type EngineTone = readonly [OscillatorType, number, number, number];
type EngineProfile = {
  idleHz: number;
  rangeHz: number;
  loadHz: number;
  cutoff: number;
  brightness: number;
  response: number;
  tones: readonly EngineTone[];
};
type Participant = {
  id?: string | number;
  vehicleId?: string;
  finished?: boolean;
  heading?: number;
  vx?: number;
  velocityX?: number;
  vz?: number;
  velocityZ?: number;
  vehicle?: { maxSpeed?: number };
  throttle?: number;
  health?: number;
  maxHealth?: number;
  destroyed?: boolean;
  x?: number;
  z?: number;
  isPlayer?: boolean;
};
type ParticipantKey = string | number | Participant;
type Voice = {
  car: Participant;
  profile: EngineProfile;
  output: GainNode;
  filter: BiquadFilterNode;
  oscillators: OscillatorNode[];
  harmonicGains: GainNode[];
  pitchHz: number;
  level: number;
  speedRatio: number;
  load: number;
};
type AudioState = { muted?: boolean; silent?: boolean; available?: boolean; focused?: boolean; hidden?: boolean };
type AudioGame = Phaser.Game & { menuMusic?: { getAudioState(): AudioState } };

// Original, procedural timbres. No samples, assets or additional AudioContext.
const profile = (idleHz: number, rangeHz: number, loadHz: number, cutoff: number, brightness: number, response: number,
  tones: readonly EngineTone[]): EngineProfile => Object.freeze({
  idleHz, rangeHz, loadHz, cutoff, brightness, response,
  tones: Object.freeze(tones.map(tone => Object.freeze(tone))),
});

export const ENGINE_PROFILES: Readonly<Record<string, EngineProfile>> = Object.freeze({
  // Nervous buggy: bright, closely spaced upper harmonics.
  'rift-blaze': profile(48, 125, 24, 650, 2100, 0.055,
    [['sawtooth', 1, 0.46, -7], ['square', 2, 0.18, 9], ['triangle', 3, 0.16, 0]]),
  // Deep V8: strong fundamental and a subdued uneven firing overtone.
  'volt-vector': profile(32, 78, 12, 380, 1000, 0.10,
    [['triangle', 1, 0.60, -4], ['sawtooth', 0.5, 0.25, 4], ['square', 2, 0.10, 0]]),
  // Heavy armored engine: low, slow response and dark resonances.
  'iron-bastion': profile(25, 56, 9, 260, 720, 0.16,
    [['sawtooth', 1, 0.45, -11], ['triangle', 0.5, 0.38, 6], ['square', 1.5, 0.12, 0]]),
  // Rough hot rod: detuned, inharmonic exhaust buzz.
  widowmaker: profile(39, 104, 20, 520, 1650, 0.085,
    [['sawtooth', 1, 0.48, -16], ['square', 1.51, 0.20, 13], ['sawtooth', 2, 0.18, 3]]),
  // Reserved future sports car; defining its sound does not unlock the vehicle.
  'race-car-2': profile(72, 190, 30, 1100, 3000, 0.045,
    [['triangle', 1, 0.46, 0], ['sawtooth', 2, 0.24, 5], ['triangle', 4, 0.18, -5]]),
});

const MAX_VOICES = 4;
const finite = (value: number | undefined, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const safely = (action: () => void): void => { try { action(); } catch { /* Audio is optional. */ } };
const profileFor = (vehicleId: string | undefined): EngineProfile =>
  (vehicleId ? ENGINE_PROFILES[vehicleId] : undefined) ?? ENGINE_PROFILES['rift-blaze'];

export class RaceEngineAudio {
  private readonly game: AudioGame;
  private context: AudioContext | undefined;
  private participants: Participant[];
  private selected: Participant[];
  private voices = new Map<ParticipantKey, Voice>();
  private nodes = new Set<AudioNode>();
  private output: GainNode | null = null;
  private audioState: AudioState | null;
  private focused: boolean;
  private createdNodes = 0;
  private updateCount = 0;
  private errorCount = 0;
  private destroyed = false;
  private unavailable: boolean;
  private readonly onAudioState: (state: AudioState | boolean) => void;
  private readonly onVisibility: (event: Event) => void;
  private readonly onContextState: () => void;
  private readonly onDestroy: () => void;

  constructor(game: AudioGame, participants: Participant[] = []) {
    this.game = game;
    this.context = (game.sound as Phaser.Sound.WebAudioSoundManager | undefined)?.context;
    this.participants = participants;
    this.selected = [];
    this.voices = new Map();
    this.nodes = new Set();
    this.createdNodes = 0;
    this.updateCount = 0;
    this.errorCount = 0;
    this.destroyed = false;
    this.unavailable = !this.context || this.context.state === 'closed';
    this.audioState = game.menuMusic?.getAudioState() ?? null;
    this.focused = globalThis.document?.hasFocus() ?? true;
    this.onAudioState = state => {
      // Object payload is the shared MenuMusic contract; boolean means muted.
      this.audioState = typeof state === 'boolean' ? { muted: state } : state;
      this.applyMaster();
    };
    this.onVisibility = event => {
      if (event.type === 'blur') this.focused = false;
      if (event.type === 'focus') this.focused = true;
      this.applyMaster();
    };
    this.onContextState = () => this.applyMaster();
    this.onDestroy = () => this.destroy();
    game.events.on('audio-state', this.onAudioState);
    game.events.once('destroy', this.onDestroy);
    globalThis.document?.addEventListener('visibilitychange', this.onVisibility);
    globalThis.window?.addEventListener('blur', this.onVisibility);
    globalThis.window?.addEventListener('focus', this.onVisibility);
    this.context?.addEventListener('statechange', this.onContextState);
  }

  get silent() {
    const state = this.audioState;
    return this.destroyed || this.unavailable || this.context?.state !== 'running'
      || !!state?.silent || !!state?.muted || state?.available === false
      || state?.focused === false || !!state?.hidden
      || !!globalThis.document?.hidden || !this.focused;
  }

  target(param: AudioParam, value: number, response = 0.06): void {
    const context = this.context;
    if (!context) return;
    const now = context.currentTime;
    // Bound the automation queue even across long races and repeated controls.
    param.cancelScheduledValues(now);
    param.setTargetAtTime(value, now, response);
  }

  applyMaster() {
    if (!this.output || this.destroyed || this.unavailable) return;
    try {
      this.target(this.output.gain, this.silent ? 0 : 0.24, 0.025);
    } catch { this.fail(); }
  }

  node<T extends AudioNode>(node: T): T {
    this.nodes.add(node);
    this.createdNodes += 1;
    return node;
  }

  createVoice(car: Participant): Voice {
    const context = this.context;
    if (!context || !this.output) throw new Error('Áudio indisponível');
    const sound = profileFor(car.vehicleId);
    const output = this.node(context.createGain());
    output.gain.value = 0;
    output.connect(this.output);
    const filter = this.node(context.createBiquadFilter());
    filter.type = 'lowpass';
    filter.Q.value = 0.8;
    filter.frequency.value = sound.cutoff;
    filter.connect(output);
    const oscillators: OscillatorNode[] = [];
    const harmonicGains: GainNode[] = [];
    const voice: Voice = { car, profile: sound, output, filter, oscillators, harmonicGains,
      pitchHz: sound.idleHz, level: 0, speedRatio: 0, load: 0 };
    this.voices.set(car.id ?? car, voice);
    for (const [type, ratio, level, detune] of sound.tones) {
      const osc = this.node(context.createOscillator());
      // Register before connecting/starting so partial failures cannot leak.
      oscillators.push(osc);
      const gain = this.node(context.createGain());
      harmonicGains.push(gain);
      osc.type = type;
      osc.detune.value = detune;
      osc.frequency.value = sound.idleHz * ratio;
      gain.gain.value = level;
      osc.connect(gain).connect(filter);
      osc.start();
    }
    return voice;
  }

  updateVoice(car: Participant, player: Participant | undefined, status: string): void {
    const key = car.id ?? car;
    let voice = this.voices.get(key);
    const soundProfile = profileFor(car.vehicleId);
    if (voice && voice.profile !== soundProfile) {
      this.releaseVoice(voice);
      this.voices.delete(key);
      voice = undefined;
    }
    if (!voice) voice = this.createVoice(car);
    if (!voice) return;
    voice.car = car;
    const active = (status === 'racing' || status === 'running') && !car.finished;
    const heading = finite(car.heading);
    const longitudinal = finite(car.vx ?? car.velocityX) * Math.sin(heading)
      + finite(car.vz ?? car.velocityZ) * Math.cos(heading);
    const speed = active ? clamp(Math.abs(longitudinal) / Math.max(1, finite(car.vehicle?.maxSpeed, 30)), 0, 1) : 0;
    const load = active ? clamp(Math.abs(finite(car.throttle)), 0, 1) : 0;
    const sound = voice.profile;
    const health = clamp(finite(car.health, 100) / Math.max(1, finite(car.maxHealth, 100)), 0, 1);
    const dead = car.destroyed || health <= 0;
    const distance = player ? Math.hypot(finite(car.x) - finite(player.x), finite(car.z) - finite(player.z)) : 0;
    const attenuation = car.isPlayer ? 1 : 0.28 / (1 + (distance / 28) ** 2);
    voice.speedRatio = speed;
    voice.load = load;
    voice.pitchHz = sound.idleHz + sound.rangeHz * speed + sound.loadHz * load;
    voice.level = dead ? 0 : attenuation * (0.32 + speed * 0.26 + load * 0.22) * (0.85 + health * 0.15);
    // Respawn protection is not destruction: a living car resumes immediately.
    this.target(voice.output.gain, voice.level);
    this.target(voice.filter.frequency, sound.cutoff + sound.brightness * (speed * 0.65 + load * 0.35), sound.response);
    for (let i = 0; i < voice.oscillators.length; i += 1) {
      const tone = sound.tones[i];
      const oscillator = voice.oscillators[i];
      if (tone && oscillator) this.target(oscillator.frequency, voice.pitchHz * tone[1], sound.response);
    }
  }

  // Call after physics with raw simulation participants, not interpolated poses.
  // waiting/countdown/ready/finished (and unknown states) keep engines at idle.
  update(participants: Participant[] = this.participants, status = 'racing'): void {
    if (this.destroyed || this.unavailable) return;
    try {
      this.participants = participants ?? [];
      this.updateCount += 1;
      if (this.silent) { this.applyMaster(); return; }
      const context = this.context;
      if (!context) return;
      if (!this.output) {
        this.output = this.node(context.createGain());
        this.output.gain.value = 0;
        this.output.connect(context.destination);
      }
      let player: Participant | undefined;
      for (const car of this.participants) { if (car.isPlayer) { player = car; break; } }
      // Always reserve the player voice, even if the array is standings-sorted.
      this.selected.length = 0;
      if (player) this.selected.push(player);
      for (const car of this.participants) {
        if (car === player) continue;
        if (this.selected.length >= MAX_VOICES) break;
        this.selected.push(car);
      }
      // Release departures first: even a full roster replacement stays <= 4.
      for (const [key, voice] of this.voices) {
        let retained = false;
        for (const car of this.selected) { if ((car.id ?? car) === key) { retained = true; break; } }
        if (!retained) {
          this.releaseVoice(voice);
          this.voices.delete(key);
        }
      }
      for (const car of this.selected) this.updateVoice(car, player, status);
      this.applyMaster();
    } catch { this.fail(); }
  }

  releaseNode(node: AudioNode): void {
    if (!this.nodes.has(node)) return;
    const scheduledNode = node as AudioNode & { stop?: () => void };
    if (typeof scheduledNode.stop === 'function') safely(() => scheduledNode.stop?.());
    safely(() => node.disconnect());
    this.nodes.delete(node);
  }

  releaseVoice(voice: Voice): void {
    // Each oscillator's only connection is its private harmonic gain.
    for (const osc of voice.oscillators) this.releaseNode(osc);
    for (const node of voice.harmonicGains) this.releaseNode(node);
    this.releaseNode(voice.filter);
    this.releaseNode(voice.output);
  }

  releaseAll() {
    for (const node of this.nodes) this.releaseNode(node);
    this.voices.clear();
    this.output = null;
  }

  fail() {
    this.errorCount += 1;
    this.unavailable = true;
    this.releaseAll();
  }

  // Snapshot only on request; no diagnostic objects/arrays in the frame loop.
  get diagnostics() {
    return { voiceCount: this.voices.size, nodes: this.nodes.size, createdNodes: this.createdNodes,
      oscillatorCount: [...this.voices.values()].reduce((sum, voice) => sum + voice.oscillators.length, 0),
      maxVoices: MAX_VOICES, updateCount: this.updateCount, errorCount: this.errorCount,
      silent: this.silent, unavailable: this.unavailable, destroyed: this.destroyed,
      contextState: this.context?.state ?? 'unavailable',
      voices: [...this.voices.values()].map(voice => ({ id: voice.car.id, vehicleId: voice.car.vehicleId,
        pitchHz: voice.pitchHz, level: voice.level, speedRatio: voice.speedRatio, load: voice.load })) };
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.game.events.off('audio-state', this.onAudioState);
    this.game.events.off('destroy', this.onDestroy);
    globalThis.document?.removeEventListener('visibilitychange', this.onVisibility);
    globalThis.window?.removeEventListener('blur', this.onVisibility);
    globalThis.window?.removeEventListener('focus', this.onVisibility);
    this.context?.removeEventListener('statechange', this.onContextState);
    this.releaseAll();
    this.participants = [];
    this.selected.length = 0;
    // The Phaser context belongs to the game, never to a race scene.
  }
}
