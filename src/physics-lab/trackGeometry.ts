export interface LabTrackVertex { x: number; y: number; z: number; bank: number }
export interface LabTrackChunk { name: string; vertices: Float32Array; indices: Uint32Array }

/** All distances are meters. These same vertices feed both rendering and Rapier. */
export interface LabTrackConfig {
  width: number;
  sampleSpacing: number;
  approachEndZ: number;
  rampEndZ: number;
  launchLipEndZ: number;
  landingStartZ: number;
  landingEndZ: number;
  descentEndZ: number;
  rampHeight: number;
  curveRadius: number;
  curveSamples: number;
  exitLength: number;
}

export const DEFAULT_LAB_TRACK_CONFIG: Readonly<LabTrackConfig> = Object.freeze({
  width: 10,
  sampleSpacing: 1,
  approachEndZ: 22,
  rampEndZ: 38,
  launchLipEndZ: 40,
  landingStartZ: 41,
  landingEndZ: 90,
  descentEndZ: 102,
  rampHeight: 2,
  curveRadius: 14,
  curveSamples: 36,
  exitLength: 20,
});

function longitudinalRange(start: number, end: number, step: number, height: (z: number) => number,
  bank: (z: number) => number = () => 0): LabTrackVertex[] {
  const points: LabTrackVertex[] = [];
  for (let z = start; z < end; z += step) points.push({ x: 0, y: height(z), z, bank: bank(z) });
  points.push({ x: 0, y: height(end), z: end, bank: bank(end) });
  return points;
}

function buildRibbon(name: string, points: readonly LabTrackVertex[], width: number,
  startTangent?: { x: number; z: number }): LabTrackChunk {
  if (points.length < 2) throw new RangeError(`A seção ${name} precisa de pelo menos dois pontos.`);
  const vertices: number[] = [];
  const indices: number[] = [];
  const halfWidth = width / 2;
  for (let i = 0; i < points.length; i += 1) {
    const before = points[Math.max(0, i - 1)]!;
    const after = points[Math.min(points.length - 1, i + 1)]!;
    const tangentX = i === 0 && startTangent ? startTangent.x : after.x - before.x;
    const tangentZ = i === 0 && startTangent ? startTangent.z : after.z - before.z;
    const tangentLength = Math.hypot(tangentX, tangentZ) || 1;
    const rightX = tangentZ / tangentLength;
    const rightZ = -tangentX / tangentLength;
    const bankRise = Math.sin(points[i]!.bank) * halfWidth;
    for (const side of [-1, 1]) {
      vertices.push(points[i]!.x + rightX * halfWidth * side,
        points[i]!.y + bankRise * side,
        points[i]!.z + rightZ * halfWidth * side);
    }
    if (i === 0) continue;
    const previous = (i - 1) * 2;
    const current = i * 2;
    indices.push(previous, current, previous + 1, previous + 1, current, current + 1);
  }
  return { name, vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}

function buildBankedCurve(radius: number, startZ: number, samples: number): LabTrackVertex[] {
  return Array.from({ length: samples + 1 }, (_, index) => {
    const progress = index / samples;
    const angle = progress * Math.PI / 2;
    return {
      x: radius * (1 - Math.cos(angle)), y: 0, z: startZ + radius * Math.sin(angle),
      bank: -Math.sin(progress * Math.PI) * Math.PI / 15,
    };
  });
}

function validateConfig(config: LabTrackConfig): void {
  const dimensions = [config.width, config.sampleSpacing, config.approachEndZ, config.rampEndZ,
    config.launchLipEndZ, config.landingStartZ, config.landingEndZ, config.descentEndZ,
    config.rampHeight, config.curveRadius, config.exitLength];
  if (!dimensions.every(Number.isFinite) || config.width <= 0 || config.sampleSpacing <= 0
    || config.rampHeight <= 0 || config.curveRadius <= 0 || config.exitLength <= 0
    || !Number.isInteger(config.curveSamples) || config.curveSamples < 2
    || !(0 < config.approachEndZ && config.approachEndZ < config.rampEndZ
      && config.rampEndZ < config.launchLipEndZ && config.launchLipEndZ < config.landingStartZ
      && config.landingStartZ < config.landingEndZ && config.landingEndZ < config.descentEndZ)) {
    throw new RangeError('As dimensões da pista de teste devem ser finitas, positivas e estar em ordem crescente.');
  }
}

/**
 * Circuito original: aproximação, subida, topo, rampa de salto, vão, pouso,
 * descida gradual e curva de saída. O vão entre rampa e pouso é intencional.
 */
export function createLabTrackChunks(config: LabTrackConfig = DEFAULT_LAB_TRACK_CONFIG): LabTrackChunk[] {
  validateConfig(config);
  const { width, sampleSpacing: step, approachEndZ, rampEndZ, launchLipEndZ,
    landingStartZ, landingEndZ, descentEndZ, rampHeight, curveRadius, curveSamples, exitLength } = config;
  const approach = longitudinalRange(0, approachEndZ, step, () => 0);
  const ramp = longitudinalRange(approachEndZ, rampEndZ, step, z => {
    const progress = (z - approachEndZ) / (rampEndZ - approachEndZ);
    // Zero slope where the incline joins the flat approach and plateau. This
    // removes the two abrupt normal changes that can kick the raycast springs.
    const easedProgress = progress * progress * (3 - 2 * progress);
    return rampHeight * easedProgress;
  });
  const lip = longitudinalRange(rampEndZ, launchLipEndZ, step, () => rampHeight);
  const landing = longitudinalRange(landingStartZ, landingEndZ, step, () => rampHeight);
  const descent = longitudinalRange(landingEndZ, descentEndZ, step, z => {
    const progress = (z - landingEndZ) / (descentEndZ - landingEndZ);
    const easedProgress = progress * progress * (3 - 2 * progress);
    return rampHeight * (1 - easedProgress);
  });
  const bankedCurve = buildBankedCurve(curveRadius, descentEndZ, curveSamples);
  const curveEndX = curveRadius;
  const curveEndZ = descentEndZ + curveRadius;
  const exit = Array.from({ length: Math.ceil(exitLength / step) + 1 }, (_, index) => ({
    x: curveEndX + Math.min(index * step, exitLength), y: 0, z: curveEndZ, bank: 0,
  }));

  return [
    buildRibbon('Reta de aproximação', approach, width),
    buildRibbon('Subida e rampa de salto', [...ramp, ...lip.slice(1)], width),
    buildRibbon('Superfície de aterrissagem', landing, width),
    buildRibbon('Descida progressiva', descent, width),
    buildRibbon('Curva inclinada e reta final', [...bankedCurve, ...exit.slice(1)], width, { x: 0, z: 1 }),
  ];
}

export const LAB_TRACK_WIDTH = DEFAULT_LAB_TRACK_CONFIG.width;
