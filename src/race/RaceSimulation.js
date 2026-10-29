import { DIFFICULTIES } from '../data/raceDifficulty.js';
import { VEHICLE, VEHICLES, getVehicleById } from '../data/vehicles.js';
import { BotController } from './BotController.js';
import { damageHandling, healthCapacity, impactDamage, DESTRUCTION_SECONDS, RESPAWN_PROTECTION_SECONDS } from './damageMath.js';
import { findNearestTrackPoint, sampleRaceTrack, sampleTrackAtProgress } from './trackMath.js';

export { findNearestTrackPoint, sampleRaceTrack, sampleTrackAtProgress } from './trackMath.js';

const FIXED_DT = 1 / 60;
const MAX_FRAME_SECONDS = 0.25;
const NITRO_RECOVERY_SECONDS = 1;
const CONTACT_DAMAGE_COOLDOWN = 0.85;
const WALL_RESTITUTION = 0.18;
const WALL_SPEED_RETAINED = 0.5;
const WALL_CONTACT_RELEASE = 0.15;
const CONTACT_NORMAL_EPSILON = 0.001;
// Grip redirects momentum progressively, with a finite lateral acceleration.
// At race speed the body can turn faster than the trajectory: natural drift.
const LATERAL_RESPONSE = 5.5;
const LATERAL_ACCELERATION = 28;
const HIGH_SPEED_GRIP_LOSS = 1.8;
const HIGH_SPEED_STEERING_LOSS = 0.3;
const POWER_OVERSTEER = 0.5;
const DRIFT_SPEED_BONUS = 0.06;
const DRIFT_ACCELERATION = 0.15;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, amount) => a + (b - a) * amount;
const angleDelta = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

export function deriveHandlingStats(vehicleStats = {}, pilotStats = {}, ability = {}) {
  const rating = key => clamp(Number(pilotStats[key] ?? 5), 1, 10);
  const relative = key => (rating(key) - 5) / 5;
  const vehicle = key => clamp(Number(vehicleStats[key] ?? 60), 0, 100) / 100;
  return {
    maxSpeed: (16 + vehicle('speed') * 20) * (1 + relative('speed') * 0.08),
    acceleration: (6 + vehicle('acceleration') * 12) * (1 + relative('acceleration') * 0.12),
    grip: 0.35 + vehicle('control') * 0.6 + relative('handling') * 0.16,
    steering: 1.35 + vehicle('control') * 0.9 + relative('handling') * 0.34,
    endurance: 0.75 + rating('endurance') * 0.05,
    collisionShove: 1 + (rating('aggression') - 1) / 9 * 0.45,
    braking: 22,
    collisionDamageMultiplier: 1 - (rating('endurance') - 1) / 9 * 0.1,
    nitroCharges: Math.max(0, Math.floor(Number(ability.nitroCharges) || 0)),
    nitroSeconds: Math.max(0, Number(ability.nitroSeconds) || 0),
    nitroMultiplier: Math.max(1, Number(ability.nitroMultiplier) || 1),
    nitroRecoverySeconds: NITRO_RECOVERY_SECONDS,
  };
}

function normalizeControls(controls = {}) {
  return { throttle: clamp(Number(controls.throttle ?? 0), -1, 1), brake: clamp(Number(controls.brake ?? 0), 0, 1), steer: clamp(Number(controls.steer ?? 0), -1, 1), handbrake: clamp(Number(controls.handbrake ?? 0), 0, 1), nitro: Boolean(controls.nitro) };
}

function createGate(sampled, fraction, width) {
  const center = sampleTrackAtProgress(sampled, sampled.totalLength * fraction);
  return { x: center.x, z: center.z, tangentX: center.tangentX, tangentZ: center.tangentZ, lateralLimit: width / 2, distance: center.distance };
}

function gateSide(car, gate) {
  return (car.x - gate.x) * gate.tangentX + (car.z - gate.z) * gate.tangentZ;
}

function crossesGate(car, gate, planeOffset = 0) {
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
  constructor({ track, difficulty = 'normal', player, playerVehicle = VEHICLE, vehicleStats,
    playerPaint = '#e53935', botPilots = [], laps = track?.laps, diagnostics = false } = {}) {
    if (!track?.waypoints || !Array.isArray(track.startGrid)) throw new TypeError('track com waypoints e startGrid é obrigatório.');
    if (!player?.id || !player?.name) throw new TypeError('player precisa de id e name.');
    if (!Array.isArray(botPilots) || botPilots.length !== 3) throw new RangeError('A corrida requer exatamente três botPilots.');
    const sampled = sampleRaceTrack(track);
    this.track = { ...sampled, width: track.width, laps: laps ?? track.laps };
    this.difficulty = typeof difficulty === 'string' ? DIFFICULTIES[difficulty] : difficulty;
    if (!this.difficulty) throw new RangeError('Dificuldade desconhecida.');
    this.botController = new BotController(this.track, this.difficulty);
    this.laps = Math.max(1, Math.floor(this.track.laps));
    this.gates = [0.25, 0.5, 0.75, 1].map(fraction => createGate(sampled, fraction, track.width));
    this.gates[3].distance = sampled.totalLength;
    this.status = 'waiting'; this.elapsedTime = 0; this.accumulator = 0; this.finishSequence = 0;
    this.diagnostics = diagnostics;
    this.vehicleContactsEnabled = true;
    if (diagnostics) this.diagnosticAdvanceCalls = 0;
    const entrants = [{ ...player, isPlayer: true, paintColor: playerPaint, vehicle: playerVehicle,
      vehicleStats: vehicleStats ?? playerVehicle.stats }, ...botPilots.map((bot, index) => {
      const vehicle = getVehicleById(bot.vehicleId) ?? VEHICLES[(index + 1) % VEHICLES.length];
      return { ...bot, isPlayer: false, vehicle,
        vehicleStats: bot.vehicleStats ?? vehicle.stats,
        paintColor: bot.paintColor ?? ['#41d7ff', '#ffbd38', '#a68cff'][index] };
    })];
    this.participants = entrants.map((entry, index) => {
      const grid = track.startGrid[index];
      if (!grid) throw new RangeError('startGrid deve conter quatro posições.');
      const startProgress = sampled.totalLength * (index < 2 ? 0.985 : 0.965);
      const center = sampleTrackAtProgress(sampled, startProgress);
      const lane = Number(grid.lane ?? (index % 2 ? 1.5 : -1.5));
      const x = center.x - center.tangentZ * lane; const z = center.z + center.tangentX * lane;
      const capacity = healthCapacity(entry.vehicleStats.armor);
      return {
        id: entry.id, name: entry.name, isPlayer: entry.isPlayer, paintColor: entry.paintColor,
        vehicleId: entry.vehicle.id,
        x, z, y: center.y, heading: Math.atan2(center.tangentX, center.tangentZ), velocityX: 0, velocityZ: 0, speed: 0, throttle: 0,
        lapsCompleted: 0, nextCheckpoint: 1, finished: false, finishTime: null,
        progress: startProgress / (this.laps * sampled.totalLength), rank: index + 1,
        vehicle: deriveHandlingStats(entry.vehicleStats, entry.stats, entry.vehicle.ability),
        nitroCharges: entry.vehicle.ability.nitroCharges ?? 0, nitroActive: false,
        nitroRemaining: 0, nitroRecoveryRemaining: 0, _nitroWasRequested: false,
        ...capacity, health: capacity.maxHealth, destroyed: false, respawnProtection: 0,
        destructionSequence: 0, respawnSequence: 0, _destructionRemaining: 0,
        _driftBoost: 0, _wallContactSide: 0,
        _distance: startProgress, _lastPathDistance: startProgress, _progressDebt: 0,
        _nextGate: 0, _prevX: x, _prevZ: z, _trackWidth: track.width, _lane: lane, _baseLane: lane,
        _aiSteer: 0, _aiThrottle: 0, _aiBrake: 0, _aiClock: 0,
      };
    });
    this.contactCooldowns = new Map();
  }

  start() { if (this.status === 'waiting') this.status = 'racing'; return this; }

  advance(deltaMs, controls = {}) {
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

  getRenderPose(car, alpha = this.accumulator / FIXED_DT, output = {}) {
    if (car.finished || car.destroyed) {
      output.x = car.x; output.y = car.y; output.z = car.z;
      output.heading = car.heading; output.speed = car.speed;
      return output;
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
    return output;
  }

  getStandings() {
    return [...this.participants].sort((a, b) => (a.finished && b.finished ? a.finishTime - b.finishTime : a.finished ? -1 : b.finished ? 1 : b.progress - a.progress)).map((car, index) => {
      car.rank = index + 1;
      return car;
    });
  }

  // Presentation telemetry only; never feeds forces, controls, gates or saves.
  getVisualTelemetry(car, output = this.getRenderPose(car)) {
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
    return output;
  }

  _step(dt, playerControls) {
    this.elapsedTime += dt;
    for (const car of this.participants) {
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
      if (car._pendingWallDamage > 0) this.applyDamage(car, car._pendingWallDamage);
      car._pendingWallDamage = 0;
    }
    if (this.vehicleContactsEnabled) this._resolveVehicleContacts(dt);
    if (this.participants.every(car => car.finished)) this.status = 'finished';
  }

  getBotControls(car, dt = FIXED_DT) { return this.botController.controlsFor(car, this.participants, dt); }

  setVehicleContactsEnabled(enabled) { this.vehicleContactsEnabled = Boolean(enabled); }

  // Controlled simulation/debug API: raw HP before the pilot's small reduction.
  // Normal protection/finished/destruction guards always apply.
  applyDamage(car, amount) {
    if (car.finished || car.destroyed || car.respawnProtection > 0 || !Number.isFinite(amount) || amount <= 0) return 0;
    const previous = car.health;
    car.health = Math.max(0, previous - amount * car.vehicle.collisionDamageMultiplier);
    if (car.health === 0) {
      car.destroyed = true;
      car.destructionSequence += 1;
      car._destructionRemaining = DESTRUCTION_SECONDS;
      car._respawnPoint = findNearestTrackPoint(this.track, car.x, car.z);
      car._destructionGateSide = gateSide(car, this.gates[car._nextGate]) - (car._respawnGateOffset ?? 0);
      car.nitroActive = false; car.nitroRemaining = 0; car.nitroRecoveryRemaining = 0;
      this._resetMotion(car);
    }
    return previous - car.health;
  }

  _resetMotion(car) {
    car.velocityX = 0; car.velocityZ = 0; car.speed = 0; car.throttle = 0;
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

  _respawn(car) {
    const point = car._respawnPoint;
    car.x = point.x; car.y = point.y; car.z = point.z;
    car.heading = Math.atan2(point.tangentX, point.tangentZ);
    // A lateral projection can land just beyond the expected tangent plane.
    // Preserve that unconsumed crossing, but require real forward motion after
    // respawn. The teleport itself never calls the gate validator.
    const side = gateSide(car, this.gates[car._nextGate]);
    car._respawnGateOffset = car._destructionGateSide <= 1e-8 && side > 0 ? side : 0;
    // Only the projection baseline changes; teleport earns no race progress.
    // The distance still owed after reversing survives this baseline reset.
    car._lastPathDistance = point.distance;
    car.health = car.maxHealth; car.destroyed = false;
    car.respawnProtection = RESPAWN_PROTECTION_SECONDS;
    car.respawnSequence += 1;
    this._resetMotion(car);
  }

  _updateNitro(car, controls, dt) {
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

  _integrate(car, controls, dt, deferDamage = false) {
    if (car.destroyed || car.finished) return;
    const damage = damageHandling(car);
    const previousSpeed = Math.hypot(car.velocityX, car.velocityZ);
    const v = car.vehicle; const forwardX = Math.sin(car.heading); const forwardZ = Math.cos(car.heading);
    let longitudinal = car.velocityX * forwardX + car.velocityZ * forwardZ;
    const lateralX = car.velocityX - forwardX * longitudinal; const lateralZ = car.velocityZ - forwardZ * longitudinal;
    longitudinal += controls.throttle * v.acceleration * dt;
    // Braking cannot cross zero by itself; reverse comes from negative throttle
    // in the player adapter, not an overshooting brake impulse.
    longitudinal = Math.sign(longitudinal) * Math.max(0, Math.abs(longitudinal) - controls.brake * v.braking * dt);
    longitudinal *= Math.max(0, 1 - (0.15 + controls.handbrake * 1.8) * dt);
    const recoveryFraction = clamp(v.nitroRecoverySeconds > 0
      ? car.nitroRecoveryRemaining / v.nitroRecoverySeconds : 0, 0, 1);
    const speedMultiplier = car.nitroActive ? v.nitroMultiplier
      : 1 + (v.nitroMultiplier - 1) * recoveryFraction;
    const carriedSpeedLimit = v.maxSpeed * Math.max(speedMultiplier, 1 + DRIFT_SPEED_BONUS * car._driftBoost);
    longitudinal = clamp(longitudinal, -v.maxSpeed * 0.25, carriedSpeedLimit);
    // Apply drive/braking along the OLD heading. Steering must not rotate the
    // existing world velocity, otherwise even a late turn instantly redirects it.
    let velocityX = forwardX * longitudinal + lateralX;
    let velocityZ = forwardZ * longitudinal + lateralZ;
    const speedRatio = Math.hypot(velocityX, velocityZ) / v.maxSpeed;
    const steeringAuthority = 1 / (1 + speedRatio * speedRatio * HIGH_SPEED_STEERING_LOSS);
    car.heading += controls.steer * v.steering * damage.steering * steeringAuthority
      * clamp(Math.abs(longitudinal) / 5, 0, 1) * dt * Math.sign(longitudinal || 1);
    const sideX = Math.cos(car.heading), sideZ = -Math.sin(car.heading);
    const sidewaysSpeed = velocityX * sideX + velocityZ * sideZ;
    // Arcade rear-wheel drive: under cornering load, acceleration spends part
    // of the rear tires' grip. Lifting restores it, without snapping the velocity
    // into line. The effect fades at low speed and does not destabilize straights.
    const cornerLoad = clamp(Math.abs(sidewaysSpeed) / 6 + Math.abs(controls.steer) * 0.7, 0, 1);
    const powerSlip = Math.max(0, controls.throttle) * clamp(Math.abs(longitudinal) / v.maxSpeed, 0, 1)
      * cornerLoad * POWER_OVERSTEER;
    const grip = clamp(v.grip * damage.grip * (1 - powerSlip) * (1 - controls.handbrake * 0.72), 0, 0.98);
    const lateralResponse = grip * LATERAL_RESPONSE / (1 + speedRatio * speedRatio * HIGH_SPEED_GRIP_LOSS);
    const lateralCorrection = clamp(sidewaysSpeed * (1 - Math.exp(-lateralResponse * dt)),
      -grip * LATERAL_ACCELERATION * dt, grip * LATERAL_ACCELERATION * dt);
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
    const speedLimit = v.maxSpeed * Math.max(speedMultiplier, 1 + DRIFT_SPEED_BONUS * car._driftBoost);
    const speed = Math.hypot(velocityX, velocityZ);
    const tractionSpeed = driftDrive > 0
      ? Math.max(speed, previousSpeed + v.acceleration * DRIFT_ACCELERATION * driftDrive * dt)
      : speed;
    const targetSpeed = Math.min(tractionSpeed, speedLimit);
    const speedScale = speed > 0 ? targetSpeed / speed : 1;
    car.velocityX = velocityX * speedScale;
    car.velocityZ = velocityZ * speedScale;
    car.x += car.velocityX * dt; car.z += car.velocityZ * dt; car.speed = speed * speedScale;
    const nearest = findNearestTrackPoint(this.track, car.x, car.z);
    if (!nearest) return;
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
          const impactScale = impactSpeed * WALL_SPEED_RETAINED / reboundSpeed;
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
    car.y = sampleTrackAtProgress(this.track, nearest.distance).y;
  }

  _updateProgress(car) {
    if (car.destroyed || car.finished) return;
    const nearest = findNearestTrackPoint(this.track, car.x, car.z);
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
        a.velocityX -= nx * impulse / a.vehicle.collisionShove; a.velocityZ -= nz * impulse / a.vehicle.collisionShove;
        b.velocityX += nx * impulse / b.vehicle.collisionShove; b.velocityZ += nz * impulse / b.vehicle.collisionShove;
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
