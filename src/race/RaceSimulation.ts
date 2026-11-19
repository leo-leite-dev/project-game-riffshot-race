import { DIFFICULTIES } from '../data/raceDifficulty.ts';
import { VEHICLE, VEHICLES, getVehicleById } from '../data/vehicles.ts';
import { BotController } from './BotController.ts';
import { RivalCannon } from './RivalCannon.ts';
import { damageHandling, healthCapacity, impactDamage, DESTRUCTION_SECONDS, RESPAWN_PROTECTION_SECONDS } from './damageMath.ts';
import { findNearestTrackPoint, sampleRaceTrack, sampleTrackAtProgress, sampleTrackSurface,
  trackHeadingAlignment, RACE_TRACK_SAMPLES_PER_SEGMENT } from './trackMath.ts';
import { generateProceduralRamps } from './rampLibrary.ts';
import type { VehicleAbility, VehicleStats } from '../data/vehicles.ts';
import type { TrackPath, TrackJump, SampledTrack, NearestTrackPoint } from './trackMath.ts';
import type { BotProfileId } from '../data/botProfiles.ts';
import type { PilotHandlingAttribute } from '../data/characters.ts';
import { applyDevRaceAIBonus } from './DevRaceAIBonus.ts';
import type { DevRaceAIBonus } from './DevRaceAIBonus.ts';
import { CAMARO_UPGRADE, camaroTopSpeedKmh } from '../data/camaroUpgrades.ts';

export { findNearestTrackPoint, sampleRaceTrack, sampleTrackAtProgress } from './trackMath.ts';

export interface RaceTrack extends TrackPath {
  id?: string;
  width: number;
  laps: number;
  startGrid: readonly { lane?: number }[];
  scenery?: readonly { x: number; z: number; width: number; depth: number }[];
}
export type RaceDifficulty = (typeof DIFFICULTIES)[keyof typeof DIFFICULTIES];
export interface PilotStats { speed?: number; acceleration?: number; handling?: number; endurance?: number; aggression?: number }
export interface RaceVehicle { id: string; stats: Readonly<VehicleStats>; ability: Readonly<VehicleAbility> }
export interface RacePilot {
  id: string; name: string; stats?: PilotStats; specialties?: readonly PilotHandlingAttribute[];
  vehicleId?: string; vehicleStats?: VehicleStats; paintColor?: string;
  aiProfile?: BotProfileId; aiSeed?: number;
}
export interface RaceOptions {
  track?: RaceTrack;
  difficulty?: string | RaceDifficulty;
  player?: RacePilot;
  playerVehicle?: RaceVehicle;
  vehicleStats?: VehicleStats;
  playerPaint?: string;
  botPilots?: RacePilot[];
  laps?: number;
  diagnostics?: boolean;
  devRaceAIBonus?: DevRaceAIBonus;
  raceSeed?: number | string;
}
export interface RaceControls { throttle?: number; brake?: number; steer?: number; handbrake?: number; nitro?: boolean }
interface NormalizedControls { throttle: number; brake: number; steer: number; handbrake: number; nitro?: boolean }
export interface HandlingStats {
  maxSpeed: number; acceleration: number; grip: number; steering: number; endurance: number;
  collisionShove: number; impactResistance: number; wallSpeedRetention: number;
  braking: number; collisionDamageMultiplier: number; nitroCharges: number;
  nitroSeconds: number; nitroMultiplier: number; nitroRecoverySeconds: number;
  poweredDrag?: number; coastingDrag?: number;
}
export interface RaceParticipant {
  aiProfile?: BotProfileId; aiSeed?: number;
  specialties?: readonly PilotHandlingAttribute[];
  id: string; name: string; isPlayer: boolean; paintColor: string; vehicleId: string;
  x: number; y: number; z: number; heading: number; velocityX: number; velocityZ: number;
  speed: number; throttle: number; airborne: boolean; verticalVelocity: number;
  lapsCompleted: number; nextCheckpoint: number;
  finished: boolean; finishTime: number | null; progress: number; rank: number; vehicle: HandlingStats;
  nitroCharges: number; nitroActive: boolean; nitroRemaining: number; nitroRecoveryRemaining: number;
  healthOrbs: number; maxHealth: number; health: number; destroyed: boolean; respawnProtection: number;
  destructionSequence: number; respawnSequence: number;
  _nitroWasRequested: boolean | undefined; _destructionRemaining: number; _driftBoost: number;
  _wallContactSide: number; _distance: number; _lastPathDistance: number; _progressDebt: number;
  _nextGate: number; _prevX: number; _prevZ: number; _trackWidth: number; _lane: number; _baseLane: number;
  _aiSteer: number; _aiThrottle: number; _aiBrake: number; _aiClock: number;
  _activeJumpId: string | null; _airborneElapsed: number;
  _landingSequence?: number; _landingImpactSpeed?: number; _landingSurfaceSlope?: number;
  _renderPreviousX?: number; _renderPreviousY?: number; _renderPreviousZ?: number;
  _renderPreviousHeading?: number; _renderPreviousSpeed?: number;
  _visualPreviousVX?: number; _visualPreviousVZ?: number; _visualPreviousSteer?: number;
  _visualPreviousAcceleration?: number; _visualPreviousImpact?: number; _visualSteer?: number;
  _visualAcceleration?: number; _visualImpact?: number; _pendingWallDamage?: number;
  _respawnPoint?: NearestTrackPoint | null; _destructionGateSide?: number; _respawnGateOffset?: number;
  _finishOrder?: number;
  shotImpactSequence?: number; shotImpactRemaining?: number;
}
export interface RenderPose {
  x: number; y: number; z: number; heading: number; speed: number; lateralSpeed?: number;
  longitudinalAcceleration?: number;
}
export interface VisualTelemetry extends RenderPose {
  longitudinalSpeed: number; lateralSpeed: number; steer: number; longitudinalAcceleration: number;
  impactSpeed: number; health: number; maxHealth: number; healthOrbs: number; destroyed: boolean;
  respawnProtection: number; destructionSequence: number; respawnSequence: number; throttle: number; nitroActive: boolean;
  airborne: boolean;
}
interface Gate { x: number; z: number; tangentX: number; tangentZ: number; lateralLimit: number; distance: number }

const FIXED_DT = 1 / 60;
const MAX_FRAME_SECONDS = 0.25;
const NITRO_RECOVERY_SECONDS = 1;
const CONTACT_DAMAGE_COOLDOWN = 0.85;
const WALL_RESTITUTION = 0.18;
const WALL_SPEED_RETAINED = 0.5;
const WALL_CONTACT_RELEASE = 0.15;
const CONTACT_NORMAL_EPSILON = 0.001;
const AIR_GRAVITY = 18;
const CAMARO_VEHICLE_ID = 'volt-vector';
// The existing simulation unit converts to 4 km/h; this is the actual physical
// speed used by movement, collisions, ramps and the HUD.
const KMH_PER_WORLD_UNIT_PER_SECOND = 4;
const CAMARO_ACCELERATION_BASE = 14.8415;
const CAMARO_ACCELERATION_GAIN = 5.0655;
const CAMARO_ACCELERATION_CURVE = 6.1835;
const CAMARO_POWERED_DRAG_RATIO = 0.76;
const CAMARO_COASTING_DRAG = 0.025;
const RAMP_GRAVITY = 9.81;
const RAMP_GRAVITY_SCALE = 0.75;
/** Shared arcade tuning for players and bots; not a difficulty modifier. */
export const RACE_HANDLING_TUNING = Object.freeze({
  lateralResponse: 6.1,
  lateralAcceleration: 31,
  highSpeedGripLoss: 1.45,
  highSpeedSteeringLoss: 0.24,
  steeringSpeedRamp: 3.6,
  powerOversteer: 0.42,
  corneringSpeedDrag: 0.12,
  driftSpeedBonus: 0.06,
  driftAcceleration: 0.12,
});
/** A pilot rating may adjust each active vehicle stat by at most one point on 0–100. */
export const PILOT_SPECIALTY_BONUS_POINTS = 1;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const lerp = (a: number, b: number, amount: number) => a + (b - a) * amount;
const angleDelta = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const JUMP_LAUNCH_REFERENCE_SPEED = 27.5; // 110 km/h in the simulation's 4 km/h-per-unit scale.
const JUMP_LAUNCH_GAIN_DECAY = 1.5;

/** Softens only vertical takeoff energy above the normal arcade-speed reference. */
function softenedJumpLaunchSpeed(speed: number): number {
  const forwardSpeed = Math.max(0, speed);
  const excessSpeed = Math.max(0, forwardSpeed - JUMP_LAUNCH_REFERENCE_SPEED);
  return forwardSpeed <= JUMP_LAUNCH_REFERENCE_SPEED
    ? forwardSpeed
    : JUMP_LAUNCH_REFERENCE_SPEED
      + excessSpeed / (1 + JUMP_LAUNCH_GAIN_DECAY * excessSpeed / JUMP_LAUNCH_REFERENCE_SPEED);
}

export function deriveHandlingStats(vehicleStats: Partial<VehicleStats> = {}, pilotStats: PilotStats = {}, ability: VehicleAbility = {},
  specialties?: readonly PilotHandlingAttribute[], vehicleId?: string): HandlingStats {
  const rating = (key: keyof PilotStats) => clamp(Number(specialties && !specialties.includes(key)
    ? 5 : pilotStats[key] ?? 5), 1, 10);
  const specialtyPoints = (key: keyof PilotStats) => specialties && !specialties.includes(key) ? 0
    : clamp((rating(key) - 5) / 5, -1, 1) * PILOT_SPECIALTY_BONUS_POINTS;
  const vehicle = (key: keyof VehicleStats, pilotKey?: keyof PilotStats) =>
    clamp(Number(vehicleStats[key] ?? 60) + (pilotKey ? specialtyPoints(pilotKey) : 0), 0, 100) / 100;
  const isCamaro = vehicleId === CAMARO_VEHICLE_ID;
  const rawVehiclePoints = (key: keyof VehicleStats) => clamp(Number(vehicleStats[key] ?? 60), 0, 100);
  const accelerationProgress = isCamaro
    ? clamp((rawVehiclePoints('acceleration') - 36) / 64, 0, 1)
    : rawVehiclePoints('acceleration') / 100;
  const acceleration = isCamaro
    // The quadratic curve gives the requested 7 / 5.5 / 4 s progression at
    // 0 / 50 / 100 points while engine force remains independent of top speed.
    ? (CAMARO_ACCELERATION_BASE + CAMARO_ACCELERATION_GAIN * accelerationProgress
      + CAMARO_ACCELERATION_CURVE * accelerationProgress * accelerationProgress)
      * (1 + specialtyPoints('acceleration') / 100)
    : 6 + vehicle('acceleration', 'acceleration') * 12;
  const maxSpeed = isCamaro
    ? camaroTopSpeedKmh(clamp(rawVehiclePoints('speed'), CAMARO_UPGRADE.baseSpeed, CAMARO_UPGRADE.maximumSpeed))
      / KMH_PER_WORLD_UNIT_PER_SECOND * (1 + specialtyPoints('speed') / 100)
    : 16 + vehicle('speed', 'speed') * 20;
  // A steady-state speed 1/0.76 times the cap leaves the limit reachable while
  // drag still progressively eases the Camaro toward it without a timer.
  const poweredDrag = isCamaro
    ? acceleration / maxSpeed * CAMARO_POWERED_DRAG_RATIO
    : 0.15;
  const tires = clamp(Number(vehicleStats.tires ?? vehicleStats.control ?? 60), 0, 100) / 100;
  const suspension = clamp(Number(vehicleStats.suspension ?? 50), 0, 100);
  const camaroArmorProgress = isCamaro ? clamp((rawVehiclePoints('armor') - 68) / 8, 0, 1) : 0;
  return {
    maxSpeed,
    acceleration,
    poweredDrag,
    coastingDrag: isCamaro ? CAMARO_COASTING_DRAG : 0.15,
    grip: 0.35 + tires * 0.6,
    steering: 1.35 + vehicle('control', 'handling') * 0.9,
    endurance: 1 + specialtyPoints('endurance') / 100,
    // A specialty has a bounded, visible one-stat-point effect: up to +/-1%.
    // Aggression increases force delivered to the other car, not self-resistance.
    collisionShove: 1 + specialtyPoints('aggression') / 100,
    impactResistance: 0.85 + suspension * 0.003,
    wallSpeedRetention: clamp(WALL_SPEED_RETAINED + (suspension - 50) * 0.001, 0.4, 0.6),
    braking: 22,
    collisionDamageMultiplier: (1 - specialtyPoints('endurance') / 100) * (1 - camaroArmorProgress * 0.04),
    nitroCharges: Math.max(0, Math.floor(Number(ability.nitroCharges) || 0)),
    nitroSeconds: Math.max(0, Number(ability.nitroSeconds) || 0),
    nitroMultiplier: Math.max(1, Number(ability.nitroMultiplier) || 1),
    nitroRecoverySeconds: NITRO_RECOVERY_SECONDS,
  };
}

function normalizeControls(controls: RaceControls = {}): NormalizedControls {
  return { throttle: clamp(Number(controls.throttle ?? 0), -1, 1), brake: clamp(Number(controls.brake ?? 0), 0, 1), steer: clamp(Number(controls.steer ?? 0), -1, 1), handbrake: clamp(Number(controls.handbrake ?? 0), 0, 1), nitro: Boolean(controls.nitro) };
}

function createGate(sampled: SampledTrack, fraction: number, width: number): Gate {
  const center = sampleTrackAtProgress(sampled, sampled.totalLength * fraction);
  return { x: center.x, z: center.z, tangentX: center.tangentX, tangentZ: center.tangentZ, lateralLimit: width / 2, distance: center.distance };
}

function gateSide(car: RaceParticipant, gate: Gate) {
  return (car.x - gate.x) * gate.tangentX + (car.z - gate.z) * gate.tangentZ;
}

function crossesGate(car: RaceParticipant, gate: Gate, planeOffset = 0) {
  const previousSide = (car._prevX - gate.x) * gate.tangentX + (car._prevZ - gate.z) * gate.tangentZ - planeOffset;
  const currentSide = gateSide(car, gate) - planeOffset;
  // Forward progress is from the negative side to the positive side of the tangent plane.
  const from = previousSide; const to = currentSide;
  if (from > 1e-8 || to < 0 || to - from <= 1e-6) return false;
  const fraction = clamp(-from / (to - from), 0, 1);
  const crossingX = lerp(car._prevX, car.x, fraction); const crossingZ = lerp(car._prevZ, car.z, fraction);
  const lateral = (crossingX - gate.x) * -gate.tangentZ + (crossingZ - gate.z) * gate.tangentX;
  return Math.abs(lateral) <= gate.lateralLimit;
}

export class RaceSimulation {
  declare cannon: RivalCannon;
  declare track: SampledTrack & { width: number; laps: number; jumps?: readonly TrackJump[] };
  declare difficulty: RaceDifficulty;
  declare botController: BotController;
  declare laps: number;
  declare gates: Gate[];
  declare status: 'waiting' | 'racing' | 'finished';
  declare elapsedTime: number;
  declare accumulator: number;
  declare finishSequence: number;
  declare diagnostics: boolean;
  declare vehicleContactsEnabled: boolean;
  declare participants: RaceParticipant[];
  declare contactCooldowns: Map<string, number>;
  declare diagnosticAdvanceCalls: number;
  declare lastAdvanceDeltaMs: number;
  declare lastAdvanceSteps: number;
  declare lastAdvanceBarrierCorrections: number;
  declare lastAdvanceContactCorrections: number;

  constructor({ track, difficulty = 'normal', player, playerVehicle = VEHICLE, vehicleStats,
    playerPaint = '#e53935', botPilots = [], laps = track?.laps, diagnostics = false, devRaceAIBonus,
    raceSeed = 'race-default' }: RaceOptions = {}) {
    if (!track?.waypoints || !Array.isArray(track.startGrid)) throw new TypeError('track com waypoints e startGrid é obrigatório.');
    if (!player?.id || !player?.name) throw new TypeError('player precisa de id e name.');
    if (!Array.isArray(botPilots) || botPilots.length !== 3) throw new RangeError('A corrida requer exatamente três botPilots.');
    const sampled = sampleRaceTrack(track, RACE_TRACK_SAMPLES_PER_SEGMENT);
    const ramps = track.jumps?.length ? track.jumps : track.rampRegions?.length
      ? generateProceduralRamps({ trackId: track.id ?? 'custom-track', totalLength: sampled.totalLength, trackWidth: track.width,
        regions: track.rampRegions, count: track.rampCount ?? 0, seed: raceSeed,
        obstacles: track.scenery,
        sampleAt: distance => sampleTrackAtProgress(sampled, distance) })
      : track.jumps;
    this.track = { ...sampled, width: track.width, laps: laps ?? track.laps, jumps: ramps };
    this.difficulty = typeof difficulty === 'string' ? DIFFICULTIES[difficulty as keyof typeof DIFFICULTIES] : difficulty;
    if (!this.difficulty) throw new RangeError('Dificuldade desconhecida.');
    this.botController = new BotController(this.track, this.difficulty);
    this.cannon = new RivalCannon({ track: this.track, difficulty: this.difficulty.id });
    this.laps = Math.max(1, Math.floor(this.track.laps));
    this.gates = [0.25, 0.5, 0.75, 1].map(fraction => createGate(sampled, fraction, track.width));
    this.gates[3].distance = sampled.totalLength;
    this.status = 'waiting'; this.elapsedTime = 0; this.accumulator = 0; this.finishSequence = 0;
    this.diagnostics = diagnostics;
    this.vehicleContactsEnabled = true;
    if (diagnostics) this.diagnosticAdvanceCalls = 0;
    const entrants = [{ ...player, isPlayer: true, paintColor: playerPaint, vehicle: playerVehicle,
      vehicleStats: vehicleStats ?? playerVehicle.stats }, ...botPilots.map((bot, index) => {
      const vehicle = getVehicleById(bot.vehicleId as string) ?? VEHICLES[(index + 1) % VEHICLES.length];
      return { ...bot, isPlayer: false, vehicle,
        vehicleStats: bot.vehicleStats ?? vehicle.stats,
        paintColor: bot.paintColor ?? ['#41d7ff', '#ffbd38', '#a68cff'][index] };
    })];
    this.participants = entrants.map((entry, index) => {
      const grid = track.startGrid[index];
      if (!grid) throw new RangeError('startGrid deve conter quatro posições.');
      const startProgress = sampled.totalLength * 0.985;
      const center = sampleTrackAtProgress(sampled, startProgress);
      const lane = Number(grid.lane ?? (index % 2 ? 1.5 : -1.5));
      const x = center.x - center.tangentZ * lane; const z = center.z + center.tangentX * lane;
      const capacity = healthCapacity(entry.vehicleStats.armor);
      const handling = deriveHandlingStats(entry.vehicleStats, entry.stats, entry.vehicle.ability, entry.specialties,
        entry.vehicle.id);
      const bonusPercent = this.difficulty.id !== 'hard' || entry.isPlayer ? 0
        : entry.aiProfile === 'rival' ? devRaceAIBonus?.rivalPercent ?? 0 : devRaceAIBonus?.botsPercent ?? 0;
      return {
        id: entry.id, name: entry.name, isPlayer: entry.isPlayer, paintColor: entry.paintColor,
        aiProfile: entry.aiProfile, aiSeed: entry.aiSeed, specialties: entry.specialties,
        vehicleId: entry.vehicle.id,
        x, z, y: center.y, heading: Math.atan2(center.tangentX, center.tangentZ), velocityX: 0, velocityZ: 0, speed: 0, throttle: 0,
        airborne: false, verticalVelocity: 0,
        lapsCompleted: 0, nextCheckpoint: 1, finished: false, finishTime: null,
        progress: startProgress / (this.laps * sampled.totalLength), rank: index + 1,
        vehicle: bonusPercent > 0 ? applyDevRaceAIBonus(handling, bonusPercent) : handling,
        nitroCharges: entry.vehicle.ability.nitroCharges ?? 0, nitroActive: false,
        nitroRemaining: 0, nitroRecoveryRemaining: 0, _nitroWasRequested: false,
        ...capacity, health: capacity.maxHealth, destroyed: false, respawnProtection: 0,
        destructionSequence: 0, respawnSequence: 0, _destructionRemaining: 0,
        _driftBoost: 0, _wallContactSide: 0,
        _distance: startProgress, _lastPathDistance: startProgress, _progressDebt: 0,
        _nextGate: 0, _prevX: x, _prevZ: z, _trackWidth: track.width, _lane: lane, _baseLane: lane,
        _aiSteer: 0, _aiThrottle: 0, _aiBrake: 0, _aiClock: 0,
        _activeJumpId: null, _airborneElapsed: 0,
      };
    });
    this.contactCooldowns = new Map();
  }

  start() { if (this.status === 'waiting') this.status = 'racing'; return this; }

  advance(deltaMs: number, controls: RaceControls = {}) {
    if (this.diagnostics) this.diagnosticAdvanceCalls += 1;
    if (this.status !== 'racing') return this.getStandings();
    const frameDeltaMs = clamp(Number(deltaMs) || 0, 0, MAX_FRAME_SECONDS * 1000);
    if (this.diagnostics) {
      this.lastAdvanceDeltaMs = frameDeltaMs;
      this.lastAdvanceSteps = 0;
      this.lastAdvanceBarrierCorrections = 0;
      this.lastAdvanceContactCorrections = 0;
    }
    this.accumulator += frameDeltaMs / 1000;
    while (this.accumulator >= FIXED_DT && this.status === 'racing') {
      this._step(FIXED_DT, normalizeControls(controls));
      this.accumulator -= FIXED_DT;
      if (this.diagnostics) this.lastAdvanceSteps += 1;
    }
    return this.getStandings();
  }

  getRenderPose(car: RaceParticipant, alpha = this.accumulator / FIXED_DT, output: Partial<RenderPose> = {}): RenderPose {
    if (car.finished || car.destroyed) {
      output.x = car.x; output.y = car.y; output.z = car.z;
      output.heading = car.heading; output.speed = car.speed;
      return output as RenderPose;
    }
    // This is presentation-only interpolation; the simulation keeps its exact
    // fixed-step state and gate/collision calculations remain untouched.
    const amount = clamp(Number(alpha) || 0, 0, 1);
    const previousHeading = car._renderPreviousHeading ?? car.heading;
    output.x = lerp(car._renderPreviousX ?? car.x, car.x, amount);
    output.y = lerp(car._renderPreviousY ?? car.y, car.y, amount);
    output.z = lerp(car._renderPreviousZ ?? car.z, car.z, amount);
    output.heading = previousHeading + angleDelta(car.heading - previousHeading) * amount;
    output.speed = lerp(car._renderPreviousSpeed ?? car.speed, car.speed, amount);
    return output as RenderPose;
  }

  getStandings() {
    return [...this.participants].sort((a, b) => (a.finished && b.finished ? a.finishTime! - b.finishTime! : a.finished ? -1 : b.finished ? 1 : b.progress - a.progress)).map((car, index) => {
      car.rank = index + 1;
      return car;
    });
  }

  // Presentation telemetry only; never feeds forces, controls, gates or saves.
  getVisualTelemetry(car: RaceParticipant, output: RenderPose & Partial<VisualTelemetry> = this.getRenderPose(car)): VisualTelemetry {
    const alpha = car.finished ? 1 : clamp(this.accumulator / FIXED_DT, 0, 1);
    const vx = lerp(car._visualPreviousVX ?? car.velocityX, car.velocityX, alpha);
    const vz = lerp(car._visualPreviousVZ ?? car.velocityZ, car.velocityZ, alpha);
    output.longitudinalSpeed = vx * Math.sin(output.heading) + vz * Math.cos(output.heading);
    output.lateralSpeed = vx * Math.cos(output.heading) - vz * Math.sin(output.heading);
    output.steer = lerp(car._visualPreviousSteer ?? 0, car._visualSteer ?? 0, alpha);
    output.longitudinalAcceleration = lerp(car._visualPreviousAcceleration ?? 0, car._visualAcceleration ?? 0, alpha);
    output.impactSpeed = lerp(car._visualPreviousImpact ?? 0, car._visualImpact ?? 0, alpha);
    output.health = car.health; output.maxHealth = car.maxHealth; output.healthOrbs = car.healthOrbs;
    output.destroyed = car.destroyed; output.respawnProtection = car.respawnProtection;
    output.destructionSequence = car.destructionSequence; output.respawnSequence = car.respawnSequence;
    output.throttle = car.finished || car.destroyed ? 0 : car.throttle;
    output.nitroActive = !car.finished && !car.destroyed && car.nitroActive;
    output.airborne = car.airborne;
    return output as VisualTelemetry;
  }

  _step(dt: number, playerControls: NormalizedControls) {
    this.elapsedTime += dt;
    for (const car of this.participants) {
      if (car.shotImpactRemaining) car.shotImpactRemaining = Math.max(0, car.shotImpactRemaining - dt);
      car.throttle = 0;
      if (car.finished) continue;
      if (car.destroyed) {
        // Observe the input edge without executing commands: holding nitro
        // through a death must not automatically spend the remaining charge.
        car._nitroWasRequested = car.isPlayer && Boolean(playerControls.nitro);
        car._destructionRemaining = Math.max(0, car._destructionRemaining - dt);
        if (car._destructionRemaining <= 1e-8) this._respawn(car);
        continue;
      }
      car.respawnProtection = Math.max(0, car.respawnProtection - dt);
      if (car.respawnProtection < 1e-8) car.respawnProtection = 0;
      const controls = car.isPlayer ? playerControls : this.botController.controlsFor(car, this.participants, dt);
      car._visualPreviousVX = car.velocityX; car._visualPreviousVZ = car.velocityZ;
      car._visualPreviousSteer = car._visualSteer ?? 0;
      car._visualPreviousAcceleration = car._visualAcceleration ?? 0;
      car._visualPreviousImpact = car._visualImpact ?? 0;
      car._visualImpact = (car._visualImpact ?? 0) * Math.exp(-dt * 12);
      car._visualSteer = controls.steer;
      car.throttle = controls.throttle;
      const beforeSpeed = car.velocityX * Math.sin(car.heading) + car.velocityZ * Math.cos(car.heading);
      this._updateNitro(car, controls, dt);
      car._prevX = car.x; car._prevZ = car.z;
      car._renderPreviousX = car.x; car._renderPreviousY = car.y;
      car._renderPreviousZ = car.z; car._renderPreviousHeading = car.heading;
      car._renderPreviousSpeed = car.speed;
      this._integrate(car, controls, dt, true);
      car._visualAcceleration = ((car.velocityX * Math.sin(car.heading) + car.velocityZ * Math.cos(car.heading)) - beforeSpeed) / dt;
      this._updateProgress(car);
      // Physical gate crossings (including a finish) precede lethal wall damage.
      if (car._pendingWallDamage! > 0) this.applyDamage(car, car._pendingWallDamage!);
      car._pendingWallDamage = 0;
    }
    if (this.vehicleContactsEnabled) this._resolveVehicleContacts(dt);
    // A legitimate final gate wins over incoming damage in the same step.
    if (!this.participants[0]?.finished) {
      this.cannon.step(dt, this.participants, this.elapsedTime,
        (car, damage, dirX, dirZ) => this.applyProjectileHit(car, damage, dirX, dirZ));
    }
    if (this.participants[0]?.finished || this.participants.every(car => car.finished)) this.status = 'finished';
  }

  getBotControls(car: RaceParticipant, dt = FIXED_DT) { return this.botController.controlsFor(car, this.participants, dt); }

  setVehicleContactsEnabled(enabled: boolean) { this.vehicleContactsEnabled = Boolean(enabled); }

  // Controlled simulation/debug API: raw HP before the pilot's small reduction.
  // Normal protection/finished/destruction guards always apply.
  applyDamage(car: RaceParticipant, amount: number) {
    return this.applyRawDamage(car, amount * car.vehicle.collisionDamageMultiplier);
  }

  applyProjectileHit(car: RaceParticipant, damage: number, dirX: number, dirZ: number) {
    const applied = this.applyRawDamage(car, damage);
    if (applied <= 0) return 0;
    car.shotImpactSequence = (car.shotImpactSequence ?? 0) + 1;
    car.shotImpactRemaining = 0.35;
    if (!car.destroyed) {
      car.velocityX = car.velocityX * 0.82 + dirX * 3;
      car.velocityZ = car.velocityZ * 0.82 + dirZ * 3;
      car.speed = Math.hypot(car.velocityX, car.velocityZ);
      car._visualImpact = Math.max(car._visualImpact ?? 0, 6);
    }
    return applied;
  }

  private applyRawDamage(car: RaceParticipant, amount: number) {
    if (car.finished || car.destroyed || car.respawnProtection > 0 || !Number.isFinite(amount) || amount <= 0) return 0;
    const previous = car.health;
    car.health = Math.max(0, previous - amount);
    if (car.health === 0) this._destroyCar(car, findNearestTrackPoint(this.track, car.x, car.z));
    return previous - car.health;
  }

  private _destroyInVoid(car: RaceParticipant, ramp: TrackJump): void {
    const takeoffDistance = ramp.takeoff * this.track.totalLength;
    const respawnDistance = takeoffDistance - ramp.rampLength - 45;
    const respawnSample = sampleTrackAtProgress(this.track, respawnDistance);
    const respawnPoint = findNearestTrackPoint(this.track, respawnSample.x, respawnSample.z);
    car.health = 0;
    const gate = this.gates[car._nextGate];
    const respawnGateSide = respawnPoint && gate
      ? (respawnPoint.x - gate.x) * gate.tangentX + (respawnPoint.z - gate.z) * gate.tangentZ
        - (car._respawnGateOffset ?? 0)
      : undefined;
    this._destroyCar(car, respawnPoint, respawnGateSide);
  }

  private _destroyCar(car: RaceParticipant, respawnPoint: NearestTrackPoint | null, gateSideOverride?: number): void {
    car.destroyed = true;
    car.destructionSequence += 1;
    car._destructionRemaining = DESTRUCTION_SECONDS;
    car._respawnPoint = respawnPoint;
    car._destructionGateSide = gateSideOverride
      ?? gateSide(car, this.gates[car._nextGate]) - (car._respawnGateOffset ?? 0);
    car.nitroActive = false; car.nitroRemaining = 0; car.nitroRecoveryRemaining = 0;
    this._resetMotion(car);
  }

  _resetMotion(car: RaceParticipant) {
    car.velocityX = 0; car.velocityZ = 0; car.speed = 0; car.throttle = 0;
    car.airborne = false; car.verticalVelocity = 0; car._activeJumpId = null;
    car._airborneElapsed = 0;
    car._driftBoost = 0; car._wallContactSide = 0; car._pendingWallDamage = 0;
    car._aiSteer = 0; car._aiThrottle = 0; car._aiBrake = 0; car._aiClock = 0;
    car._lane = car._baseLane;
    car._prevX = car.x; car._prevZ = car.z;
    car._renderPreviousX = car.x; car._renderPreviousY = car.y; car._renderPreviousZ = car.z;
    car._renderPreviousHeading = car.heading; car._renderPreviousSpeed = 0;
    car._visualPreviousVX = 0; car._visualPreviousVZ = 0;
    car._visualSteer = 0; car._visualPreviousSteer = 0;
    car._visualAcceleration = 0; car._visualPreviousAcceleration = 0;
    car._visualImpact = 0; car._visualPreviousImpact = 0;
    for (const other of this.participants) {
      this.contactCooldowns.delete(`${car.id}:${other.id}`);
      this.contactCooldowns.delete(`${other.id}:${car.id}`);
    }
  }

  _respawn(car: RaceParticipant) {
    const point = car._respawnPoint!;
    car.x = point.x; car.y = point.y; car.z = point.z;
    car.heading = Math.atan2(point.tangentX, point.tangentZ);
    // A lateral projection can land just beyond the expected tangent plane.
    // Preserve that unconsumed crossing, but require real forward motion after
    // respawn. The teleport itself never calls the gate validator.
    const side = gateSide(car, this.gates[car._nextGate]);
    car._respawnGateOffset = car._destructionGateSide! <= 1e-8 && side > 0 ? side : 0;
    // Only the projection baseline changes; teleport earns no race progress.
    // The distance still owed after reversing survives this baseline reset.
    car._lastPathDistance = point.distance;
    car.health = car.maxHealth; car.destroyed = false;
    car.respawnProtection = RESPAWN_PROTECTION_SECONDS;
    car.respawnSequence += 1;
    this._resetMotion(car);
  }

  _updateNitro(car: RaceParticipant, controls: Pick<RaceControls, 'nitro'>, dt: number) {
    const requested = car.vehicle.nitroCharges > 0 && controls.nitro;
    if (requested && !car._nitroWasRequested && car.nitroCharges > 0 && !car.nitroActive) {
      car.nitroCharges -= 1;
      car.nitroActive = true;
      car.nitroRemaining = car.vehicle.nitroSeconds;
      car.nitroRecoveryRemaining = 0;
    }
    car._nitroWasRequested = requested;
    if (car.nitroActive) {
      car.nitroRemaining = Math.max(0, car.nitroRemaining - dt);
      if (car.nitroRemaining === 0) {
        car.nitroActive = false;
        car.nitroRecoveryRemaining = car.vehicle.nitroRecoverySeconds;
      }
    } else if (car.nitroRecoveryRemaining > 0) {
      car.nitroRecoveryRemaining = Math.max(0, car.nitroRecoveryRemaining - dt);
    }
  }

  _integrate(car: RaceParticipant, controls: NormalizedControls, dt: number, deferDamage = false) {
    if (car.destroyed || car.finished) return;
    const previousX = car.x, previousZ = car.z, previousY = car.y;
    const damage = damageHandling(car);
    const previousSpeed = Math.hypot(car.velocityX, car.velocityZ);
    const v = car.vehicle; const forwardX = Math.sin(car.heading); const forwardZ = Math.cos(car.heading);
    let longitudinal = car.velocityX * forwardX + car.velocityZ * forwardZ;
    const lateralX = car.velocityX - forwardX * longitudinal; const lateralZ = car.velocityZ - forwardZ * longitudinal;
    if (!car.airborne) {
      const surface = sampleTrackSurface(this.track, this.track.jumps, car._lastPathDistance);
      if (surface.hasGround && surface.ramp && Math.abs(surface.grade) > 1e-6) {
        const slopeSine = surface.grade / Math.sqrt(1 + surface.grade * surface.grade);
        const headingAlignment = trackHeadingAlignment(car.heading, surface.tangentX, surface.tangentZ);
        longitudinal -= RAMP_GRAVITY * RAMP_GRAVITY_SCALE * slopeSine * headingAlignment * dt;
      }
    }
    longitudinal += controls.throttle * v.acceleration * dt;
    // Braking cannot cross zero by itself; reverse comes from negative throttle
    // in the player adapter, not an overshooting brake impulse.
    longitudinal = Math.sign(longitudinal) * Math.max(0, Math.abs(longitudinal) - controls.brake * v.braking * dt);
    const dragRate = controls.throttle !== 0
      ? v.poweredDrag ?? 0.15
      : v.coastingDrag ?? 0.15;
    longitudinal *= Math.max(0, 1 - (dragRate + controls.handbrake * 1.8) * dt);
    const recoveryFraction = clamp(v.nitroRecoverySeconds > 0
      ? car.nitroRecoveryRemaining / v.nitroRecoverySeconds : 0, 0, 1);
    const speedMultiplier = car.nitroActive ? v.nitroMultiplier
      : 1 + (v.nitroMultiplier - 1) * recoveryFraction;
    const carriedSpeedLimit = v.maxSpeed * Math.max(speedMultiplier,
      1 + RACE_HANDLING_TUNING.driftSpeedBonus * car._driftBoost);
    longitudinal = clamp(longitudinal, -v.maxSpeed * 0.25, carriedSpeedLimit);
    // Apply drive/braking along the OLD heading. Steering must not rotate the
    // existing world velocity, otherwise even a late turn instantly redirects it.
    let velocityX = forwardX * longitudinal + lateralX;
    let velocityZ = forwardZ * longitudinal + lateralZ;
    const speedRatio = Math.hypot(velocityX, velocityZ) / v.maxSpeed;
    const steeringAuthority = 1 / (1 + speedRatio * speedRatio * RACE_HANDLING_TUNING.highSpeedSteeringLoss);
    const previousHeading = car.heading;
    car.heading += controls.steer * v.steering * damage.steering * steeringAuthority
      * clamp(Math.abs(longitudinal) / RACE_HANDLING_TUNING.steeringSpeedRamp, 0, 1) * dt * Math.sign(longitudinal || 1);
    const sideX = Math.cos(car.heading), sideZ = -Math.sin(car.heading);
    const sidewaysSpeed = velocityX * sideX + velocityZ * sideZ;
    // Arcade rear-wheel drive: under cornering load, acceleration spends part
    // of the rear tires' grip. Lifting restores it, without snapping the velocity
    // into line. The effect fades at low speed and does not destabilize straights.
    const cornerLoad = clamp(Math.abs(sidewaysSpeed) / 6 + Math.abs(controls.steer) * 0.7, 0, 1);
    const powerSlip = Math.max(0, controls.throttle) * clamp(Math.abs(longitudinal) / v.maxSpeed, 0, 1)
      * cornerLoad * RACE_HANDLING_TUNING.powerOversteer;
    const grip = clamp(v.grip * damage.grip * (1 - powerSlip) * (1 - controls.handbrake * 0.72), 0, 0.98);
    const lateralResponse = grip * RACE_HANDLING_TUNING.lateralResponse
      / (1 + speedRatio * speedRatio * RACE_HANDLING_TUNING.highSpeedGripLoss);
    const lateralCorrection = clamp(sidewaysSpeed * (1 - Math.exp(-lateralResponse * dt)),
      -grip * RACE_HANDLING_TUNING.lateralAcceleration * dt,
      grip * RACE_HANDLING_TUNING.lateralAcceleration * dt);
    // With no drive, tire scrub still dissipates energy naturally.
    velocityX -= sideX * lateralCorrection;
    velocityZ -= sideZ * lateralCorrection;
    // Arcade traction pays back tire scrub in a forward powered drift, plus a
    // modest acceleration along the EXISTING trajectory. No free gain while
    // braking, using the handbrake, reversing or merely sliding after an impact.
    const driftDrive = longitudinal > 5 && speedRatio > 0.35 && controls.brake === 0 && controls.handbrake === 0
      ? Math.max(0, controls.throttle) * clamp((Math.abs(sidewaysSpeed) / Math.max(previousSpeed, 1) - 0.1) / 0.35, 0, 1)
      : 0;
    const boostResponse = 1 - Math.exp(-dt * (driftDrive > car._driftBoost ? 6 : 2));
    car._driftBoost += (driftDrive - car._driftBoost) * boostResponse;
    // Drift has a small bounded bonus; it never stacks on top of nitro. Decay
    // the bonus progressively on exit instead of abruptly cutting the speed.
    const speedLimit = v.maxSpeed * Math.max(speedMultiplier, 1 + RACE_HANDLING_TUNING.driftSpeedBonus * car._driftBoost);
    const speed = Math.hypot(velocityX, velocityZ);
    const cornerYawRate = Math.abs(angleDelta(car.heading - previousHeading)) / dt;
    const lateralDemand = Math.abs(longitudinal) * cornerYawRate;
    const lateralCapacity = grip * RACE_HANDLING_TUNING.lateralAcceleration;
    const cornerOverload = clamp((lateralDemand - lateralCapacity) / Math.max(lateralCapacity, 1), 0, 1);
    const cornerSpeed = speed * Math.max(0, 1 - RACE_HANDLING_TUNING.corneringSpeedDrag * cornerOverload * dt);
    const tractionSpeed = driftDrive > 0
      ? Math.max(cornerSpeed, previousSpeed + v.acceleration * RACE_HANDLING_TUNING.driftAcceleration * driftDrive * dt)
      : cornerSpeed;
    const targetSpeed = Math.min(tractionSpeed, speedLimit);
    const speedScale = speed > 0 ? targetSpeed / speed : 1;
    car.velocityX = velocityX * speedScale;
    car.velocityZ = velocityZ * speedScale;
    car.x += car.velocityX * dt; car.z += car.velocityZ * dt; car.speed = speed * speedScale;
    const nearest = findNearestTrackPoint(this.track, car.x, car.z);
    if (!nearest) return;
    if (!car.airborne) {
      const edge = this.track.width / 2 - 1.2;
      if (Math.abs(nearest.lateral) < edge - WALL_CONTACT_RELEASE
        || Math.sign(nearest.lateral) !== car._wallContactSide) car._wallContactSide = 0;
      if (Math.abs(nearest.lateral) > edge) {
        if (this.diagnostics) this.lastAdvanceBarrierCorrections += 1;
        const side = Math.sign(nearest.lateral);
        const correction = Math.abs(nearest.lateral) - edge;
        // A contact episode halves total speed once, not on every physics step.
        // Separation from the wall (or hitting the opposite side) arms a new hit.
        const normalX = -nearest.tangentZ * side, normalZ = nearest.tangentX * side;
        car.x -= normalX * correction;
        car.z -= normalZ * correction;
        const outwardSpeed = car.velocityX * normalX + car.velocityZ * normalZ;
        if (outwardSpeed > 0) {
          const impactSpeed = car.speed;
          car._visualImpact = Math.max(car._visualImpact ?? 0, outwardSpeed);
          const response = outwardSpeed * (1 + WALL_RESTITUTION);
          car.velocityX -= normalX * response;
          car.velocityZ -= normalZ * response;
          if (car._wallContactSide !== side) {
            const reboundSpeed = Math.hypot(car.velocityX, car.velocityZ);
            const impactScale = impactSpeed * car.vehicle.wallSpeedRetention / reboundSpeed;
            car.velocityX *= impactScale;
            car.velocityZ *= impactScale;
            const amount = impactDamage(outwardSpeed);
            if (deferDamage) car._pendingWallDamage = amount;
            else this.applyDamage(car, amount);
          }
          if (!car.destroyed) car._wallContactSide = side;
        }
        car.speed = Math.hypot(car.velocityX, car.velocityZ);
      }
    } else car._wallContactSide = 0;
    const groundSurface = sampleTrackSurface(this.track, this.track.jumps, nearest.distance);
    const groundY = groundSurface.y;
    const trackForwardSpeed = car.velocityX * groundSurface.tangentX + car.velocityZ * groundSurface.tangentZ;
    if (!car.airborne) {
      const travelled = this.trackDistanceDelta(car._lastPathDistance, nearest.distance);
      const jump = (this.track.jumps ?? []).find(candidate => {
        if (travelled <= 0 || trackForwardSpeed < candidate.minimumSpeed) return false;
        if (!groundSurface.hasGround && candidate.id !== groundSurface.ramp?.id) return false;
        const takeoff = candidate.takeoff * this.track.totalLength;
        const offset = this.forwardTrackDistance(car._lastPathDistance, takeoff);
        return offset <= travelled + 1e-6;
      });
      if (jump) {
        const takeoffDistance = jump.takeoff * this.track.totalLength;
        const takeoffSurface = sampleTrackSurface(this.track, this.track.jumps, takeoffDistance - 1e-4);
        const naturalLaunch = jump.kind === 'jump' || jump.kind === 'platform' || jump.kind === 'double'
          || !groundSurface.hasGround
          || car.speed * car.speed * Math.max(0, -takeoffSurface.curvature) >= AIR_GRAVITY * 0.85;
        if (trackForwardSpeed >= jump.minimumSpeed && naturalLaunch) {
          car.airborne = true;
          car._activeJumpId = jump.id;
          car._airborneElapsed = 0;
          // The car may cross the lip and enter the first gap in one fixed step.
          // Launch from the ramp's edge height, not from the empty space below it.
          car.y = takeoffSurface.y;
          const launchSpeed = softenedJumpLaunchSpeed(trackForwardSpeed);
          const vehicleLaunchSpeed = softenedJumpLaunchSpeed(car.speed);
          const lipVelocity = jump.kind === 'platform' || jump.kind === 'double'
            ? Math.max(takeoffSurface.grade * launchSpeed,
              vehicleLaunchSpeed * Math.sin(jump.launchAngleDegrees * Math.PI / 180))
            : takeoffSurface.grade * launchSpeed;
          // Keep horizontal speed intact. Only vertical ramp energy softens
          // above normal speed, with diminishing gains rather than a hard cap.
          car.verticalVelocity = lipVelocity;
        }
      }
    }

    if (!car.airborne) {
      if (!groundSurface.hasGround && groundSurface.ramp) {
        // A missed takeoff enters a real fall instead of hovering at road height.
        car.airborne = true;
        car._activeJumpId = groundSurface.ramp.id;
        car._airborneElapsed = 0;
        car.verticalVelocity = 0;
      } else {
        car.y = groundY;
        car.verticalVelocity = 0;
        return;
      }
    }
    const flightStartY = car.y;
    const flightStartVerticalVelocity = car.verticalVelocity;
    car._airborneElapsed += dt;
    car.verticalVelocity -= AIR_GRAVITY * dt;
    car.y += car.verticalVelocity * dt;
    // Sweep the fixed-step flight segment so narrow/elevated surfaces are not
    // skipped at high speed. Ramp samples are physical collision profiles;
    // landingStart/landingEnd are layout metadata, not landing constraints.
    const distanceDelta = this.trackDistanceDelta(car._lastPathDistance, nearest.distance);
    const sweepSteps = clamp(Math.ceil(Math.abs(distanceDelta) / 0.5), 1, 8);
    let previousSweepHasGround = false;
    let previousSweepY = flightStartY;
    let previousSweepClearance = 0;
    for (let step = 0; step <= sweepSteps; step += 1) {
      const amount = step / sweepSteps;
      const surfaceDistance = car._lastPathDistance + distanceDelta * amount;
      const surface = sampleTrackSurface(this.track, this.track.jumps, surfaceDistance);
      const elapsed = dt * amount;
      const trajectoryY = flightStartY + flightStartVerticalVelocity * elapsed - AIR_GRAVITY * elapsed * elapsed;
      if (!surface.hasGround) {
        previousSweepHasGround = false;
        previousSweepY = trajectoryY;
        continue;
      }
      const clearance = trajectoryY - surface.y;
      const priorClearance = previousSweepHasGround
        ? previousSweepClearance
        : previousSweepY - surface.y;
      const crossedSurfaceWhileDescending = step > 0 && priorClearance >= -1e-4
        && clearance <= 1e-4 && clearance < priorClearance;
      if (crossedSurfaceWhileDescending) {
        const crossing = priorClearance / Math.max(priorClearance - clearance, 1e-8);
        const contactAmount = (step - 1 + clamp(crossing, 0, 1)) / sweepSteps;
        const contactDistance = car._lastPathDistance + distanceDelta * contactAmount;
        const contactSurface = sampleTrackSurface(this.track, this.track.jumps, contactDistance);
        car.x = previousX + (car.x - previousX) * contactAmount;
        car.z = previousZ + (car.z - previousZ) * contactAmount;
        car.y = contactSurface.y;
        const contactTrackSpeed = car.velocityX * contactSurface.tangentX + car.velocityZ * contactSurface.tangentZ;
        const relativeVerticalSpeed = car.verticalVelocity - contactSurface.grade * contactTrackSpeed;
        const landingSpeed = Math.abs(relativeVerticalSpeed)
          / Math.sqrt(1 + contactSurface.grade * contactSurface.grade);
        car.airborne = false;
        car.verticalVelocity = 0;
        car._activeJumpId = null;
        car._airborneElapsed = 0;
        car._landingSequence = (car._landingSequence ?? 0) + 1;
        car._landingImpactSpeed = landingSpeed;
        car._landingSurfaceSlope = Math.atan(contactSurface.grade);
        car._visualImpact = Math.max(car._visualImpact ?? 0, landingSpeed * 0.6);
        return;
      }
      previousSweepHasGround = true;
      previousSweepY = trajectoryY;
      previousSweepClearance = clearance;
    }
    const fallRamp = groundSurface.ramp
      ?? this.track.jumps?.find(jump => jump.id === car._activeJumpId);
    if (fallRamp && car.y <= groundY - 1
      && (!groundSurface.hasGround || car.airborne)) {
      // A gap has no collision surface; being below the roadway after missing
      // a surface is also a real void fall. Both use the existing respawn flow.
      this._destroyInVoid(car, fallRamp);
    }
  }

  private trackDistanceDelta(from: number, to: number): number {
    let delta = to - from;
    if (delta < -this.track.totalLength / 2) delta += this.track.totalLength;
    else if (delta > this.track.totalLength / 2) delta -= this.track.totalLength;
    return delta;
  }

  private forwardTrackDistance(from: number, to: number): number {
    return ((to - from) % this.track.totalLength + this.track.totalLength) % this.track.totalLength;
  }

  _updateProgress(car: RaceParticipant) {
    if (car.destroyed || car.finished) return;
    const nearest = findNearestTrackPoint(this.track, car.x, car.z)!;
    const previousDistance = car._lastPathDistance;
    let delta = nearest.distance - previousDistance;
    if (delta < -this.track.totalLength / 2) delta += this.track.totalLength;
    else if (delta > this.track.totalLength / 2) delta -= this.track.totalLength;
    // Track the physical cursor in BOTH directions. Revisited ground repays
    // reverse travel before it can raise the race-distance high-water mark.
    // Keeping this debt separate also preserves it through a lateral respawn.
    const debt = (car._progressDebt ?? 0) - delta;
    car._progressDebt = Math.max(0, debt);
    car._distance += Math.max(0, -debt);
    car._lastPathDistance = nearest.distance;
    car.progress = clamp(car._distance / (this.laps * this.track.totalLength), 0, 1);
    const gate = this.gates[car._nextGate];
    if (!gate || !crossesGate(car, gate, car._respawnGateOffset ?? 0)) return;
    car._respawnGateOffset = 0;
    if (car._nextGate < 3) {
      car._nextGate += 1;
      car.nextCheckpoint = car._nextGate + 1;
    } else {
      car.lapsCompleted += 1;
      car._nextGate = 0;
      car.nextCheckpoint = 1;
      if (car.lapsCompleted >= this.laps) {
        car.finished = true; car.finishTime = this.elapsedTime; car._finishOrder = ++this.finishSequence;
        car.throttle = 0;
      }
    }
  }

  _resolveVehicleContacts(dt = FIXED_DT) {
    for (const [key, remaining] of this.contactCooldowns) {
      if (remaining <= dt + 1e-8) this.contactCooldowns.delete(key);
      else this.contactCooldowns.set(key, remaining - dt);
    }
    for (let i = 0; i < this.participants.length; i += 1) for (let j = i + 1; j < this.participants.length; j += 1) {
      const a = this.participants[i]; const b = this.participants[j];
      if (a.finished || b.finished || a.destroyed || b.destroyed || a.respawnProtection > 0 || b.respawnProtection > 0) continue;
      const dx = b.x - a.x; const dz = b.z - a.z; const distance = Math.hypot(dx, dz);
      if (distance >= 4.2) continue;
      // Coincident centers still need a deterministic separation direction;
      // skipping this case let cars occupy the same point without colliding.
      const nx = distance < CONTACT_NORMAL_EPSILON ? -Math.cos(a.heading) : dx / distance;
      const nz = distance < CONTACT_NORMAL_EPSILON ? Math.sin(a.heading) : dz / distance;
      const overlap = (4.2 - distance) / 2;
      if (this.diagnostics) this.lastAdvanceContactCorrections += 1;
      // Integration was already validated. Only this new separation segment
      // may cross another gate; validate it before potentially lethal damage.
      a._prevX = a.x; a._prevZ = a.z;
      b._prevX = b.x; b._prevZ = b.z;
      a.x -= nx * overlap; a.z -= nz * overlap; b.x += nx * overlap; b.z += nz * overlap;
      this._updateProgress(a);
      this._updateProgress(b);
      const relative = (b.velocityX - a.velocityX) * nx + (b.velocityZ - a.velocityZ) * nz;
      if (relative < 0) {
        a._visualImpact = Math.max(a._visualImpact ?? 0, -relative);
        b._visualImpact = Math.max(b._visualImpact ?? 0, -relative);
        const impulse = -relative * 0.52;
        a.velocityX -= nx * impulse * b.vehicle.collisionShove / a.vehicle.impactResistance;
        a.velocityZ -= nz * impulse * b.vehicle.collisionShove / a.vehicle.impactResistance;
        b.velocityX += nx * impulse * a.vehicle.collisionShove / b.vehicle.impactResistance;
        b.velocityZ += nz * impulse * a.vehicle.collisionShove / b.vehicle.impactResistance;
        a.speed = Math.hypot(a.velocityX, a.velocityZ); b.speed = Math.hypot(b.velocityX, b.velocityZ);
        const key = `${a.id}:${b.id}`;
        if (impactDamage(-relative) > 0 && !this.contactCooldowns.has(key)) {
          const amount = impactDamage(-relative);
          this.applyDamage(a, amount);
          this.applyDamage(b, amount);
          if (!a.destroyed && !b.destroyed) this.contactCooldowns.set(key, CONTACT_DAMAGE_COOLDOWN);
        }
      }
    }
  }
}
