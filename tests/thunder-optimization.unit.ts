import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { optimizeThunderBug } from '../scripts/optimizeThunderBug.ts';
import { decodeGlb, encodeGlb, accessorBytes, pngPixels } from '../scripts/optimizeRiftBlaze.ts';
import { inspectVehicleGlb } from '../src/visuals/vehicles/loadVehicleModels.ts';
import { getVehicleModelAsset } from '../src/visuals/vehicles/vehicleModels.ts';
import { vehicleAssetsPlugin } from '../scripts/vehicleAssetsPlugin.ts';
import type { ResolvedConfig } from 'vite';

type TestAccessor = { bufferView: number; byteOffset?: number; count: number; type: string; componentType: number };
type TestAnimation = { name?: string; channels: Array<{ target: { node?: number; path?: string } }>; samplers: Array<{ input: number; output: number }> };
type TestPrimitive = { attributes: Record<string, number>; indices: number; material: number };
type TestJson = {
  asset: { extras: Record<string, string> }; nodes: unknown[]; materials: unknown[]; samplers: unknown[];
  textures: Array<{ source: number }>; images: Array<{ bufferView: number; mimeType?: string }>;
  meshes: Array<{ primitives: TestPrimitive[] }>; accessors: TestAccessor[]; bufferViews: Array<{ buffer: number; byteOffset?: number; byteLength: number }>;
  buffers: Array<{ byteLength: number }>;
  animations: TestAnimation[]; skins?: unknown[];
};
type TestDocument = { json: TestJson; bin: Buffer };
type OutputAsset = { type: 'asset'; fileName: string; source: string | Uint8Array };
type PluginContext = { emitFile(item: OutputAsset): string };

const asset = getVehicleModelAsset('thunder_bug.glb');
if (!asset) throw new Error('asset Thunder ausente');
const arrayBuffer = (buffer: Buffer): ArrayBuffer => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length) as ArrayBuffer;
const hash = (data: Buffer): string => createHash('sha256').update(data).digest('hex');
const originalUrl = new URL('../referencias-locais/Vehicles/thunder_bug.glb', import.meta.url);

test('Thunder real: derivado <=25 MiB, pixels/UVs/triângulos/Fan e original preservados; hook emite a mesma URL', async t => {
  const source = await readFile(originalUrl), before = hash(source);
  const emitted: OutputAsset[] = [], plugin = vehicleAssetsPlugin();
  if (typeof plugin.configResolved !== 'function' || typeof plugin.generateBundle !== 'function') throw new TypeError('hook ausente');
  plugin.configResolved.call({} as never, { root: fileURLToPath(new URL('..', import.meta.url)) } as ResolvedConfig);
  // Exercise the actual emit hook/optimizer in memory, without running a build.
  const generate = plugin.generateBundle as unknown as (this: PluginContext, output: never, bundle: never, isWrite: boolean) => void | Promise<void>;
  await generate.call({ emitFile: (item: OutputAsset) => { emitted.push(item); return item.fileName; } }, {} as never, {} as never, false);
  assert.equal(emitted.length, 5);
  const emittedAsset = emitted.find(item => item.fileName === asset.url.slice(1));
   if (!emittedAsset || !Buffer.isBuffer(emittedAsset.source)) throw new Error('asset Thunder não emitido');
  const output = emittedAsset.source;
  assert.ok(output.length <= 25 * 1024 * 1024);
  assert.ok(output.length < source.length);
  assert.equal(hash(await readFile(originalUrl)), before);
  const old = decodeGlb(source) as unknown as TestDocument, next = decodeGlb(output) as unknown as TestDocument;
  assert.equal(next.json.images.length, 30, 'Imagem idêntica deduplicada, não redimensionada');
  assert.deepEqual(next.json.nodes, old.json.nodes);
  assert.deepEqual(next.json.materials, old.json.materials);
  assert.deepEqual(next.json.samplers, old.json.samplers);
  for (const key of ['author', 'title', 'source', 'license']) assert.equal(next.json.asset.extras[key], old.json.asset.extras[key]);
  assert.match(next.json.asset.extras.riffshotModifications, /Chenchanchong/);
  assert.doesNotThrow(() => inspectVehicleGlb(arrayBuffer(output), asset));
  assert.throws(() => inspectVehicleGlb(arrayBuffer(output)), /não aprovada/);
  assert.throws(() => inspectVehicleGlb(arrayBuffer(output), getVehicleModelAsset('camaro.glb')), /não aprovada/);
  const bytes: Record<number, number> = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }, widths: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
   const indices = (document: TestDocument, index: number): number[] => {
    const a = document.json.accessors[index], data = accessorBytes(document.json, document.bin, index);
    return Array.from({ length: a.count }, (_, i) => data.readUIntLE(i * bytes[a.componentType], bytes[a.componentType]));
  };
  let triangles = 0, removedUvAttributes = 0;
  for (const [m, mesh] of old.json.meshes.entries()) for (const [p, primitive] of mesh.primitives.entries()) {
    const compact = next.json.meshes[m].primitives[p];
    const a = indices(old, primitive.indices), b = indices(next, compact.indices);
    assert.equal(a.length, b.length); triangles += b.length / 3;
    assert.equal(compact.material, primitive.material);
    for (const name of Object.keys(primitive.attributes)) {
      if (!(name in compact.attributes)) { assert.match(name, /^TEXCOORD_\d+$/); removedUvAttributes++; }
    }
     const checkUsedUv = (object: unknown): void => {
       if (!object || typeof object !== 'object') return;
       for (const [name, value] of Object.entries(object)) if (value && typeof value === 'object') {
         const texture = value as { index?: unknown; texCoord?: number };
         if (/Texture$/.test(name) && Number.isInteger(texture.index)) {
           assert.ok(`TEXCOORD_${texture.texCoord ?? 0}` in compact.attributes, 'UV usado pelo material preservado');
        }
        checkUsedUv(value);
      }
    };
    checkUsedUv(next.json.materials[compact.material]);
    for (const [name, index] of Object.entries(compact.attributes)) {
      const original = primitive.attributes[name], oa = old.json.accessors[original], na = next.json.accessors[index];
      assert.equal(na.componentType, oa.componentType); assert.equal(na.type, oa.type);
      const stride = bytes[oa.componentType] * widths[oa.type];
      const x = accessorBytes(old.json, old.bin, original), y = accessorBytes(next.json, next.bin, index);
      for (let i = 0; i < a.length; i++) {
        assert.ok(x.subarray(a[i] * stride, (a[i] + 1) * stride).equals(y.subarray(b[i] * stride, (b[i] + 1) * stride)), `${name}: vértice/UV da face preservado`);
      }
    }
  }
  assert.equal(triangles, 63181); assert.equal(removedUvAttributes, 41);
   const image = (document: TestDocument, index: number): Buffer => {
    const im = document.json.images[index], view = document.json.bufferViews[im.bufferView];
    return document.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  };
   const checked = new Set<number>();
  for (const [index, texture] of old.json.textures.entries()) {
    if (checked.has(texture.source)) continue;
    checked.add(texture.source);
    const a = image(old, texture.source), b = image(next, next.json.textures[index].source);
    assert.ok(a.subarray(16, 29).equals(b.subarray(16, 29)), 'Dimensões, profundidade, canais e interlace originais');
    assert.ok(pngPixels(a).pixels.equals(pngPixels(b).pixels), 'Pixels decodificados idênticos');
  }
  assert.equal(checked.size, 31);
   for (const key of ['input', 'output'] as const) {
    assert.ok(accessorBytes(old.json, old.bin, old.json.animations[0].samplers[0][key])
      .equals(accessorBytes(next.json, next.bin, next.json.animations[0].samplers[0][key])));
  }
  for (const mutate of [
     (json: TestJson) => { json.animations[0].name = 'Other'; },
     (json: TestJson) => { json.animations[0].channels[0].target.node = 9; },
     (json: TestJson) => { json.animations[0].channels[0].target.path = 'translation'; },
     (json: TestJson) => { json.animations.push(structuredClone(json.animations[0])); },
     (json: TestJson) => { json.skins = [{}]; },
     (json: TestJson) => { (json.meshes[0].primitives[0] as TestPrimitive & { targets: unknown[] }).targets = []; },
     (json: TestJson) => { (json.images[0] as TestJson['images'][number] & { uri: string }).uri = 'https://example.com/image.png'; },
  ]) {
    const json = structuredClone(next.json); mutate(json);
    assert.throws(() => inspectVehicleGlb(arrayBuffer(encodeGlb(json, next.bin)), asset), /não aprovada|bloqueado/);
  }
   const changedKeys = Buffer.from(next.bin), keyAccessor = next.json.accessors[next.json.animations[0].samplers[0].output];
   const keyView = next.json.bufferViews[keyAccessor.bufferView];
   assert.ok(keyView);
   changedKeys[keyView.byteOffset ?? 0] ^= 1;
  assert.throws(() => inspectVehicleGlb(arrayBuffer(encodeGlb(next.json, changedKeys)), asset), /não aprovada/);
  t.diagnostic(`original=${source.length}; derivado=${output.length}; SHA256=${hash(output)}; triângulos=${triangles}; imagens verificadas=${checked.size}`);
});

test('otimizador Thunder rejeita autoria/licença inesperadas e Fan alterado antes de gerar derivado', async () => {
  const source = await readFile(originalUrl), { json, bin } = decodeGlb(source) as unknown as TestDocument;
  for (const key of ['author', 'license', 'source']) {
    const changed = structuredClone(json); changed.asset.extras[key] = 'Unexpected';
    assert.throws(() => optimizeThunderBug(encodeGlb(changed, bin)), /Metadados/);
  }
  json.animations[0].channels[0].target.path = 'translation';
  assert.throws(() => optimizeThunderBug(encodeGlb(json, bin)), /não aprovada/);
});
