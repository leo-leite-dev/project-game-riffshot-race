export interface LabTrackVertex { x: number; y: number; z: number; bank: number }
export interface LabTrackChunk { name: string; vertices: Float32Array; indices: Uint32Array }

const WIDTH = 10;
const RAMP_HEIGHT = 3;

function longitudinalRange(start: number, end: number, step: number, height: (z: number) => number,
  bank: (z: number) => number = () => 0): LabTrackVertex[] {
  const points: LabTrackVertex[] = [];
  for (let z = start; z < end; z += step) points.push({ x: 0, y: height(z), z, bank: bank(z) });
  points.push({ x: 0, y: height(end), z: end, bank: bank(end) });
  return points;
}

function buildRibbon(name: string, points: readonly LabTrackVertex[]): LabTrackChunk {
  if (points.length < 2) throw new RangeError(`A seção ${name} precisa de pelo menos dois pontos.`);
  const vertices: number[] = [];
  const indices: number[] = [];
  const halfWidth = WIDTH / 2;
  for (let i = 0; i < points.length; i += 1) {
    const before = points[Math.max(0, i - 1)]!;
    const after = points[Math.min(points.length - 1, i + 1)]!;
    const tangentX = after.x - before.x;
    const tangentZ = after.z - before.z;
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

function buildBankedCurve(): LabTrackVertex[] {
  const radius = 14, startZ = 82, samples = 36;
  return Array.from({ length: samples + 1 }, (_, index) => {
    const progress = index / samples;
    const angle = progress * Math.PI / 2;
    return {
      x: radius * (1 - Math.cos(angle)), y: 0, z: startZ + radius * Math.sin(angle),
      bank: -Math.sin(progress * Math.PI) * Math.PI / 15,
    };
  });
}

/** Original throwaway geometry; the visual mesh and Rapier collider use these same vertices. */
export function createLabTrackChunks(): LabTrackChunk[] {
  const approach = longitudinalRange(0, 22, 1.5, () => 0);
  const ramp = longitudinalRange(22, 34, 1, z => RAMP_HEIGHT * (z - 22) / 12);
  const lip = longitudinalRange(34, 37, 1, () => RAMP_HEIGHT);
  const landing = longitudinalRange(46, 70, 1, () => RAMP_HEIGHT);
  const descent = longitudinalRange(70, 82, 1, z => RAMP_HEIGHT * (82 - z) / 12);
  const bankedCurve = buildBankedCurve();
  const exit = Array.from({ length: 17 }, (_, index) => ({
    x: 14 + index * 1.25, y: 0, z: 96, bank: 0,
  }));

  return [
    buildRibbon('Piso plano', approach),
    buildRibbon('Subida e rampa', [...ramp.slice(0, 1), ...ramp.slice(1), ...lip.slice(1)]),
    buildRibbon('Área de aterrissagem', landing),
    buildRibbon('Descida', descent),
    buildRibbon('Curva inclinada', [...bankedCurve, ...exit.slice(1)]),
  ];
}

export const LAB_TRACK_WIDTH = WIDTH;
