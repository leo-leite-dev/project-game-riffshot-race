import { DIFFICULTIES } from '../data/raceDifficulty.js';
import { BotController } from './BotController.js';
import { findNearestTrackPoint, sampleRaceTrack, sampleTrackAtProgress } from './trackMath.js';

export { findNearestTrackPoint, sampleRaceTrack, sampleTrackAtProgress } from './trackMath.js';

const FIXED_DT = 1 / 60;
const MAX_FRAME_SECONDS = 0.25;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, amount) => a + (b - a) * amount;

export function deriveHandlingStats(vehicleStats = {}, pilotStats = {}) {
  const rating = key => clamp(Number(pilotStats[key] ?? 5), 1, 10);
  const relative = key => (rating(key) - 5) / 5;
  const vehicle = key => clamp(Number(vehicleStats[key] ?? 60), 0, 100) / 100;
  return {
    maxSpeed: 30 * (0.72 + vehicle('speed') * 0.28) * (1 + relative('speed') * 0.08),
    acceleration: 16 * (0.65 + vehicle('acceleration') * 0.35) * (1 + relative('acceleration') * 0.12),
    grip: 0.82 + vehicle('control') * 0.48 + relative('handling') * 0.16,
    steering: 1.35 + vehicle('control') * 0.9 + relative('handling') * 0.34,
    endurance: 0.75 + rating('endurance') * 0.05,
    collisionShove: 1 + (rating('aggression') - 1) / 9 * 0.45,
    braking: 22,
  };
}

function normalizeControls(controls = {}) {
  return { throttle: clamp(Number(controls.throttle ?? 0), -1, 1), brake: clamp(Number(controls.brake ?? 0), 0, 1), steer: clamp(Number(controls.steer ?? 0), -1, 1), handbrake: clamp(Number(controls.handbrake ?? 0), 0, 1) };
}

function createGate(sampled, fraction, width) {
  const center = sampleTrackAtProgress(sampled, sampled.totalLength * fraction);
  return { x: center.x, z: center.z, tangentX: center.tangentX, tangentZ: center.tangentZ, lateralLimit: width / 2, distance: center.distance };
}

function crossesGate(car, gate, direction = 1) {
  const previousSide = (car._prevX - gate.x) * gate.tangentX + (car._prevZ - gate.z) * gate.tangentZ;
  const currentSide = (car.x - gate.x) * gate.tangentX + (car.z - gate.z) * gate.tangentZ;
  // Forward progress is from the negative side to the positive side of the tangent plane.
  const from = previousSide * direction; const to = currentSide * direction;
  if (from >= 0 || to < 0 || to - from <= 1e-6) return false;
  const fraction = clamp(-from / (to - from), 0, 1);
  const crossingX = lerp(car._prevX, car.x, fraction); const crossingZ = lerp(car._prevZ, car.z, fraction);
  const lateral = (crossingX - gate.x) * -gate.tangentZ + (crossingZ - gate.z) * gate.tangentX;
  return Math.abs(lateral) <= gate.lateralLimit;
}

export class RaceSimulation {
  constructor({ track, difficulty = 'normal', player, vehicleStats = {}, playerPaint = '#e53935', botPilots = [], laps = track?.laps } = {}) {
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
    const entrants = [{ ...player, isPlayer: true, paintColor: playerPaint }, ...botPilots.map((bot, index) => ({ ...bot, isPlayer: false, paintColor: bot.paintColor ?? ['#41d7ff', '#ffbd38', '#a68cff'][index] }))];
    this.participants = entrants.map((entry, index) => {
      const grid = track.startGrid[index];
      if (!grid) throw new RangeError('startGrid deve conter quatro posições.');
      const startProgress = sampled.totalLength * (index < 2 ? 0.985 : 0.965);
      const center = sampleTrackAtProgress(sampled, startProgress);
      const lane = Number(grid.lane ?? (index % 2 ? 1.5 : -1.5));
      const x = center.x - center.tangentZ * lane; const z = center.z + center.tangentX * lane;
      return {
        id: entry.id, name: entry.name, isPlayer: entry.isPlayer, paintColor: entry.paintColor,
        x, z, y: center.y, heading: Math.atan2(center.tangentX, center.tangentZ), velocityX: 0, velocityZ: 0, speed: 0,
        lapsCompleted: 0, nextCheckpoint: 1, finished: false, finishTime: null, progress: 0, rank: index + 1,
        vehicle: deriveHandlingStats(vehicleStats, entry.stats),
        _distance: startProgress, _lastPathDistance: startProgress,
        _nextGate: 0, _prevX: x, _prevZ: z, _trackWidth: track.width, _lane: lane, _baseLane: lane,
        _aiSteer: 0, _aiThrottle: 0, _aiBrake: 0, _aiClock: 0,
      };
    });
  }

  start() { if (this.status === 'waiting') this.status = 'racing'; return this; }

  advance(deltaMs, controls = {}) {
    if (this.status !== 'racing') return this.getStandings();
    this.accumulator += clamp(Number(deltaMs) / 1000 || 0, 0, MAX_FRAME_SECONDS);
    while (this.accumulator >= FIXED_DT && this.status === 'racing') {
      this._step(FIXED_DT, normalizeControls(controls));
      this.accumulator -= FIXED_DT;
    }
    return this.getStandings();
  }

  getStandings() {
    return [...this.participants].sort((a, b) => (a.finished && b.finished ? a.finishTime - b.finishTime : a.finished ? -1 : b.finished ? 1 : b.progress - a.progress)).map((car, index) => {
      car.rank = index + 1;
      return car;
    });
  }

  _step(dt, playerControls) {
    this.elapsedTime += dt;
    for (const car of this.participants) {
      if (car.finished) continue;
      const controls = car.isPlayer ? playerControls : this.botController.controlsFor(car, this.participants, dt);
      car._prevX = car.x; car._prevZ = car.z;
      this._integrate(car, controls, dt);
      this._updateProgress(car);
    }
    this._resolveVehicleContacts();
    if (this.participants.every(car => car.finished)) this.status = 'finished';
  }

  getBotControls(car, dt = FIXED_DT) { return this.botController.controlsFor(car, this.participants, dt); }

  _integrate(car, controls, dt) {
    const v = car.vehicle; const forwardX = Math.sin(car.heading); const forwardZ = Math.cos(car.heading);
    let longitudinal = car.velocityX * forwardX + car.velocityZ * forwardZ;
    const lateralX = car.velocityX - forwardX * longitudinal; const lateralZ = car.velocityZ - forwardZ * longitudinal;
    longitudinal += controls.throttle * v.acceleration * dt;
    // Braking cannot cross zero by itself; reverse comes from negative throttle
    // in the player adapter, not an overshooting brake impulse.
    longitudinal = Math.sign(longitudinal) * Math.max(0, Math.abs(longitudinal) - controls.brake * v.braking * dt);
    longitudinal *= Math.max(0, 1 - (0.15 + controls.handbrake * 1.8) * dt);
    longitudinal = clamp(longitudinal, -v.maxSpeed * 0.25, v.maxSpeed);
    car.heading += controls.steer * v.steering * clamp(Math.abs(longitudinal) / 5, 0.2, 1) * dt * Math.sign(longitudinal || 1);
    const grip = clamp(v.grip * (1 - controls.handbrake * 0.72), 0, 0.98);
    car.velocityX = Math.sin(car.heading) * longitudinal + lateralX * (1 - grip * dt * 5);
    car.velocityZ = Math.cos(car.heading) * longitudinal + lateralZ * (1 - grip * dt * 5);
    car.x += car.velocityX * dt; car.z += car.velocityZ * dt; car.speed = Math.hypot(car.velocityX, car.velocityZ);
    const nearest = findNearestTrackPoint(this.track, car.x, car.z);
    if (!nearest) return;
    const edge = this.track.width / 2 - 1.2;
    if (Math.abs(nearest.lateral) > edge) {
      const side = Math.sign(nearest.lateral);
      const correction = Math.abs(nearest.lateral) - edge;
      // lateral is measured along (-tangentZ, tangentX); push back toward the
      // nearest centerline point instead of reinforcing the outward drift.
      car.x += nearest.tangentZ * side * correction;
      car.z -= nearest.tangentX * side * correction;
      car.velocityX *= 0.58; car.velocityZ *= 0.58; car.speed *= 0.58;
    }
    car.y = sampleTrackAtProgress(this.track, nearest.distance).y;
  }

  _updateProgress(car) {
    const nearest = findNearestTrackPoint(this.track, car.x, car.z);
    const previousDistance = car._lastPathDistance;
    let delta = nearest.distance - previousDistance;
    if (delta < -this.track.totalLength / 2) delta += this.track.totalLength;
    else if (delta > this.track.totalLength / 2) delta -= this.track.totalLength;
    if (delta >= 0) {
      car._distance += delta;
      car._lastPathDistance = nearest.distance;
      car.progress = clamp(car._distance / (this.laps * this.track.totalLength), 0, 1);
    }
    const gate = this.gates[car._nextGate];
    if (!gate || !crossesGate(car, gate)) return;
    if (car._nextGate < 3) {
      car._nextGate += 1;
      car.nextCheckpoint = car._nextGate + 1;
    } else {
      car.lapsCompleted += 1;
      car._nextGate = 0;
      car.nextCheckpoint = 1;
      if (car.lapsCompleted >= this.laps) {
        car.finished = true; car.finishTime = this.elapsedTime; car._finishOrder = ++this.finishSequence;
      }
    }
  }

  _resolveVehicleContacts() {
    for (let i = 0; i < this.participants.length; i += 1) for (let j = i + 1; j < this.participants.length; j += 1) {
      const a = this.participants[i]; const b = this.participants[j];
      if (a.finished || b.finished) continue;
      const dx = b.x - a.x; const dz = b.z - a.z; const distance = Math.hypot(dx, dz);
      if (distance >= 4.2 || distance < 0.001) continue;
      const nx = dx / distance; const nz = dz / distance; const overlap = (4.2 - distance) / 2;
      a.x -= nx * overlap; a.z -= nz * overlap; b.x += nx * overlap; b.z += nz * overlap;
      const relative = (b.velocityX - a.velocityX) * nx + (b.velocityZ - a.velocityZ) * nz;
      if (relative < 0) {
        const impulse = -relative * 0.52;
        a.velocityX -= nx * impulse / a.vehicle.collisionShove; a.velocityZ -= nz * impulse / a.vehicle.collisionShove;
        b.velocityX += nx * impulse / b.vehicle.collisionShove; b.velocityZ += nz * impulse / b.vehicle.collisionShove;
        a.speed = Math.hypot(a.velocityX, a.velocityZ); b.speed = Math.hypot(b.velocityX, b.velocityZ);
      }
    }
  }
}
