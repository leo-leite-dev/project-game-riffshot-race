import { findNearestTrackPoint, sampleTrackAtProgress } from './trackMath.ts';
import type { SampledTrack } from './trackMath.ts';
import type { DIFFICULTIES } from '../data/raceDifficulty.ts';

type Difficulty = (typeof DIFFICULTIES)[keyof typeof DIFFICULTIES];
export interface BotParticipant {
  finished: boolean; destroyed: boolean; respawnProtection: number;
  x: number; z: number; heading: number; speed: number; nitroCharges: number;
  vehicle: { maxSpeed: number; nitroCharges: number };
  _aiClock: number; _aiSteer: number; _aiThrottle: number; _aiBrake: number;
  _baseLane: number; _lane: number;
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const lerp = (a: number, b: number, amount: number) => a + (b - a) * amount;
const wrapAngle = (angle: number) => ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

// Bots and player share RaceSimulation's physics; this class only chooses input.
export class BotController {
  track: SampledTrack;
  difficulty: Difficulty;

  constructor(track: SampledTrack, difficulty: Difficulty) {
    this.track = track;
    this.difficulty = difficulty;
  }

  controlsFor(car: BotParticipant, participants: BotParticipant[], dt: number) {
    if (car.finished || car.destroyed) return { throttle: 0, brake: 0, steer: 0, handbrake: 0, nitro: false };
    car._aiClock = (car._aiClock ?? 0) + dt;
    const nearest = findNearestTrackPoint(this.track, car.x, car.z);
    if (!nearest) return { throttle: 0, brake: 1, steer: 0, handbrake: 0 };
    const lookahead = this.difficulty.lookahead;
    const target = sampleTrackAtProgress(this.track, nearest.distance + lookahead);
    let desiredLane = car._baseLane;
    for (const rival of participants) {
      if (rival === car || rival.finished || rival.destroyed || rival.respawnProtection > 0) continue;
      const dx = rival.x - car.x, dz = rival.z - car.z;
      const forward = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
      if (forward > 0 && forward < 10 && dx * dx + dz * dz < 13 * 13 && this.difficulty.overtakeDesire > 0.25) {
        desiredLane = car._baseLane > 0 ? -3.3 : 3.3;
      }
    }
    car._lane = lerp(car._lane, desiredLane, 1 - Math.exp(-dt * 1.5));
    const normalX = -target.tangentZ, normalZ = target.tangentX;
    const targetX = target.x + normalX * car._lane;
    const targetZ = target.z + normalZ * car._lane;
    const desiredHeading = Math.atan2(targetX - car.x, targetZ - car.z);
    const headingError = wrapAngle(desiredHeading - car.heading);
    const laneError = nearest.lateral - car._lane;
    const pathCorrection = clamp(laneError * 0.085, -0.42, 0.42);
    const smallMistake = Math.sin(car._aiClock * 2.1 + car._lane) * this.difficulty.steeringError;
    const steeringTarget = clamp(headingError * this.difficulty.steeringGain + pathCorrection + smallMistake, -1, 1);
    const ahead = sampleTrackAtProgress(this.track, nearest.distance + lookahead * this.difficulty.brakeAnticipation);
    const later = sampleTrackAtProgress(this.track, nearest.distance + lookahead * 1.8);
    const turn = Math.abs(Math.atan2(
      ahead.tangentX * later.tangentZ - ahead.tangentZ * later.tangentX,
      ahead.tangentX * later.tangentX + ahead.tangentZ * later.tangentZ,
    ));
    const targetSpeed = car.vehicle.maxSpeed * this.difficulty.targetSpeed * clamp(1 - turn * 0.28, 0.76, 1);
    const response = 1 - Math.exp(-dt / Math.max(0.04, this.difficulty.reaction));
    car._aiSteer = lerp(car._aiSteer, steeringTarget, response);
    car._aiThrottle = lerp(car._aiThrottle, car.speed < targetSpeed ? 1 : 0, response);
    car._aiBrake = lerp(car._aiBrake, car.speed > targetSpeed + 1.5 ? 0.65 : 0, response);
    // Exponential smoothing approaches zero without reaching it. Release an
    // imperceptible residual so the shared physics recognizes powered drift.
    if (car._aiBrake < 0.001) car._aiBrake = 0;
    const nitro = car.vehicle.nitroCharges > 0 && car.nitroCharges > 0
      && car.speed < targetSpeed * 0.72 && Math.abs(steeringTarget) < 0.55;
    return { throttle: car._aiThrottle, brake: car._aiBrake, steer: car._aiSteer, handbrake: 0, nitro };
  }
}
