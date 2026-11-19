export const RAMP_KINDS = ['bump', 'jump', 'platform', 'double'] as const;
export type RampKind = (typeof RAMP_KINDS)[number];

export interface TrackRamp {
  id: string;
  kind: RampKind;
  takeoff: number;
  landingStart: number;
  landingEnd: number;
  launchAngleDegrees: number;
  minimumSpeed: number;
  maximumVerticalSpeed: number;
  rampLength: number;
  rampHeight: number;
  receiverLength: number;
  platformLength?: number;
  descentLength?: number;
  firstPlatformLength?: number;
  gapLength?: number;
  secondRampLength?: number;
  secondPlatformLength?: number;
  lavaGap?: boolean;
  regionId?: string;
}

export interface TrackRampRegion {
  id: string;
  start: number;
  end: number;
  minimumCurveRadius: number;
  obstacleClearance?: number;
}

export interface RampObstacle { x: number; z: number; width?: number; depth?: number }
export interface RampSurfaceProfile {
  offset: number;
  grade: number;
  curvature: number;
  progress: number;
  hasGround: boolean;
}
export interface RampTrackSample { x: number; z: number; tangentX: number; tangentZ: number }
export interface RampGenerationOptions {
  trackId: string;
  totalLength: number;
  trackWidth: number;
  regions: readonly TrackRampRegion[];
  count: number;
  seed: number | string;
  obstacles?: readonly RampObstacle[];
  sampleAt: (distance: number) => RampTrackSample;
}
export interface RampFeatureSpan { approach: number; afterTakeoff: number; landingDistance: number }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const mod = (value: number, length: number) => ((value % length) + length) % length;
const wrapDistance = (value: number, length: number) => {
  const wrapped = mod(value, length);
  return length - wrapped < 1e-7 ? 0 : wrapped;
};
const lerp = (min: number, max: number, amount: number) => min + (max - min) * amount;

export function getRampFeatureSpan(ramp: TrackRamp, totalLength = 1): RampFeatureSpan {
  const approach = Math.max(1, ramp.rampLength);
  const afterTakeoff = ramp.kind === 'jump'
    ? (ramp.gapLength ?? 11) + ramp.receiverLength
    : ramp.kind === 'platform'
    ? (ramp.platformLength ?? 20) + (ramp.descentLength ?? 12)
    : ramp.kind === 'double'
      ? (ramp.firstPlatformLength ?? 5) + (ramp.gapLength ?? 8) + (ramp.secondRampLength ?? 8)
        + (ramp.secondPlatformLength ?? 18) + (ramp.descentLength ?? 10)
      : ramp.receiverLength;
  const defaultLandingDistance = ramp.kind === 'bump' ? 13 : ramp.kind === 'jump' ? 20 : afterTakeoff;
  const landingDistance = ramp.landingEnd > ramp.takeoff
    ? (ramp.landingEnd - ramp.takeoff) * totalLength : defaultLandingDistance;
  return { approach, afterTakeoff, landingDistance };
}

export function sampleRampSurfaceProfile(ramp: TrackRamp, distance: number, totalLength: number): RampSurfaceProfile | null {
  const type = ramp.kind;
  const takeoff = ramp.takeoff * totalLength;
  const rampLength = Math.max(1, ramp.rampLength);
  const receiverLength = Math.max(1, ramp.receiverLength);
  const beforeTakeoff = wrapDistance(takeoff - distance, totalLength);
  const afterTakeoff = wrapDistance(distance - takeoff, totalLength);
  const height = Math.max(0, ramp.rampHeight);

  if (beforeTakeoff <= rampLength) {
    const progress = clamp(1 - beforeTakeoff / rampLength, 0, 1);
    const shape = type === 'bump' || type === 'jump' || type === 'platform' || type === 'double'
      ? launchRampShape(progress, rampLength, height, ramp.launchAngleDegrees)
      : smoothRampShape(progress);
    return { offset: height * shape.value, grade: height / rampLength * shape.first,
      curvature: height / (rampLength * rampLength) * shape.second, progress: progress * 0.5, hasGround: true };
  }

  if (type === 'bump' && afterTakeoff <= receiverLength) {
    const progress = clamp(afterTakeoff / receiverLength, 0, 1);
    const shape = smoothRampShape(progress);
    return { offset: height * (1 - shape.value), grade: -height / receiverLength * shape.first,
      curvature: -height / (receiverLength * receiverLength) * shape.second, progress: 0.5 + progress * 0.5, hasGround: true };
  }

  if (type === 'jump') {
    const gapLength = Math.max(1, ramp.gapLength ?? 11);
    if (afterTakeoff <= gapLength) return flatProfile(0, 0.5, false);
    if (afterTakeoff <= gapLength + receiverLength) return flatProfile(0.02, 0.8, true);
  }

  if (type === 'platform') {
    const platformLength = Math.max(1, ramp.platformLength ?? receiverLength);
    const descentLength = Math.max(1, ramp.descentLength ?? 12);
    if (afterTakeoff <= platformLength) return flatProfile(height, 0.5, true);
    if (afterTakeoff <= platformLength + descentLength) {
      const progress = clamp((afterTakeoff - platformLength) / descentLength, 0, 1);
      const shape = smoothRampShape(progress, 2.2);
      return { offset: height * (1 - shape.value), grade: -height / descentLength * shape.first,
        curvature: -height / (descentLength * descentLength) * shape.second,
        progress: 0.5 + progress * 0.5, hasGround: true };
    }
  }

  if (type === 'double') {
    const firstPlatform = Math.max(1, ramp.firstPlatformLength ?? 5);
    const gap = Math.max(1, ramp.gapLength ?? 8);
    const secondRamp = Math.max(1, ramp.secondRampLength ?? 8);
    const secondPlatform = Math.max(1, ramp.secondPlatformLength ?? 18);
    const descentLength = Math.max(1, ramp.descentLength ?? 10);
    const secondPlatformEnd = firstPlatform + gap + secondRamp + secondPlatform;
    if (afterTakeoff <= firstPlatform) return flatProfile(height, 0.5, true);
    if (afterTakeoff <= firstPlatform + gap) return flatProfile(height, 0.58, true);
    if (afterTakeoff <= firstPlatform + gap + secondRamp) {
      const progress = clamp((afterTakeoff - firstPlatform - gap) / secondRamp, 0, 1);
      const shape = smoothRampShape(progress);
      return { offset: height * (1 + 0.2 * shape.value),
        grade: height * 0.2 / secondRamp * shape.first,
        curvature: height * 0.2 / (secondRamp * secondRamp) * shape.second,
        progress: 0.62 + progress * 0.2, hasGround: true };
    }
    if (afterTakeoff <= secondPlatformEnd)
      return flatProfile(height * 1.2, 0.85, true);
    if (afterTakeoff <= secondPlatformEnd + descentLength) {
      const progress = clamp((afterTakeoff - secondPlatformEnd) / descentLength, 0, 1);
      const shape = smoothRampShape(progress);
      const elevatedHeight = height * 1.2;
      return { offset: elevatedHeight * (1 - shape.value),
        grade: -elevatedHeight / descentLength * shape.first,
        curvature: -elevatedHeight / (descentLength * descentLength) * shape.second,
        progress: 0.85 + progress * 0.15, hasGround: true };
    }
  }

  return null;
}

function flatProfile(offset: number, progress: number, hasGround: boolean): RampSurfaceProfile {
  return { offset, grade: 0, curvature: 0, progress, hasGround };
}

export function generateProceduralRamps(options: RampGenerationOptions): TrackRamp[] {
  const count = clamp(Math.floor(Number(options.count) || 0), 0, 16);
  if (count === 0 || options.regions.length === 0 || options.totalLength <= 0 || options.trackWidth < 9) return [];
  const random = seededRandom(hashSeed(options.seed));
  const types = shuffled([...RAMP_KINDS], random);
  const ramps: TrackRamp[] = [];
  const occupied: { start: number; end: number }[] = [];

  for (let index = 0; index < count; index += 1) {
    const kind = types[index % types.length]!;
    const regions = shuffled([...options.regions], random);
    let placed: TrackRamp | null = null;

    for (const region of regions) {
      const start = clamp(region.start, 0, 1) * options.totalLength;
      const end = clamp(region.end, 0, 1) * options.totalLength;
      if (end <= start) continue;

      for (let attempt = 0; attempt < 36 && !placed; attempt += 1) {
        const ramp = createRamp(kind, `${options.trackId}:ramp-${index + 1}`, random);
        const spanBeforeLanding = getRampFeatureSpan(ramp);
        const safeStart = start + spanBeforeLanding.approach;
        const safeEnd = end - Math.max(spanBeforeLanding.afterTakeoff, spanBeforeLanding.landingDistance);
        if (safeEnd <= safeStart) continue;
        ramp.takeoff = lerp(safeStart, safeEnd, random()) / options.totalLength;
        ramp.landingStart = mod(ramp.takeoff * options.totalLength + landingStartOffset(ramp), options.totalLength)
          / options.totalLength;
        ramp.landingEnd = mod(ramp.takeoff * options.totalLength + landingEndOffset(ramp), options.totalLength)
          / options.totalLength;
        ramp.regionId = region.id;

        const span = getRampFeatureSpan(ramp, options.totalLength);
        const featureStart = ramp.takeoff * options.totalLength - span.approach;
        const featureEnd = ramp.takeoff * options.totalLength + Math.max(span.afterTakeoff, span.landingDistance);
        if (!isRampPlacementSafe(options, region, ramp, occupied)) continue;
        placed = ramp;
      }
      if (placed) break;
    }

    if (placed) {
      const span = getRampFeatureSpan(placed, options.totalLength);
      const start = placed.takeoff * options.totalLength - span.approach;
      const end = placed.takeoff * options.totalLength + Math.max(span.afterTakeoff, span.landingDistance);
      occupied.push({ start, end });
      ramps.push(placed);
    }
  }
  return ramps.sort((a, b) => a.takeoff - b.takeoff);
}

export function isRampPlacementSafe(options: RampGenerationOptions, region: TrackRampRegion,
  ramp: TrackRamp, occupied: readonly { start: number; end: number }[] = []): boolean {
  const regionStart = clamp(region.start, 0, 1) * options.totalLength;
  const regionEnd = clamp(region.end, 0, 1) * options.totalLength;
  const span = getRampFeatureSpan(ramp, options.totalLength);
  const featureStart = ramp.takeoff * options.totalLength - span.approach;
  const featureEnd = ramp.takeoff * options.totalLength + Math.max(span.afterTakeoff, span.landingDistance);
  const startFinishClearance = Math.max(18, options.trackWidth * 1.5);
  if (featureStart < regionStart || featureEnd > regionEnd
    || featureStart < startFinishClearance || featureEnd > options.totalLength - startFinishClearance
    || overlaps(featureStart, featureEnd, occupied, 8)) return false;
  return safeCurvature(options, region, featureStart, featureEnd)
    && safeObstacles(options, region, featureStart, featureEnd);
}

function createRamp(kind: RampKind, id: string, random: () => number): TrackRamp {
  const ranged = (low: number, high: number) => lerp(low, high, random());
  const ramp: TrackRamp = { id, kind, takeoff: 0, landingStart: 0, landingEnd: 0,
    launchAngleDegrees: 0, minimumSpeed: 0, maximumVerticalSpeed: 0,
    rampLength: 1, rampHeight: 0, receiverLength: 0 };
  if (kind === 'jump') Object.assign(ramp, { rampLength: ranged(13, 15), rampHeight: ranged(2.2, 2.6),
    launchAngleDegrees: ranged(15, 17), minimumSpeed: 10, maximumVerticalSpeed: 8.2,
    gapLength: ranged(9, 12), receiverLength: ranged(22, 26) });
  else if (kind === 'bump') Object.assign(ramp, { rampLength: ranged(6, 7), rampHeight: ranged(0.78, 0.92),
    launchAngleDegrees: ranged(6, 8), minimumSpeed: 12, maximumVerticalSpeed: 4.2,
    receiverLength: ranged(5, 7) });
  else if (kind === 'platform') Object.assign(ramp, { rampLength: ranged(13, 15), rampHeight: ranged(3.0, 3.3),
    launchAngleDegrees: ranged(13, 15), minimumSpeed: 0, maximumVerticalSpeed: 8.2,
    receiverLength: 34, platformLength: ranged(21, 24), descentLength: ranged(9, 10) });
  else Object.assign(ramp, { rampLength: ranged(10, 12), rampHeight: ranged(1.9, 2.2),
    launchAngleDegrees: ranged(13, 15), minimumSpeed: 0, maximumVerticalSpeed: 8.2,
    receiverLength: 33, firstPlatformLength: ranged(2.5, 3.5), gapLength: ranged(5.5, 6.5),
    secondRampLength: ranged(3.5, 4.5), secondPlatformLength: ranged(18, 21) });
  return ramp;
}

function landingStartOffset(ramp: TrackRamp): number {
  return ramp.kind === 'bump' ? 1.5 : ramp.kind === 'jump' ? ramp.gapLength ?? 11 : ramp.kind === 'double'
    ? (ramp.firstPlatformLength ?? 5) + (ramp.gapLength ?? 8) + (ramp.secondRampLength ?? 8) : 5;
}

function landingEndOffset(ramp: TrackRamp): number {
  if (ramp.kind === 'bump') return 13;
  return getRampFeatureSpan(ramp).afterTakeoff;
}

function safeCurvature(options: RampGenerationOptions, region: TrackRampRegion, start: number, end: number): boolean {
  const minimumRadius = Math.max(0, region.minimumCurveRadius);
  if (minimumRadius === 0) return true;
  const samples = Math.max(2, Math.ceil((end - start) / 2));
  for (let index = 0; index <= samples; index += 1) {
    const distance = lerp(start, end, index / samples);
    const before = options.sampleAt(distance - 0.75);
    const after = options.sampleAt(distance + 0.75);
    const cross = before.tangentX * after.tangentZ - before.tangentZ * after.tangentX;
    const dot = before.tangentX * after.tangentX + before.tangentZ * after.tangentZ;
    const curvature = Math.abs(Math.atan2(cross, dot)) / 1.5;
    if (curvature > 0 && 1 / curvature < minimumRadius) return false;
  }
  return true;
}

function safeObstacles(options: RampGenerationOptions, region: TrackRampRegion, start: number, end: number): boolean {
  const clearance = options.trackWidth / 2 + Math.max(0, region.obstacleClearance ?? 3);
  const samples = Math.max(2, Math.ceil((end - start) / 3));
  for (let index = 0; index <= samples; index += 1) {
    const point = options.sampleAt(lerp(start, end, index / samples));
    for (const obstacle of options.obstacles ?? []) {
      const radius = Math.hypot(Math.max(0, obstacle.width ?? 0) / 2,
        Math.max(0, obstacle.depth ?? 0) / 2);
      if (Math.hypot(point.x - obstacle.x, point.z - obstacle.z) < clearance + radius) return false;
    }
  }
  return true;
}

function overlaps(start: number, end: number, occupied: readonly { start: number; end: number }[], gap: number): boolean {
  return occupied.some(item => start < item.end + gap && end + gap > item.start);
}

function shuffled<T>(values: T[], random: () => number): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [values[index], values[swap]] = [values[swap]!, values[index]!];
  }
  return values;
}

function hashSeed(seed: number | string): number {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  let hash = 2166136261;
  for (const character of String(seed)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed || 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function smoothRampShape(progress: number, earlyDescent = 0) {
  const value = progress * progress * (3 - 2 * progress);
  const curve = progress * progress * (1 - progress) * (1 - progress);
  const firstCurve = 2 * progress * (1 - progress) * (1 - 2 * progress);
  const secondCurve = 2 - 12 * progress + 12 * progress * progress;
  return { value: value + earlyDescent * curve,
    first: 6 * progress * (1 - progress) + earlyDescent * firstCurve,
    second: 6 - 12 * progress + earlyDescent * secondCurve };
}

function launchRampShape(progress: number, length: number, height: number, angleDegrees: number) {
  const endGrade = height > 0 ? Math.tan(angleDegrees * Math.PI / 180) * length / height : 0;
  const cubic = endGrade - 2;
  const quadratic = 3 - endGrade;
  return { value: cubic * progress ** 3 + quadratic * progress ** 2,
    first: 3 * cubic * progress ** 2 + 2 * quadratic * progress,
    second: 6 * cubic * progress + 2 * quadratic };
}
