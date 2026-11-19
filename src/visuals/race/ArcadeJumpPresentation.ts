import type { TrackJump } from '../../race/trackMath.ts';

export const ARCADE_LAB_RAMP_LENGTH = 10;
export const ARCADE_LAB_RAMP_HEIGHT = 1.5;

const ARCADE_GRAVITY = 18;
const MAX_PITCH = 0.24;
const LANDING_PITCH = 0.14;

export interface ArcadeJumpPresentationInput {
  airborne: boolean;
  airborneElapsed: number;
  verticalVelocity: number;
  speed: number;
  trackDistance: number;
  totalTrackLength: number;
  jump: TrackJump;
  deltaSeconds: number;
  physicalSurface?: boolean;
  surfacePitchRadians?: number;
  landingSequence?: number;
  landingImpactSpeed?: number;
  landingSurfaceSlope?: number;
}

export interface ArcadeJumpPresentationPose {
  pitch: number;
  rampOffset: number;
  suspensionOffset: number;
}

/** Orientação e resposta visual do laboratório; não participa da simulação horizontal. */
export class ArcadeJumpPresentation {
  private pitch = 0;
  private wasAirborne = false;
  private takeoffPitch = 0;
  private lastTakeoffPitch = 0;
  private takeoffRampOffset = 0;
  private maximumDescentPitch = 0;
  private maximumCompression = 0;
  private maximumRecovery = 0;
  private launchVerticalSpeed = 0;
  private lastAirborneVerticalVelocity = 0;
  private landingElapsed = Number.POSITIVE_INFINITY;
  private landingCompression = 0;
  private lastLandingSequence = 0;

  update(input: ArcadeJumpPresentationInput): ArcadeJumpPresentationPose {
    const dt = clamp(input.deltaSeconds, 0, 0.1);
    const jumpDistance = input.jump.takeoff * input.totalTrackLength;
    let targetPitch: number;
    let rampOffset: number;

    if (input.landingSequence !== undefined && input.landingSequence !== this.lastLandingSequence) {
      this.lastLandingSequence = input.landingSequence;
      this.landingElapsed = 0;
      const impact = input.landingImpactSpeed ?? Math.abs(this.lastAirborneVerticalVelocity);
      const incline = Math.abs(input.landingSurfaceSlope ?? input.surfacePitchRadians ?? 0);
      const slopeMultiplier = 1 + clamp(incline * 0.45, 0, 0.2);
      this.landingCompression = clamp(impact * 0.018, 0.025, 0.12) * slopeMultiplier;
    }

    if (input.airborne) {
      if (!this.wasAirborne) {
        this.takeoffPitch = this.pitch;
        this.lastTakeoffPitch = this.pitch;
        this.takeoffRampOffset = rampHeight(input.jump);
        this.launchVerticalSpeed = Math.max(0,
          input.verticalVelocity + ARCADE_GRAVITY * input.airborneElapsed);
      }
      this.lastAirborneVerticalVelocity = input.verticalVelocity;
      targetPitch = this.flightPitch(input, jumpDistance);
      const distanceFromTakeoff = forwardDistance(jumpDistance, input.trackDistance, input.totalTrackLength);
      const landingEnd = forwardDistance(jumpDistance,
        input.jump.landingEnd * input.totalTrackLength, input.totalTrackLength);
      rampOffset = input.physicalSurface ? 0
        : this.takeoffRampOffset * (1 - smoothstep(distanceFromTakeoff / Math.max(landingEnd, 1)));
      if (input.verticalVelocity < 0) this.maximumDescentPitch = Math.max(this.maximumDescentPitch, targetPitch);
      this.wasAirborne = true;
      this.landingElapsed = Number.POSITIVE_INFINITY;
    } else {
      if (this.wasAirborne && input.landingSequence === undefined) {
        this.landingElapsed = 0;
        this.landingCompression = clamp(Math.abs(this.lastAirborneVerticalVelocity) * 0.014, 0.035, 0.11);
      }
      targetPitch = input.physicalSurface ? (input.surfacePitchRadians ?? 0) : this.rampPitch(input, jumpDistance);
      rampOffset = input.physicalSurface ? 0 : rampHeight(input.jump) * this.rampProgress(input, jumpDistance);
      this.wasAirborne = false;
    }

    const response = 1 - Math.exp(-dt * 10);
    this.pitch += (targetPitch - this.pitch) * response;
    this.pitch = clamp(this.pitch, -MAX_PITCH, MAX_PITCH);

    if (Number.isFinite(this.landingElapsed)) this.landingElapsed += dt;
    const suspensionOffset = Number.isFinite(this.landingElapsed)
      ? -this.landingCompression * Math.exp(-8 * this.landingElapsed) * Math.sin(20 * this.landingElapsed)
      : 0;
    this.maximumCompression = Math.min(this.maximumCompression, suspensionOffset);
    this.maximumRecovery = Math.max(this.maximumRecovery, suspensionOffset);
    return { pitch: this.pitch, rampOffset, suspensionOffset };
  }

  diagnostics(): { takeoffPitch: number; maximumDescentPitch: number; maximumCompression: number; maximumRecovery: number } {
    return { takeoffPitch: this.lastTakeoffPitch, maximumDescentPitch: this.maximumDescentPitch,
      maximumCompression: this.maximumCompression, maximumRecovery: this.maximumRecovery };
  }

  reset(landingSequence = 0): void {
    this.pitch = 0;
    this.wasAirborne = false;
    this.takeoffPitch = 0;
    this.lastTakeoffPitch = 0;
    this.takeoffRampOffset = 0;
    this.maximumDescentPitch = 0;
    this.maximumCompression = 0;
    this.maximumRecovery = 0;
    this.launchVerticalSpeed = 0;
    this.lastAirborneVerticalVelocity = 0;
    this.landingElapsed = Number.POSITIVE_INFINITY;
    this.landingCompression = 0;
    this.lastLandingSequence = landingSequence;
  }

  private rampPitch(input: ArcadeJumpPresentationInput, jumpDistance: number): number {
    const progress = smoothstep(this.rampProgress(input, jumpDistance));
    const incline = Math.atan2(rampHeight(input.jump), rampLength(input.jump));
    return -incline * progress;
  }

  private rampProgress(input: ArcadeJumpPresentationInput, jumpDistance: number): number {
    const length = rampLength(input.jump);
    const rampStart = wrapDistance(jumpDistance - length, input.totalTrackLength);
    const travelledFromRampStart = forwardDistance(rampStart, input.trackDistance, input.totalTrackLength);
    return travelledFromRampStart > length
      ? 0 : clamp(travelledFromRampStart / length, 0, 1);
  }

  private flightPitch(input: ArcadeJumpPresentationInput, jumpDistance: number): number {
    const apexTime = this.launchVerticalSpeed / ARCADE_GRAVITY;
    if (apexTime <= 0.001) return 0;
    const elapsed = Math.max(0, input.airborneElapsed);
    const ascent = smoothstep(elapsed / apexTime);
    const initialFlightPitch = this.takeoffPitch * (1 - ascent) - 0.015 * ascent;
    if (input.verticalVelocity >= 0) return initialFlightPitch;

    const descent = smoothstep((elapsed - apexTime) / apexTime);
    const landingStart = forwardDistance(jumpDistance,
      input.jump.landingStart * input.totalTrackLength, input.totalTrackLength);
    const landingEnd = forwardDistance(jumpDistance,
      input.jump.landingEnd * input.totalTrackLength, input.totalTrackLength);
    const distanceFromTakeoff = forwardDistance(jumpDistance, input.trackDistance, input.totalTrackLength);
    const landingProgress = landingEnd > landingStart
      ? smoothstep((distanceFromTakeoff - landingStart) / (landingEnd - landingStart)) : 0;
    const noseDown = Math.max(descent, landingProgress);
    return initialFlightPitch * (1 - noseDown) + LANDING_PITCH * noseDown;
  }
}

function forwardDistance(from: number, to: number, length: number): number {
  return ((to - from) % length + length) % length;
}

function wrapDistance(distance: number, length: number): number {
  return ((distance % length) + length) % length;
}

function smoothstep(value: number): number {
  const amount = clamp(value, 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rampLength(jump: TrackJump): number {
  return Math.max(1, jump.rampLength ?? ARCADE_LAB_RAMP_LENGTH);
}

function rampHeight(jump: TrackJump): number {
  return Math.max(0, jump.rampHeight ?? ARCADE_LAB_RAMP_HEIGHT);
}
