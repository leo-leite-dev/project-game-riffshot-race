import { createHash } from 'node:crypto';
import { decodeGlb, encodeGlb, optimizeGlb, accessorBytes } from './optimizeRiftBlaze.js';
import { inspectVehicleGlb } from '../src/visuals/vehicles/loadVehicleModels.js';
import { getVehicleModelAsset } from '../src/visuals/vehicles/vehicleModels.js';

// Reuse the lossless geometry/PNG optimizer, then retain the reviewed Fan keys
// and deduplicate identical embedded data. No decimation or image resampling.
// Only the derived buffer is returned; the private original is never written.
export function optimizeThunderBug(source) {
  const { json: original, bin } = decodeGlb(source);
  const extras = original.asset?.extras;
  if (!extras?.author?.startsWith('Chenchanchong (')
    || !extras.source?.endsWith('/race-car-97768c0e69744cd5922ddc5a9fd59266')
    || !extras.license?.startsWith('CC-BY-4.0')) throw new Error('Metadados Thunder Bug não aprovados.');
  inspectVehicleGlb(source.buffer.slice(source.byteOffset, source.byteOffset + source.length), getVehicleModelAsset('thunder_bug.glb'));
  const staticJson = structuredClone(original);
  delete staticJson.animations;
  const optimized = optimizeGlb(encodeGlb(staticJson, bin));
  const { json, bin: compactBin } = decodeGlb(optimized.output);
  const parts = [], viewsByHash = new Map();
  let length = 0, deduplicatedBytes = 0;
  for (const view of json.bufferViews) {
    const data = compactBin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const hash = createHash('sha256').update(data).digest('hex');
    const previous = viewsByHash.get(hash);
    if (previous && previous.data.equals(data)) {
      view.byteOffset = previous.offset; deduplicatedBytes += data.length; continue;
    }
    const padding = (4 - length % 4) % 4;
    if (padding) { parts.push(Buffer.alloc(padding)); length += padding; }
    view.byteOffset = length;
    viewsByHash.set(hash, { data, offset: length });
    parts.push(data); length += data.length;
  }
  // Identical embedded images also share one GLTFLoader image source at runtime.
  const imagesByView = new Map(), imageRemap = new Map(), images = [];
  for (const [index, image] of json.images.entries()) {
    const view = json.bufferViews[image.bufferView], key = `${view.byteOffset}:${view.byteLength}:${image.mimeType}`;
    if (!imagesByView.has(key)) { imagesByView.set(key, images.length); images.push(image); }
    imageRemap.set(index, imagesByView.get(key));
  }
  for (const texture of json.textures ?? []) texture.source = imageRemap.get(texture.source);
  json.images = images;
  const mappings = new Map();
  const copyAnimationAccessor = index => {
    if (mappings.has(index)) return mappings.get(index);
    const padding = (4 - length % 4) % 4;
    if (padding) { parts.push(Buffer.alloc(padding)); length += padding; }
    const data = accessorBytes(original, bin, index);
    const a = { ...original.accessors[index], byteOffset: 0, bufferView: json.bufferViews.length };
    json.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: data.length });
    parts.push(data); length += data.length;
    const next = json.accessors.length; json.accessors.push(a); mappings.set(index, next); return next;
  };
  json.animations = structuredClone(original.animations);
  for (const animation of json.animations) for (const sampler of animation.samplers) {
    sampler.input = copyAnimationAccessor(sampler.input);
    sampler.output = copyAnimationAccessor(sampler.output);
  }
  json.buffers = [{ byteLength: length }];
  json.asset.extras.riffshotModifications = 'Lossless PNG recompression; unused UV sets removed; identical complete vertices welded; index widths compacted; identical embedded data/images deduplicated. Used UVs, triangles, image dimensions and Fan animation preserved. Chenchanchong is not affiliated with RIFFSHOT RACING.';
  const output = encodeGlb(json, Buffer.concat(parts));
  if (output.length > 25 * 1024 * 1024) throw new Error(`Thunder Bug derivado excede 25 MiB: ${output.length}.`);
  return { output, report: Object.freeze({ ...optimized.report, deduplicatedBytes, originalBytes: source.length, optimizedBytes: output.length,
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    optimizedSha256: createHash('sha256').update(output).digest('hex') }) };
}
