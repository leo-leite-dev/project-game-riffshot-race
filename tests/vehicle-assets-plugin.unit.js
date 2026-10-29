import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, symlink, truncate } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, request } from 'node:http';
import { MAX_VEHICLE_BYTES, vehicleAssetsPlugin } from '../scripts/vehicleAssetsPlugin.js';
import { VEHICLE_MODEL_ASSETS } from '../src/visuals/vehicles/vehicleModels.js';

function glb(json = { asset: { version: '2.0' } }) {
  const text = Buffer.from(JSON.stringify(json));
  const source = Buffer.alloc(20 + Math.ceil(text.length / 4) * 4, 32);
  source.writeUInt32LE(0x46546c67, 0); source.writeUInt32LE(2, 4);
  source.writeUInt32LE(source.length, 8); source.writeUInt32LE(source.length - 20, 12);
  source.writeUInt32LE(0x4e4f534a, 16); text.copy(source, 20);
  return source;
}

const sha256 = source => createHash('sha256').update(source).digest('hex');

async function fixture(t) {
  const base = fileURLToPath(new URL('../test-results/', import.meta.url));
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'vehicle-assets-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'assets', 'vehicles');
  await mkdir(directory, { recursive: true });
  const sources = new Map(), manifest = { version: 1, assets: [] };
  for (const asset of VEHICLE_MODEL_ASSETS) {
    const source = glb({ asset: { version: '2.0', generator: asset.fileName } });
    sources.set(asset.fileName, source);
    await writeFile(join(directory, asset.fileName), source);
    manifest.assets.push({ ...asset, bytes: source.length, sha256: sha256(source), author: 'Fixture', title: asset.fileName,
      source: 'https://example.test/model', license: 'CC BY 4.0', licenseURL: 'https://creativecommons.org/licenses/by/4.0/',
      adaptations: 'Fixture sem geometria.', notice: 'THIRD_PARTY_NOTICES.md' });
  }
  const saveManifest = () => writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
  await saveManifest();
  await writeFile(join(directory, 'private.glb'), 'NEVER PUBLISH');
  const plugin = vehicleAssetsPlugin();
  plugin.configResolved({ root });
  return { root, directory, plugin, manifest, saveManifest, sources };
}

async function server(t, plugin, preview = false) {
  let middleware;
  const configure = preview ? plugin.configurePreviewServer : plugin.configureServer;
  configure({ middlewares: { use(handler) { middleware = handler; } } });
  const http = createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end(); }));
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { http.close(resolve); http.closeAllConnections(); }));
  return (path, method = 'GET') => new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: http.address().port, path, method }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject); req.end();
  });
}

async function rejectsBundle(plugin, pattern) {
  const emitted = [];
  await assert.rejects(plugin.generateBundle.call({ emitFile: asset => emitted.push(asset) }), pattern);
  assert.equal(emitted.length, 0, 'nenhuma emissão parcial em pacote inválido');
}

test('rota oficial serve GET/HEAD dos cinco GLBs curados com bytes e headers corretos', async t => {
  const { plugin, sources } = await fixture(t), send = await server(t, plugin);
  for (const asset of VEHICLE_MODEL_ASSETS) for (const method of ['GET', 'HEAD']) {
    const response = await send(asset.url, method);
    assert.equal(response.status, 200);
    assert.equal(response.headers['content-type'], 'model/gltf-binary');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['cache-control'], 'no-cache');
    const expected = sources.get(asset.fileName);
    assert.equal(response.headers['content-length'], String(expected.length));
    assert.deepEqual(response.body, method === 'GET' ? expected : Buffer.alloc(0));
  }
});

test('rota bloqueia métodos, queries, decode/traversal e nomes fora da allowlist em dev e preview', async t => {
  const { plugin } = await fixture(t);
  for (const preview of [false, true]) {
    const send = await server(t, plugin, preview);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const response = await send('/models/vehicles/camaro.glb', method);
      assert.equal(response.status, 405);
      assert.equal(response.headers.allow, 'GET, HEAD');
      assert.equal(response.body.length, 0);
    }
    for (const url of [
      '/models/vehicles/', '/models/vehicles/private.glb', '/models/vehicles/race_car2.glb',
      '/models/vehicles/camaro.glb?raw', '/models/vehicles/camaro.glb?url',
      '/models/vehicles/../private.glb', '/models/vehicles/%2e%2e/private.glb',
      '/models/vehicles/%252e%252e/private.glb', '/models%2fvehicles/camaro.glb',
      '/models/vehicles/%63amaro.glb', '/models/vehicles/camaro.glb/extra',
      '/models/vehicles/%ZZ', '/models/vehicles/..%5cprivate.glb',
    ]) {
      const response = await send(url);
      assert.equal(response.status, 404, url);
      assert.equal(response.body.length, 0, url);
    }
  }
});

test('arquivo ausente, diretório e junction redirecionada falham sem vazar bytes/caminhos', async t => {
  const { plugin, directory, root } = await fixture(t), send = await server(t, plugin);
  const file = join(directory, 'camaro.glb');
  await rm(file);
  assert.equal((await send('/models/vehicles/camaro.glb')).status, 404);
  await mkdir(file);
  assert.equal((await send('/models/vehicles/camaro.glb')).body.length, 0);
  const outside = join(root, 'outside');
  await mkdir(outside);
  await writeFile(join(outside, 'camaro.glb'), 'private redirected bytes');
  await rm(directory, { recursive: true });
  await symlink(outside, directory, process.platform === 'win32' ? 'junction' : 'dir');
  const response = await send('/models/vehicles/camaro.glb');
  assert.equal(response.status, 404);
  assert.equal(response.body.length, 0);
  await rejectsBundle(plugin, /assets\/vehicles\/manifest.json: diretório redirecionado/);
});

test('emissão publica exatamente cinco binários sem derivar Thunder ou duplicar alias; preserva deny', async t => {
  const { plugin, sources } = await fixture(t), emitted = [];
  await plugin.generateBundle.call({ emitFile: asset => emitted.push(asset) });
  assert.deepEqual(emitted.map(asset => asset.fileName), VEHICLE_MODEL_ASSETS.map(asset => asset.url.slice(1)));
  for (const asset of emitted) {
    assert.equal(asset.type, 'asset');
    assert.deepEqual(asset.source, sources.get(asset.fileName.split('/').at(-1)));
    assert.ok(!asset.source.includes('NEVER PUBLISH'));
  }
  const config = plugin.config({ server: { fs: { deny: ['**/private/**'] } } });
  for (const rule of ['.env', '.env.*', '**/.git/**', '**/private/**', '**/referencias-locais/**']) {
    assert.ok(config.server.fs.deny.includes(rule));
  }
});

test('manifesto ausente ou inválido impede build e dev mesmo havendo referências privadas', async t => {
  const { root, plugin, directory, manifest, saveManifest, sources } = await fixture(t);
  const references = join(root, 'referencias-locais', 'Vehicles');
  await mkdir(references, { recursive: true });
  for (const [name, bytes] of sources) await writeFile(join(references, name), bytes);
  const send = await server(t, plugin);
  await rm(join(directory, 'manifest.json'));
  await rejectsBundle(plugin, /manifest.json: arquivo ausente ou indisponível/);
  assert.equal((await send('/models/vehicles/camaro.glb')).status, 404);
  await writeFile(join(directory, 'manifest.json'), '{bad');
  await rejectsBundle(plugin, /manifest.json: JSON inválido/);
  const entry = manifest.assets[0];
  for (const changes of [{ sha256: 'abc' }, { fileName: '../private.glb' }, { author: '' }, { bytes: MAX_VEHICLE_BYTES }]) {
    manifest.assets[0] = { ...entry, ...changes };
    await saveManifest();
    await rejectsBundle(plugin, /manifest.json: entrada/);
  }
  manifest.assets[0] = manifest.assets[1];
  await saveManifest();
  await rejectsBundle(plugin, /manifest.json: entrada/);
  manifest.assets.pop();
  await saveManifest();
  await rejectsBundle(plugin, /esperados exatamente cinco assets/);
});

test('SHA-256, tamanho e limite estrito de 25 MiB são verificados em dev e emissão', async t => {
  const { plugin, directory, manifest, sources, saveManifest } = await fixture(t);
  const entry = manifest.assets.at(-1), path = join(directory, entry.fileName);
  const send = await server(t, plugin);
  const changed = Buffer.from(sources.get(entry.fileName));
  changed[changed.length - 1] ^= 1;
  await writeFile(path, changed);
  await rejectsBundle(plugin, /SHA-256 diferente do manifesto/);
  assert.equal((await send(entry.url)).status, 404);
  await writeFile(path, Buffer.concat([changed, Buffer.alloc(4)]));
  await rejectsBundle(plugin, /tamanho diferente do manifesto/);
  assert.equal((await send(entry.url, 'HEAD')).status, 404);
  await truncate(path, MAX_VEHICLE_BYTES);
  await rejectsBundle(plugin, /tipo ou tamanho não permitido/);
  entry.bytes = MAX_VEHICLE_BYTES;
  await saveManifest();
  await rejectsBundle(plugin, /manifest.json: entrada/);
});

test('GLB inválido ou com recursos externos é rejeitado mesmo com hash correto', async t => {
  const { plugin, directory, manifest, saveManifest } = await fixture(t);
  const entry = manifest.assets[0];
  const wrongHeader = glb(); wrongHeader.writeUInt32LE(1, 4);
  const wrongChunk = glb(); wrongChunk.writeUInt32LE(wrongChunk.length, 12);
  for (const [source, pattern] of [
    [wrongHeader, /cabeçalho GLB inválido/], [wrongChunk, /chunk JSON inválido/],
    [glb({ asset: { version: '2.0' }, buffers: [{ uri: 'private.bin' }] }), /recursos externos bloqueados/],
    [glb({ asset: { version: '2.0' }, images: [{ uri: 'https://example.test/private.png' }] }), /recursos externos bloqueados/],
  ]) {
    await writeFile(join(directory, entry.fileName), source);
    entry.bytes = source.length; entry.sha256 = sha256(source);
    await saveManifest();
    await rejectsBundle(plugin, pattern);
  }
});

test('links de payload, manifesto e pasta assets são bloqueados antes da abertura fora do pacote', async t => {
  for (const target of ['camaro.glb', 'manifest.json', 'assets']) {
    const { root, directory, plugin } = await fixture(t);
    const outside = join(root, 'private-target');
    await mkdir(outside);
    await writeFile(join(outside, 'private.glb'), 'PRIVATE CONTENT MUST NOT LEAK');
    const path = target === 'assets' ? join(root, 'assets') : join(directory, target);
    await rm(path, { recursive: true });
    // Directory junctions also work without Windows symlink privileges, and
    // must be rejected even when named like an approved file or manifest.
    await symlink(outside, path, process.platform === 'win32' ? 'junction' : 'dir');
    const send = await server(t, plugin);
    const response = await send('/models/vehicles/camaro.glb');
    assert.equal(response.status, 404);
    assert.equal(response.body.length, 0);
    await rejectsBundle(plugin, /(?:arquivo|diretório) redirecionado/);
  }
});
