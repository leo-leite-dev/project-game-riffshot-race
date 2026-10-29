import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_VEHICLE_BYTES, readVehicleManifest, validateVehiclePayload, vehicleAssetsPlugin } from '../scripts/vehicleAssetsPlugin.js';
import { prepareVehicleAssets } from '../scripts/prepareVehicleAssets.js';
import { VEHICLE_MODEL_ASSETS, getVehicleModelAsset } from '../src/visuals/vehicles/vehicleModels.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = join(root, 'assets', 'vehicles');
const sha256 = source => createHash('sha256').update(source).digest('hex');

test('release: pacote contém somente manifesto e cinco GLBs íntegros abaixo de 25 MiB, emitidos byte a byte', async () => {
  const manifest = await readVehicleManifest(root);
  assert.deepEqual((await readdir(directory)).sort(), ['manifest.json', ...VEHICLE_MODEL_ASSETS.map(asset => asset.fileName)].sort());
  const plugin = vehicleAssetsPlugin(), emitted = [];
  plugin.configResolved({ root });
  await plugin.generateBundle.call({ emitFile: asset => emitted.push(asset) });
  assert.deepEqual(emitted.map(asset => asset.fileName), VEHICLE_MODEL_ASSETS.map(asset => asset.url.slice(1)));
  for (const entry of manifest.assets) {
    const source = await readFile(join(directory, entry.fileName));
    assert.ok(source.length < MAX_VEHICLE_BYTES, entry.fileName);
    assert.equal(source.length, entry.bytes);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    assert.equal(sha256(source), entry.sha256);
    validateVehiclePayload(source, entry.fileName);
    assert.deepEqual(emitted.find(asset => asset.fileName === entry.url.slice(1)).source, source);
    if (entry.fileName === 'thunder_bug.glb') {
      assert.equal(entry.sourceBytes, 28914440);
      assert.equal(entry.bytes, 25452592);
      assert.notEqual(entry.sha256, entry.sourceSha256);
    } else {
      assert.equal(entry.sourceBytes, entry.bytes);
      assert.equal(entry.sourceSha256, entry.sha256);
    }
  }
  assert.equal(getVehicleModelAsset('race_car2.glb').fileName, 'race_car.glb');
  assert.equal(emitted.length, 5);
});

test('release: cada payload mantém autor, título, fonte, licença, adaptações e referência aos avisos', async () => {
  const manifest = await readVehicleManifest(root);
  const notices = await readFile(join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  const expected = [
    ['Chenchanchong', 'race car', 'race-car-97768c0e69744cd5922ddc5a9fd59266'],
    ['Tasneem', 'Race Car', 'race-car-517dfa8823394b178c9c313d7e68fb7f'],
    ['Primus03', "Transformers Universe: Drive-By's Vehicle Form", 'transformers-universe-drive-bys-vehicle-form-1eee5b31a3dd46ef9b91a95b9261e7f8'],
    ['jaack', 'Armored car (death race)', 'armored-car-death-race-ea76bac506f04676b8514951b67994f8'],
    ['Brian Trepanier', 'Widowmaker - Death Race 2000', 'widowmaker-death-race-2000-15b6eb31787446879f063bb9b25cbc5c'],
  ];
  const anchors = notices.split('\n').filter(line => line.startsWith('### ')).map(line => line.slice(4)
    .toLowerCase().replace(/[^\p{L}\p{N}_\- ]/gu, '').replaceAll(' ', '-'));
  for (const [index, entry] of manifest.assets.entries()) {
    const [author, title, slug] = expected[index];
    assert.equal(entry.author, author); assert.equal(entry.title, title);
    assert.equal(entry.source, `https://sketchfab.com/3d-models/${slug}`);
    assert.equal(entry.license, 'CC BY 4.0');
    assert.equal(entry.licenseURL, 'https://creativecommons.org/licenses/by/4.0/');
    assert.ok(notices.includes(entry.author)); assert.ok(notices.includes(entry.title));
    assert.ok(notices.includes(entry.source)); assert.ok(notices.includes(entry.licenseURL));
    assert.ok(entry.adaptations.length > 40);
    const [file, anchor] = entry.notice.split('#');
    assert.equal(file, 'THIRD_PARTY_NOTICES.md');
    assert.ok(anchors.includes(anchor), entry.notice);
    assert.match(entry.sourceSha256, /^[a-f0-9]{64}$/);
  }
});

function syntheticGlb(label) {
  const text = Buffer.from(JSON.stringify({ asset: { version: '2.0', generator: label } }));
  const source = Buffer.alloc(20 + Math.ceil(text.length / 4) * 4, 32);
  source.writeUInt32LE(0x46546c67, 0); source.writeUInt32LE(2, 4);
  source.writeUInt32LE(source.length, 8); source.writeUInt32LE(source.length - 20, 12);
  source.writeUInt32LE(0x4e4f534a, 16); text.copy(source, 20);
  return source;
}

async function preparationFixture(t) {
  const base = join(root, 'test-results');
  await mkdir(base, { recursive: true });
  const temporary = await mkdtemp(join(base, 'release-assets-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const sources = join(temporary, 'referencias-locais', 'Vehicles');
  const destination = join(temporary, 'assets', 'vehicles');
  await mkdir(sources, { recursive: true }); await mkdir(destination, { recursive: true });
  const originals = new Map();
  for (const asset of VEHICLE_MODEL_ASSETS) {
    const bytes = syntheticGlb(asset.fileName); originals.set(asset.fileName, bytes);
    await writeFile(join(sources, asset.fileName), bytes);
  }
  // A private unapproved directory cannot be read as a GLB. Its presence must
  // not affect preparation, which reads fixed names instead of walking refs.
  await mkdir(join(sources, 'old_buggy.glb'));
  await writeFile(join(destination, 'manifest.json'), '{}\n');
  return { temporary, sources, destination, originals };
}

test('preparação explícita: lê cinco fontes fixas, otimiza somente Thunder e preserva originais', async t => {
  const { temporary, sources, destination, originals } = await preparationFixture(t);
  const derived = syntheticGlb('lossless-fixture-thunder');
  let calls = 0;
  const manifest = await prepareVehicleAssets({ root: temporary, optimizeThunder(source) {
    calls++;
    assert.deepEqual(source, originals.get('thunder_bug.glb'));
    return { output: derived };
  } });
  assert.equal(calls, 1);
  assert.deepEqual(await readVehicleManifest(temporary), manifest);
  assert.deepEqual((await readdir(destination)).sort(), ['manifest.json', ...originals.keys()].sort());
  for (const entry of manifest.assets) {
    const original = originals.get(entry.fileName);
    assert.deepEqual(await readFile(join(sources, entry.fileName)), original);
    const output = await readFile(join(destination, entry.fileName));
    assert.deepEqual(output, entry.fileName === 'thunder_bug.glb' ? derived : original);
    assert.equal(entry.sha256, sha256(output)); assert.equal(entry.bytes, output.length);
    assert.equal(entry.sourceSha256, sha256(original)); assert.equal(entry.sourceBytes, original.length);
  }
});

test('preparação inválida não publica manifesto nem copia originais como fallback', async t => {
  const { temporary, sources, destination, originals } = await preparationFixture(t);
  await assert.rejects(prepareVehicleAssets({ root: temporary, optimizeThunder: () => ({ output: Buffer.from('invalid') }) }), /cabeçalho GLB inválido/);
  assert.deepEqual(await readdir(destination), ['manifest.json']);
  assert.equal(await readFile(join(destination, 'manifest.json'), 'utf8'), '{}\n');
  for (const [name, bytes] of originals) assert.deepEqual(await readFile(join(sources, name)), bytes);
});
