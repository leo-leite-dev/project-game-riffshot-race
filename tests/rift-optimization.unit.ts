import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { decodeGlb, accessorBytes, pngPixels, pngScanlines } from '../scripts/optimizeRiftBlaze.ts';

type TestAccessor = { bufferView: number; byteOffset?: number; count: number; type: string; componentType: number };
type TestPrimitive = { attributes: Record<string, number>; indices: number; material: number };
type TestJson = {
  asset: { extras: Record<string, string> }; nodes: unknown[]; materials: unknown[]; textures: Array<{ source: number }>;
  images: Array<{ bufferView: number; mimeType?: string }>; meshes: Array<{ primitives: TestPrimitive[] }>;
  accessors: TestAccessor[]; bufferViews: Array<{ buffer: number; byteOffset?: number; byteLength: number }>; buffers: Array<{ byteLength: number }>;
};
type TestDocument = { json: TestJson; bin: Buffer };

const sourceUrl = new URL('../referencias-locais/Vehicles/sci_-_fi_buggy.glb', import.meta.url);
const outputUrl = new URL('../public/models/cars/rift-blaze/rift-blaze.glb', import.meta.url);
const reportUrl = new URL('../public/models/cars/rift-blaze/optimization.json', import.meta.url);
const viewBytes = (json: TestJson, bin: Buffer, index: number): Buffer => {
  const view = json.bufferViews[index];
  return bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
};

test('candidato preserva autoria, licença, tamanho e hash registrados', () => {
  const output = readFileSync(outputUrl), report = JSON.parse(readFileSync(reportUrl, 'utf8'));
  const { json } = decodeGlb(output) as unknown as TestDocument;
  assert.match(json.asset.extras.source, /085bd97876a64eacbc041299ac945e9c/);
  assert.match(json.asset.extras.author, /TiyaMakes/);
  assert.match(json.asset.extras.license, /CC-BY-4.0/);
  assert.equal(createHash('sha256').update(output).digest('hex'), report.optimizedSha256);
  assert.equal(output.length, report.optimizedBytes);
  assert.ok(output.length < report.originalBytes);
});

test('comparação local: índices remapeados preservam todos os atributos usados e os triângulos',
  { skip: !existsSync(sourceUrl) ? 'Original privado não disponível no ambiente.' : false }, () => {
    const originalFile = readFileSync(sourceUrl);
    const source = decodeGlb(originalFile) as unknown as TestDocument, target = decodeGlb(readFileSync(outputUrl)) as unknown as TestDocument;
    const report = JSON.parse(readFileSync(reportUrl, 'utf8'));
    assert.equal(createHash('sha256').update(originalFile).digest('hex'), report.sourceSha256);
    assert.deepEqual(target.json.nodes, JSON.parse(JSON.stringify(source.json.nodes)), 'serialização JSON apenas normaliza -0 para 0');
    assert.deepEqual(target.json.materials, source.json.materials);
    assert.deepEqual(target.json.textures, source.json.textures);
    let triangles = 0;
    for (let m = 0; m < source.json.meshes.length; m++) {
      const a = source.json.meshes[m].primitives[0], b = target.json.meshes[m].primitives[0];
      const originalIndex = source.json.accessors[a.indices], targetIndex = target.json.accessors[b.indices];
      assert.equal(targetIndex.count, originalIndex.count);
      triangles += originalIndex.count / 3;
      const ai = accessorBytes(source.json, source.bin, a.indices), bi = accessorBytes(target.json, target.bin, b.indices);
      const index = (buffer: Buffer, componentType: number, i: number): number => componentType === 5125 ? buffer.readUInt32LE(i * 4) : buffer.readUInt16LE(i * 2);
      for (const [semantic, indexB] of Object.entries(b.attributes)) {
        const indexA = a.attributes[semantic];
        const aa = source.json.accessors[indexA], ba = target.json.accessors[indexB];
        assert.equal(aa.componentType, ba.componentType);
        const av = accessorBytes(source.json, source.bin, indexA), bv = accessorBytes(target.json, target.bin, indexB);
        const width = av.length / aa.count;
        for (let i = 0; i < originalIndex.count; i++) {
          const oa = index(ai, originalIndex.componentType, i) * width;
          const ob = index(bi, targetIndex.componentType, i) * width;
          assert.ok(av.subarray(oa, oa + width).equals(bv.subarray(ob, ob + width)), `${m}/${semantic}/${i}`);
        }
      }
    }
    assert.equal(triangles, 161868);
  });

test('comparação local: PNGs têm pixels idênticos e JPEG não é alterada',
  { skip: !existsSync(sourceUrl) ? 'Original privado não disponível no ambiente.' : false }, () => {
    const source = decodeGlb(readFileSync(sourceUrl)) as unknown as TestDocument, target = decodeGlb(readFileSync(outputUrl)) as unknown as TestDocument;
    assert.equal(source.json.images.length, 31);
    for (let i = 0; i < source.json.images.length; i++) {
      const a = source.json.images[i], b = target.json.images[i];
      const av = viewBytes(source.json, source.bin, a.bufferView), bv = viewBytes(target.json, target.bin, b.bufferView);
      assert.equal(a.mimeType, b.mimeType);
      if (a.mimeType === 'image/png') {
        assert.ok(av.subarray(16, 29).equals(bv.subarray(16, 29)), `IHDR ${i}`);
        if (av[24] === 8 && av[28] === 0) assert.ok(pngPixels(av).pixels.equals(pngPixels(bv).pixels), `Pixels ${i}`);
        else assert.ok(pngScanlines(av).equals(pngScanlines(bv)), `Scanlines inalteradas ${i}`);
      } else assert.ok(av.equals(bv), `JPEG ${i}`);
    }
  });
