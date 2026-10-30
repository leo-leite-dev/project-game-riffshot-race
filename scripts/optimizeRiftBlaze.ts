import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inflateSync, deflateSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

type Accessor = { bufferView: number; byteOffset?: number; count: number; type: string; componentType: number; sparse?: unknown; min?: number[]; max?: number[] };
type BufferView = { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number };
type Image = { bufferView: number; uri?: string; mimeType?: string };
type GlbJson = {
  asset: { extras: { author?: string; source?: string; license?: string; riffshotModifications?: string; [key: string]: unknown } };
  accessors: Accessor[]; bufferViews: BufferView[]; buffers: { byteLength: number }[];
  meshes: { primitives: { attributes: Record<string, number>; indices?: number; material: number; targets?: unknown; extensions?: unknown }[] }[];
  materials: unknown[]; images: Image[]; textures?: { source: number }[];
  animations?: { samplers: { input: number; output: number }[] }[]; skins?: unknown[];
};

export function decodeGlb(data: Buffer) {
  if (data.readUInt32LE(0) !== 0x46546c67 || data.readUInt32LE(4) !== 2
    || data.readUInt32LE(8) !== data.length) throw new Error('GLB inválido');
  let json: GlbJson | undefined, bin: Buffer | undefined;
  for (let at = 12; at < data.length;) {
    const size = data.readUInt32LE(at), type = data.readUInt32LE(at + 4);
    if (at + 8 + size > data.length) throw new Error('Chunk inválido');
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8', at + 8, at + 8 + size).trim());
    if (type === 0x004e4942) bin = data.subarray(at + 8, at + 8 + size);
    at += size + 8;
  }
  if (!json || !bin) throw new Error('GLB sem dados');
  return { json, bin };
}

export function encodeGlb(json: GlbJson, bin: Buffer) {
  const text = Buffer.from(JSON.stringify(json));
  const j = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32); text.copy(j);
  const b = Buffer.alloc(Math.ceil(bin.length / 4) * 4); bin.copy(b);
  const output = Buffer.alloc(28 + j.length + b.length);
  output.writeUInt32LE(0x46546c67, 0); output.writeUInt32LE(2, 4); output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(j.length, 12); output.writeUInt32LE(0x4e4f534a, 16); j.copy(output, 20);
  output.writeUInt32LE(b.length, 20 + j.length); output.writeUInt32LE(0x004e4942, 24 + j.length); b.copy(output, 28 + j.length);
  return output;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function pngChunk(type: string, content: Buffer) {
  const result = Buffer.alloc(content.length + 12);
  result.writeUInt32BE(content.length, 0); result.write(type, 4); content.copy(result, 8);
  let crc = 0xffffffff;
  for (const value of result.subarray(4, result.length - 4)) crc = crcTable[(crc ^ value) & 255] ^ (crc >>> 8);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}

export function pngScanlines(png: Buffer) {
  const chunks = [];
  for (let at = 8; at < png.length;) {
    const size = png.readUInt32BE(at), type = png.toString('ascii', at + 4, at + 8);
    if (at + size + 12 > png.length) throw new Error('PNG truncado');
    if (type === 'IDAT') chunks.push(png.subarray(at + 8, at + 8 + size));
    at += size + 12;
  }
  return inflateSync(Buffer.concat(chunks));
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function pngPixels(png: Buffer) {
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[png[25]];
  if (png[24] !== 8 || png[28] !== 0 || !channels) throw new Error('PNG não suportado pelo refiltro');
  const scanlines = pngScanlines(png), stride = width * channels, pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = scanlines[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0;
      const b = y ? pixels[(y - 1) * stride + x] : 0;
      const c = y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      const prediction = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b
        : filter === 3 ? (a + b) >> 1 : filter === 4 ? paeth(a, b, c) : undefined;
      if (prediction === undefined) throw new Error('Filtro PNG inválido');
      pixels[y * stride + x] = (scanlines[y * (stride + 1) + x + 1] + prediction) & 255;
    }
  }
  return { pixels, stride, height, channels };
}

function adaptiveScanlines(png: Buffer) {
  const { pixels, stride, height, channels } = pngPixels(png);
  const output = Buffer.alloc((stride + 1) * height);
  const candidates = Array.from({ length: 5 }, () => Buffer.alloc(stride));
  for (let y = 0; y < height; y++) {
    const scores = [0, 0, 0, 0, 0];
    for (let x = 0; x < stride; x++) {
      const value = pixels[y * stride + x];
      const a = x >= channels ? pixels[y * stride + x - channels] : 0;
      const b = y ? pixels[(y - 1) * stride + x] : 0;
      const c = y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      const predictions = [0, a, b, (a + b) >> 1, paeth(a, b, c)];
      for (let filter = 0; filter < 5; filter++) {
        const difference = (value - predictions[filter]) & 255;
        candidates[filter][x] = difference; scores[filter] += Math.min(difference, 256 - difference);
      }
    }
    const best = scores.indexOf(Math.min(...scores));
    output[y * (stride + 1)] = best; candidates[best].copy(output, y * (stride + 1) + 1);
  }
  return output;
}

export function recompressPng(png: Buffer) {
  if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Assinatura PNG inválida');
  let data = deflateSync(pngScanlines(png), { level: 9 });
  if (png[24] === 8 && png[28] === 0) {
    const adaptive = deflateSync(adaptiveScanlines(png), { level: 9 });
    if (adaptive.length < data.length) data = adaptive;
  }
  const compressed = pngChunk('IDAT', data);
  const chunks = [png.subarray(0, 8)]; let inserted = false;
  for (let at = 8; at < png.length;) {
    const size = png.readUInt32BE(at), type = png.toString('ascii', at + 4, at + 8);
    if (type === 'IDAT') {
      if (!inserted) { chunks.push(compressed); inserted = true; }
    } else chunks.push(png.subarray(at, at + size + 12));
    at += size + 12;
  }
  const result = Buffer.concat(chunks);
  return result.length < png.length ? result : png;
}

const components: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const bytes: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
export function accessorBytes(json: GlbJson, bin: Buffer, index: number) {
  const a = json.accessors[index], view = json.bufferViews[a.bufferView];
  if (a.sparse) throw new Error('Accessor sparse não suportado');
  const width = components[a.type] * bytes[a.componentType];
  if (!width) throw new Error('Formato de accessor não suportado');
  const result = Buffer.alloc(a.count * width);
  for (let i = 0; i < a.count; i++) {
    const offset = (view.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (view.byteStride ?? width);
    bin.copy(result, i * width, offset, offset + width);
  }
  return result;
}

function textureCoordinates(material: unknown) {
  const used = new Set<string>();
  const visit = (object: unknown): void => {
    if (!object || typeof object !== 'object') return;
    for (const [key, value] of Object.entries(object)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const texture = value as { index?: unknown; texCoord?: number; extensions?: { KHR_texture_transform?: { texCoord?: number } } };
        if (/Texture$/.test(key) && Number.isInteger(texture.index)) {
          used.add(`TEXCOORD_${texture.extensions?.KHR_texture_transform?.texCoord ?? texture.texCoord ?? 0}`);
        }
        visit(value);
      }
    }
  };
  visit(material); return used;
}

// No decimation, quantization or texture resampling. All retained attribute
// components and decoded PNG scanlines remain byte-identical to the source.
export function optimizeGlb(source: Buffer) {
  const { json: original, bin } = decodeGlb(source);
  if (original.animations?.length || original.skins?.length) throw new Error('Rig/clipes não suportados por este processo');
  const json = structuredClone(original);
  const parts: Buffer[] = [], views: BufferView[] = [], accessors: Accessor[] = [], mappings = new Map<string, number>(); let length = 0;
  const addView = (data: Buffer) => {
    const padding = (4 - length % 4) % 4;
    if (padding) { parts.push(Buffer.alloc(padding)); length += padding; }
    const index = views.length;
    views.push({ buffer: 0, byteOffset: length, byteLength: data.length });
    parts.push(data); length += data.length; return index;
  };
  const report = { removedUvAttributes: 0, narrowedIndexAccessors: 0, weldedVertices: 0, pngBytesSaved: 0 };
  const copyAccessor = (index: number, indices = false): number => {
    const key = `${index}:${indices}`;
    const mapped = mappings.get(key);
    if (mapped !== undefined) return mapped;
    const a = structuredClone(original.accessors[index]); let data = accessorBytes(original, bin, index);
    if (indices && a.componentType === 5125) {
      let max = 0;
      for (let i = 0; i < a.count; i++) max = Math.max(max, data.readUInt32LE(i * 4));
      if (max <= 65535) {
        const compact = Buffer.alloc(a.count * 2);
        for (let i = 0; i < a.count; i++) compact.writeUInt16LE(data.readUInt32LE(i * 4), i * 2);
        data = compact; a.componentType = 5123; report.narrowedIndexAccessors++;
      }
    }
    a.bufferView = addView(data); a.byteOffset = 0;
    const next = accessors.length; accessors.push(a); mappings.set(key, next); return next;
  };
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
    if (primitive.targets || primitive.extensions) throw new Error('Primitiva não inspecionada');
    const used = textureCoordinates(json.materials[primitive.material]);
    for (const name of Object.keys(primitive.attributes)) {
      if (name.startsWith('TEXCOORD_') && !used.has(name)) { delete primitive.attributes[name]; report.removedUvAttributes++; }
    }
    const columns = Object.entries(primitive.attributes).map(([name, index]) => ({ name, index,
      data: accessorBytes(original, bin, index), width: components[original.accessors[index].type] * bytes[original.accessors[index].componentType] }));
    const count = original.accessors[primitive.attributes.POSITION].count;
    const keys = new Map<string, number>(), unique: number[] = [], remap = new Uint32Array(count);
    for (let i = 0; i < count; i++) {
      // Merge only completely identical vertices, including UV seams/normals.
      const key = columns.map(c => c.data.subarray(i * c.width, (i + 1) * c.width).toString('base64')).join(':');
      if (!keys.has(key)) { keys.set(key, unique.length); unique.push(i); }
      remap[i] = keys.get(key)!;
    }
    if (unique.length === count || primitive.indices === undefined) {
      for (const column of columns) primitive.attributes[column.name] = copyAccessor(column.index);
      if (primitive.indices !== undefined) primitive.indices = copyAccessor(primitive.indices, true);
    } else {
      report.weldedVertices += count - unique.length;
      for (const column of columns) {
        const data = Buffer.alloc(unique.length * column.width);
        unique.forEach((index, i) => column.data.copy(data, i * column.width, index * column.width, (index + 1) * column.width));
        const a = { ...original.accessors[column.index], count: unique.length, bufferView: addView(data), byteOffset: 0 };
        primitive.attributes[column.name] = accessors.length; accessors.push(a);
      }
      const old = original.accessors[primitive.indices], oldData = accessorBytes(original, bin, primitive.indices);
      const indexBytes = unique.length <= 65536 ? 2 : 4;
      const data = Buffer.alloc(old.count * indexBytes);
      const readIndex = old.componentType === 5125 ? 'readUInt32LE' : old.componentType === 5123 ? 'readUInt16LE' : 'readUInt8';
      const writeIndex = indexBytes === 2 ? 'writeUInt16LE' : 'writeUInt32LE';
      for (let i = 0; i < old.count; i++) data[writeIndex](remap[oldData[readIndex](i * bytes[old.componentType])], i * indexBytes);
      const a = { ...old, bufferView: addView(data), byteOffset: 0, componentType: indexBytes === 2 ? 5123 : 5125,
        min: [0], max: [unique.length - 1] };
      if (old.componentType === 5125 && indexBytes === 2) report.narrowedIndexAccessors++;
      primitive.indices = accessors.length; accessors.push(a);
    }
  }
  for (const image of json.images ?? []) {
    if (image.uri || image.bufferView === undefined) throw new Error('Imagem externa não suportada');
    const old = original.bufferViews[image.bufferView];
    let imageData = bin.subarray(old.byteOffset ?? 0, (old.byteOffset ?? 0) + old.byteLength);
    if (image.mimeType === 'image/png') {
      const optimized = recompressPng(imageData);
      report.pngBytesSaved += imageData.length - optimized.length; imageData = optimized;
    }
    image.bufferView = addView(imageData);
  }
  json.bufferViews = views; json.accessors = accessors; json.buffers = [{ byteLength: length }];
  // Keep author/source/license metadata, including previous modification notices.
  json.asset.extras = { ...json.asset.extras, riffshotModifications:
    'Lossless PNG recompression; unused UV sets removed; index widths compacted. TiyaMakes is not affiliated with RIFFSHOT RACING.' };
  const output = encodeGlb(json, Buffer.concat(parts));
  return { output, report: { ...report, originalBytes: source.length, optimizedBytes: output.length,
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    optimizedSha256: createHash('sha256').update(output).digest('hex') } };
}

async function main() {
  const input = resolve('referencias-locais/Vehicles/sci_-_fi_buggy.glb');
  const output = resolve('referencias-locais/legacy-assets/vehicles/rift-blaze/rift-blaze.glb');
  const source = await readFile(input);
  const { output: result, report } = optimizeGlb(source);
  const metadata = decodeGlb(result).json.asset.extras;
  if (!metadata?.source?.includes('085bd97876a64eacbc041299ac945e9c') || !metadata?.license?.includes('CC-BY-4.0')) throw new Error('Autoria/licença não correspondem à inspeção');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, result);
  await writeFile(resolve('referencias-locais/legacy-assets/vehicles/rift-blaze/optimization.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
