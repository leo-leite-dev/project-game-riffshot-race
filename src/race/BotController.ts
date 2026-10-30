import { sampleTrackAtProgress } from './trackMath.ts';
import type { SampledTrack } from './trackMath.ts';
import type { DIFFICULTIES } from '../data/raceDifficulty.ts';
import { resolveBotBehavior } from '../data/botProfiles.ts';
import type { BotBehavior, BotProfileId } from '../data/botProfiles.ts';

type Difficulty = { [Key in Exclude<keyof (typeof DIFFICULTIES)['normal'], 'corneringSafety'>]:
  (typeof DIFFICULTIES)['normal'][Key] extends number ? number : string } & { corneringSafety?: number };
export interface BotParticipant {
  finished: boolean; destroyed: boolean; respawnProtection: number;
  x: number; z: number; heading: number; speed: number; nitroCharges: number;
  id?: string; aiProfile?: BotProfileId; aiSeed?: number; velocityX?: number; velocityZ?: number;
  health?: number; maxHealth?: number; nitroActive?: boolean; _trackWidth?: number;
  vehicle: { maxSpeed: number; nitroCharges: number; grip?: number; steering?: number;
    braking?: number; acceleration?: number; nitroMultiplier?: number; nitroSeconds?: number };
  _aiClock: number; _aiSteer: number; _aiThrottle: number; _aiBrake: number;
  _baseLane: number; _lane: number;
}
interface Controls { throttle: number; brake: number; steer: number; handbrake: number; nitro: boolean }
interface DriverState {
  segment: number; distance: number; lateral: number; tangentX: number; tangentZ: number;
  clock: number; profile?: BotProfileId; seed?: number; behavior: BotBehavior;
  passLane: number; passUntil: number; passGap: number;
  targetLane: number; controls: Controls;
}
interface RoadSample { x: number; z: number; tangentX: number; tangentZ: number; curvature: number }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const lerp = (a: number, b: number, amount: number) => a + (b - a) * amount;
const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const mod = (value: number, size: number) => ((value % size) + size) % size;
const inactive: Controls = Object.freeze({ throttle: 0, brake: 0, steer: 0, handbrake: 0, nitro: false });

// Only inputs are chosen here. Grip/braking estimates plan feasible maneuvers;
// they never change RaceSimulation's forces, damage, speed caps or race progress.
export class BotController {
  track: SampledTrack;
  difficulty: Difficulty;
  private road: RoadSample[];
  private spacing: number;
  private drivers = new WeakMap<BotParticipant, DriverState>();

  constructor(track: SampledTrack, difficulty: Difficulty) {
    this.track = track;
    this.difficulty = difficulty;
    const count = Math.max(8, Math.ceil(track.totalLength / 2));
    this.spacing = track.totalLength / count;
    // Arc-length lookup and signed LOCAL curvature: an S cannot cancel out as
    // it did when only the two ends of a long preview window were compared.
    this.road = Array.from({ length: count }, (_, index) => {
      const distance = index * this.spacing;
      const point = sampleTrackAtProgress(track, distance);
      const before = sampleTrackAtProgress(track, distance - 4);
      const after = sampleTrackAtProgress(track, distance + 4);
      return { ...point, curvature: Math.atan2(
        after.tangentX * before.tangentZ - after.tangentZ * before.tangentX,
        after.tangentX * before.tangentX + after.tangentZ * before.tangentZ,
      ) / 8 };
    });
  }

  private stateFor(car: BotParticipant): DriverState {
    let state = this.drivers.get(car);
    if (!state || state.profile !== car.aiProfile || !Object.is(state.seed, car.aiSeed)) {
      state = { segment: -1, distance: 0, lateral: 0, tangentX: 0, tangentZ: 1,
        clock: -1, profile: car.aiProfile, seed: car.aiSeed,
        behavior: resolveBotBehavior(car.aiProfile, car.aiSeed, car.id),
        passLane: 0, passUntil: 0, passGap: Infinity, targetLane: 0,
        controls: { ...inactive } };
      this.drivers.set(car, state);
    }
    return state;
  }

  private roadAt(distance: number) {
    return this.road[Math.floor(mod(distance, this.track.totalLength) / this.spacing) % this.road.length];
  }

  private project(car: BotParticipant, state: DriverState, start: number, length: number, best = Infinity) {
    const points = this.track.points, count = points.length;
    for (let offset = 0; offset < length; offset += 1) {
      const index = mod(start + offset, count), a = points[index], b = points[(index + 1) % count];
      const sx = b.x - a.x, sz = b.z - a.z, lengthSq = sx * sx + sz * sz;
      if (lengthSq === 0) continue;
      const amount = clamp(((car.x - a.x) * sx + (car.z - a.z) * sz) / lengthSq, 0, 1);
      const dx = car.x - a.x - sx * amount, dz = car.z - a.z - sz * amount;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq >= best) continue;
      best = distanceSq;
      const segmentLength = Math.sqrt(lengthSq);
      state.segment = index; state.tangentX = sx / segmentLength; state.tangentZ = sz / segmentLength;
      state.distance = mod(a.distance + segmentLength * amount, this.track.totalLength);
      state.lateral = -dx * state.tangentZ + dz * state.tangentX;
    }
    return best;
  }

  private locate(car: BotParticipant, state: DriverState) {
    let best: number;
    // Normal movement searches 17 nearby segments, not the whole course. A
    // fresh driver, respawn/reset or teleport safely reacquires globally.
    if (state.segment < 0 || car._aiClock < state.clock) best = this.project(car, state, 0, this.track.points.length);
    else {
      best = this.project(car, state, state.segment - 8, Math.min(17, this.track.points.length));
      if (best > 64) best = this.project(car, state, 0, this.track.points.length, best);
    }
    return Number.isFinite(best);
  }

  private laneClear(car: BotParticipant, participants: BotParticipant[], state: DriverState,
    candidate: number, speed: number, gap: number) {
    for (const other of participants) {
      if (other === car || other.finished || other.destroyed || other.respawnProtection > 0) continue;
      const dx = other.x - car.x, dz = other.z - car.z;
      const forward = dx * state.tangentX + dz * state.tangentZ;
      const lateral = state.lateral - dx * state.tangentZ + dz * state.tangentX;
      const vx = other.velocityX ?? Math.sin(other.heading) * other.speed;
      const vz = other.velocityZ ?? Math.cos(other.heading) * other.speed;
      const futureForward = forward + ((vx * state.tangentX + vz * state.tangentZ) - speed) * 0.6;
      const futureLane = lateral + (-vx * state.tangentZ + vz * state.tangentX) * 0.6;
      if (Math.min(forward, futureForward) < Math.min(32, gap + 6)
        && Math.max(forward, futureForward) > -6
        && Math.min(lateral, futureLane) < candidate + 4.4
        && Math.max(lateral, futureLane) > candidate - 4.4) return false;
    }
    return true;
  }

  private trafficLane(car: BotParticipant, participants: BotParticipant[], state: DriverState,
    line: number, edge: number, desire: number, speed: number, willingToPass: boolean) {
    let blocker: BotParticipant | undefined, gap = Infinity, blockerLane = 0, blockerSpeed = 0;
    for (const other of participants) {
      if (other === car || other.finished || other.destroyed || other.respawnProtection > 0) continue;
      const dx = other.x - car.x, dz = other.z - car.z;
      const forward = dx * state.tangentX + dz * state.tangentZ;
      const lane = state.lateral - dx * state.tangentZ + dz * state.tangentX;
      const along = (other.velocityX ?? Math.sin(other.heading) * other.speed) * state.tangentX
        + (other.velocityZ ?? Math.cos(other.heading) * other.speed) * state.tangentZ;
      const closing = Math.max(0, speed - along);
      if (forward > 0 && forward < Math.min(32, 9 + closing * (0.8 + desire)) && forward < gap
        && Math.abs(lane - state.lateral) < 4.4 && (closing > 0.3 || forward < 7)) {
        blocker = other; gap = forward; blockerLane = lane; blockerSpeed = Math.max(0, along);
      }
    }
    let lane = state.passUntil > car._aiClock ? state.passLane : line;
    if (state.passUntil > car._aiClock && !this.laneClear(car, participants, state, lane, speed, gap)) {
      state.passUntil = 0; lane = line;
    }
    if (blocker && willingToPass && state.passUntil <= car._aiClock) {
      const left = clamp(blockerLane + 4.6, -edge, edge), right = clamp(blockerLane - 4.6, -edge, edge);
      const leftClear = this.laneClear(car, participants, state, left, speed, gap);
      const rightClear = this.laneClear(car, participants, state, right, speed, gap);
      if (leftClear || rightClear) {
        lane = leftClear && (!rightClear || Math.abs(left - line) <= Math.abs(right - line)) ? left : right;
        state.passLane = lane; state.passUntil = car._aiClock + 1.1 + desire * 0.9;
      }
    }
    // Brake while a corridor is unavailable or the lateral move cannot finish
    // before contact. Overtake desire controls prediction/commitment, not a flag.
    const blocked = blocker && (state.passUntil <= car._aiClock
      || (Math.abs(state.lateral - blockerLane) < 4.3 && gap < 7 + Math.max(0, speed - blockerSpeed) * 0.65));
    state.targetLane = lane;
    state.passGap = gap;
    if (!blocked) return Infinity;
    // The collision envelope gets shorter as the car moves alongside. A fixed
    // six-metre stopping gap otherwise leaves the driver crawling behind the
    // obstacle even after most of the lateral clearance has been gained.
    const lateralGap = Math.abs(state.lateral - blockerLane);
    const buffer = state.passUntil > car._aiClock
      ? 0.5 + Math.sqrt(Math.max(0, 4.4 ** 2 - lateralGap ** 2)) : 6;
    const available = Math.max(0, gap - buffer);
    // A clear committed corridor needs a little drive to turn at walking pace.
    // A zero target deadlocks the steering/speed feedback loop beside a stopped
    // obstacle. Keep a blocked queue stopped when neither corridor is available.
    const maneuverSpeed = state.passUntil > car._aiClock ? 1.5 : 0;
    return Math.max(maneuverSpeed, blockerSpeed + Math.sqrt((car.vehicle.braking ?? 22) * available));
  }

  controlsFor(car: BotParticipant, participants: BotParticipant[], dt: number): Controls {
    if (car.finished || car.destroyed) return inactive;
    const state = this.stateFor(car);
    if (!this.locate(car, state)) return { ...inactive, brake: 1 };
    if (car._aiClock < state.clock) state.passUntil = 0;
    car._aiClock = (car._aiClock ?? 0) + dt;
    state.clock = car._aiClock;
    const behavior = state.behavior, precision = behavior.precision;
    const v = car.vehicle, speed = Math.max(0, car.speed);
    const health = car.maxHealth && car.health !== undefined ? clamp(car.health / car.maxHealth, 0, 1) : 1;
    const grip = (v.grip ?? 0.8) * (0.65 + health * 0.35);
    const steering = (v.steering ?? 2) * (0.75 + health * 0.25);
    const brake = (v.braking ?? 22) * (0.65 + this.difficulty.brakeAnticipation * 0.2);
    // Risk spends more/less of the SAME estimated grip; it never adds grip.
    const risk = clamp(behavior.risk - (1 - health) * 0.2, 0, 1);
    const safety = Math.min(1, (this.difficulty.corneringSafety ?? 0.85) * (0.94 + risk * 0.12));
    const lateralBudget = grip * 28 * 0.8 * safety;
    let lookahead = clamp((this.difficulty.lookahead * 0.35 + speed * 0.32) * behavior.preview, 6, 22);
    const curve = this.roadAt(state.distance + lookahead * 0.5).curvature;
    const width = car._trackWidth ?? (this.track as SampledTrack & { width?: number }).width ?? 13;
    const edge = Math.max(0, width / 2 - 1.8);
    // Use the apex side with a modest offset; grid lanes are not permanent
    // racing lines. Smooth changes leave room for slip and wall recovery.
    const line = -clamp(curve * 45, -1, 1) * Math.min(behavior.lineOffset, edge * 0.45);
    // Prefer an opening on a gentler section to a new pass under high lateral
    // load. Never cancel a clear committed corridor or deadlock a slow maneuver.
    const cornerLoad = Math.abs(curve) * speed * speed / Math.max(0.1, lateralBudget);
    const willingToPass = speed < 3 || cornerLoad < 0.85 + risk * 0.6;
    const trafficSpeed = this.trafficLane(car, participants, state, line, edge,
      clamp(this.difficulty.overtakeDesire + behavior.overtakeBias, 0, 1), speed, willingToPass);
    const passing = state.passUntil > car._aiClock;
    car._lane = lerp(car._lane, state.targetLane, 1 - Math.exp(-dt * (passing ? 4.2 : 2.4 * precision)));
    // A distant cruising target makes a lateral pass too shallow to clear a
    // stopped car. Look closer during the committed maneuver, while braking.
    if (passing) {
      lookahead = Math.max(6, lookahead * 0.7);
      if (speed < 3) lookahead = Math.max(1.5, Math.min(lookahead, state.passGap - 5));
    }
    const target = this.roadAt(state.distance + lookahead);
    const targetX = target.x - target.tangentZ * car._lane;
    const targetZ = target.z + target.tangentX * car._lane;
    const vx = car.velocityX ?? Math.sin(car.heading) * speed;
    const vz = car.velocityZ ?? Math.cos(car.heading) * speed;
    const travelHeading = speed > 1 ? Math.atan2(vx, vz) : car.heading;
    const slip = wrapAngle(car.heading - travelHeading);
    const travelError = wrapAngle(Math.atan2(targetX - car.x, targetZ - car.z) - travelHeading);
    const desiredYaw = 2 * speed * Math.sin(travelError) / lookahead;
    const speedRatio = speed / Math.max(1, v.maxSpeed);
    const trajectoryResponse = grip * 5.5 * (1 - car._aiThrottle * 0.35) / (1 + speedRatio * speedRatio * 1.8)
      + (v.acceleration ?? 14) * Math.max(0, car._aiThrottle) / Math.max(5, speed);
    const desiredSlip = clamp(Math.atan2(desiredYaw, trajectoryResponse), -0.7, 0.7);
    const authority = steering / (1 + speedRatio * speedRatio * 0.3);
    const mistake = Math.sin(car._aiClock * 2.1 + behavior.phase) * this.difficulty.steeringError / precision;
    let steeringTarget = clamp((desiredSlip - slip) * this.difficulty.steeringGain * precision
      + desiredYaw / Math.max(0.5, authority) + mistake, -1, 1);
    if (passing && speed < 3) {
      const headingError = wrapAngle(Math.atan2(targetX - car.x, targetZ - car.z) - car.heading);
      const parkingSteer = clamp(headingError * this.difficulty.steeringGain, -1, 1);
      steeringTarget = lerp(parkingSteer, steeringTarget, speed / 3);
    }

    let targetSpeed = v.maxSpeed * this.difficulty.targetSpeed * (car.nitroActive ? v.nitroMultiplier ?? 1 : 1);
    let straightSpeed = Infinity;
    const reactionDistance = (speed * this.difficulty.reaction / precision + 3) * behavior.brakeAnticipation;
    const horizon = Math.min(100, Math.max(35, speed * speed / (2 * brake) + reactionDistance + lookahead));
    for (let distance = 0; distance <= horizon; distance += 4) {
      const curvature = Math.abs(this.roadAt(state.distance + distance).curvature);
      const cornerSpeed = Math.sqrt(lateralBudget / Math.max(0.0001, curvature));
      straightSpeed = Math.min(straightSpeed, cornerSpeed);
      targetSpeed = Math.min(targetSpeed, Math.sqrt(cornerSpeed * cornerSpeed
        + 2 * brake * Math.max(0, distance - reactionDistance)));
    }
    targetSpeed = Math.min(targetSpeed, trafficSpeed);
    // Prefer lifting to recover grip, but release the brake exactly to allow
    // the SAME powered-drift rules as the player on the corner exit.
    const excess = speed - targetSpeed;
    const throttle = targetSpeed <= 0.1 ? 0 : clamp((targetSpeed - speed) * 0.7 + 0.35, 0, 1);
    const braking = excess > 0.8 ? clamp(excess / 5, 0, 1) : 0;
    const response = 1 - Math.exp(-dt / Math.max(0.04, this.difficulty.reaction / precision));
    // Reaction still differentiates the drivers, but a 340 ms actuator lag
    // destabilizes a slip-feedback loop. Keep steering faster than pedal intent.
    const steerResponse = 1 - Math.exp(-dt / Math.max(0.04, this.difficulty.reaction * 0.35 / precision));
    car._aiSteer = lerp(car._aiSteer, steeringTarget, steerResponse);
    car._aiThrottle = lerp(car._aiThrottle, throttle, response);
    car._aiBrake = lerp(car._aiBrake, braking, response);
    if (car._aiBrake < 0.001) car._aiBrake = 0;
    const nitro = v.nitroCharges > 0 && car.nitroCharges > 0 && !car.nitroActive
      && speed > v.maxSpeed * 0.6 && straightSpeed > v.maxSpeed * 1.05
      && Math.abs(steeringTarget) < 0.2 && Math.abs(slip) < 0.12 && trafficSpeed === Infinity;
    const controls = state.controls;
    controls.throttle = car._aiThrottle; controls.brake = car._aiBrake;
    controls.steer = car._aiSteer; controls.handbrake = 0; controls.nitro = nitro;
    return controls;
  }
}
