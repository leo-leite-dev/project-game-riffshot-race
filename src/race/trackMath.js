const mod = (value, size) => ((value % size) + size) % size;
const lerp = (a, b, amount) => a + (b - a) * amount;

function catmull(a, b, c, d, t) {
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t ** 2 + (-a + 3 * b - 3 * c + d) * t ** 3);
}

export function sampleRaceTrack(track, samplesPerSegment = 12) {
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

export function sampleTrackAtProgress(track, progress) {
  const sampled = track?.points ? track : sampleRaceTrack(track);
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

export function findNearestTrackPoint(track, x, z) {
  const sampled = track?.points ? track : sampleRaceTrack(track);
  let nearest = null, minimumDistanceSq = Infinity;
  for (const point of sampled.points) {
    const dx = x - point.x, dz = z - point.z, distanceSq = dx * dx + dz * dz;
    if (distanceSq < minimumDistanceSq) {
      minimumDistanceSq = distanceSq;
      nearest = { ...point, lateral: -dx * point.tangentZ + dz * point.tangentX, distanceSq };
    }
  }
  return nearest;
}
