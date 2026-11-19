import { sampleRampSurfaceProfile } from './rampLibrary.ts';
import type { TrackRamp, TrackRampRegion } from './rampLibrary.ts';

export interface TrackWaypoint { x: number; z: number; y?: number }
export type TrackJump = TrackRamp;
export interface TrackEdgeSpikes { spacing: number; height: number; baseWidth: number }
export interface TrackPath {
  waypoints: readonly TrackWaypoint[];
  jumps?: readonly TrackJump[];
  rampRegions?: readonly TrackRampRegion[];
  rampCount?: number;
  edgeSpikes?: TrackEdgeSpikes;
}
export interface TrackPoint { x: number; z: number; y: number; distance: number; tangentX: number; tangentZ: number }
export interface SampledTrack { points: TrackPoint[]; totalLength: number }
export interface NearestTrackPoint extends TrackPoint { lateral: number; distanceSq: number }
export interface TrackSurfaceSample {
  y: number;
  grade: number;
  curvature: number;
  tangentX: number;
  tangentZ: number;
  ramp: TrackJump | null;
  rampProgress: number;
  hasGround: boolean;
}

const mod = (value: number, size: number) => ((value % size) + size) % size;
const lerp = (a: number, b: number, amount: number) => a + (b - a) * amount;
export const RACE_TRACK_SAMPLES_PER_SEGMENT = 12;

/** Projection of forward course direction onto the vehicle's local forward axis. */
export function trackHeadingAlignment(heading: number, tangentX: number, tangentZ: number): number {
  return Math.max(-1, Math.min(1, Math.sin(heading) * tangentX + Math.cos(heading) * tangentZ));
}

function catmull(a: number, b: number, c: number, d: number, t: number) {
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t ** 2 + (-a + 3 * b - 3 * c + d) * t ** 3);
}

export function sampleRaceTrack(track: TrackPath, samplesPerSegment = 12): SampledTrack {
  if (!Array.isArray(track?.waypoints) || track.waypoints.length < 4) throw new TypeError('A pista precisa de pelo menos quatro waypoints.');
  const samples = Math.max(2, Math.floor(samplesPerSegment));
  const points = [];
  for (let index = 0; index < track.waypoints.length; index += 1) {
    const a = track.waypoints[mod(index - 1, track.waypoints.length)];
    const b = track.waypoints[index], c = track.waypoints[(index + 1) % track.waypoints.length];
    const d = track.waypoints[(index + 2) % track.waypoints.length];
    for (let step = 0; step < samples; step += 1) {
      const t = step / samples;
      points.push({ x: catmull(a.x, b.x, c.x, d.x, t), z: catmull(a.z, b.z, c.z, d.z, t),
        y: catmull(a.y ?? 0, b.y ?? 0, c.y ?? 0, d.y ?? 0, t), distance: 0, tangentX: 0, tangentZ: 0 });
    }
  }
  let totalLength = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index], next = points[(index + 1) % points.length];
    const dx = next.x - point.x, dz = next.z - point.z, length = Math.hypot(dx, dz) || 1;
    point.distance = totalLength;
    point.tangentX = dx / length;
    point.tangentZ = dz / length;
    totalLength += Math.hypot(dx, dz);
  }
  return { points, totalLength };
}

export function sampleTrackAtProgress(track: SampledTrack | TrackPath, progress: number): TrackPoint {
  const sampled = 'points' in track && track.points ? track : sampleRaceTrack(track as TrackPath);
  const distance = mod(progress, sampled.totalLength);
  let low = 0, high = sampled.points.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (sampled.points[middle].distance <= distance) low = middle;
    else high = middle - 1;
  }
  const a = sampled.points[low], b = sampled.points[(low + 1) % sampled.points.length];
  const segmentLength = low + 1 < sampled.points.length ? b.distance - a.distance : sampled.totalLength - a.distance;
  const amount = segmentLength > 0 ? (distance - a.distance) / segmentLength : 0;
  const tangentX = lerp(a.tangentX, b.tangentX, amount), tangentZ = lerp(a.tangentZ, b.tangentZ, amount);
  const tangentLength = Math.hypot(tangentX, tangentZ) || 1;
  return { x: lerp(a.x, b.x, amount), z: lerp(a.z, b.z, amount), y: lerp(a.y, b.y, amount),
    tangentX: tangentX / tangentLength, tangentZ: tangentZ / tangentLength, distance };
}

/** Shared vertical profile used by the official race physics and ramp meshes. */
export function sampleTrackSurface(track: SampledTrack, jumps: readonly TrackJump[] | undefined,
  distance: number): TrackSurfaceSample {
  const pathDistance = mod(distance, track.totalLength);
  const trackPoint = sampleTrackAtProgress(track, pathDistance);
  let y = trackPoint.y;
  let grade = 0;
  let curvature = 0;
  let ramp: TrackJump | null = null;
  let rampProgress = 0;
  let largestOffset = 0;
  let hasGround = true;

  for (const candidate of jumps ?? []) {
    const profile = sampleRampSurfaceProfile(candidate, pathDistance, track.totalLength);
    if (!profile || (profile.hasGround && Math.abs(profile.offset) <= Math.abs(largestOffset))) continue;
    largestOffset = profile.offset;
    grade = profile.grade;
    curvature = profile.curvature;
    ramp = candidate;
    rampProgress = profile.progress;
    hasGround = profile.hasGround;
  }

  y += largestOffset;
  const tangentProbe = 0.25;
  const baseBefore = sampleTrackAtProgress(track, pathDistance - tangentProbe).y;
  const baseAfter = sampleTrackAtProgress(track, pathDistance + tangentProbe).y;
  grade += (baseAfter - baseBefore) / (2 * tangentProbe);
  curvature += (baseAfter - 2 * sampleTrackAtProgress(track, pathDistance).y + baseBefore)
    / (tangentProbe * tangentProbe);
  return { y, grade, curvature, tangentX: trackPoint.tangentX, tangentZ: trackPoint.tangentZ,
    ramp, rampProgress, hasGround };
}

export function findNearestTrackPoint(track: SampledTrack | TrackPath, x: number, z: number): NearestTrackPoint | null {
  const sampled = 'points' in track && track.points ? track : sampleRaceTrack(track as TrackPath);
  let nearest: NearestTrackPoint | null = null, minimumDistanceSq = Infinity;
  for (let index = 0; index < sampled.points.length; index += 1) {
    const point = sampled.points[index], next = sampled.points[(index + 1) % sampled.points.length];
    const segmentX = next.x - point.x, segmentZ = next.z - point.z;
    const lengthSq = segmentX * segmentX + segmentZ * segmentZ;
    if (lengthSq === 0) continue;
    const amount = Math.max(0, Math.min(1, ((x - point.x) * segmentX + (z - point.z) * segmentZ) / lengthSq));
    const projectedX = lerp(point.x, next.x, amount), projectedZ = lerp(point.z, next.z, amount);
    const dx = x - projectedX, dz = z - projectedZ, distanceSq = dx * dx + dz * dz;
    if (distanceSq < minimumDistanceSq) {
      minimumDistanceSq = distanceSq;
      const length = Math.sqrt(lengthSq), tangentX = segmentX / length, tangentZ = segmentZ / length;
      nearest = { x: projectedX, z: projectedZ, y: lerp(point.y, next.y, amount),
        tangentX, tangentZ, distance: mod(point.distance + length * amount, sampled.totalLength),
        lateral: -dx * tangentZ + dz * tangentX, distanceSq };
    }
  }
  return nearest;
}
