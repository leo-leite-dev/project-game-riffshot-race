import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { createServer as createHttpServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createServer as createViteServer, resolveConfig } from 'vite';
import { localRiftBlazePlugin, RIFT_BLAZE_URL } from '../scripts/localRiftBlazePlugin.js';

// Only synthetic bytes are used; the project's local assets are never opened.
const payload = Buffer.from('synthetic model fixture');

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'rift-route-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const vehicles = join(root, 'referencias-locais', 'Vehicles');
  await mkdir(vehicles, { recursive: true });
  const model = join(vehicles, 'sci_-_fi_buggy.glb');
  await writeFile(model, payload);
  return { root, vehicles, model };
}

async function listen(t, handler) {
  const server = createHttpServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  return server;
}

function send(server, path = RIFT_BLAZE_URL, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: server.address().port, path, method }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function routeServer(t, root) {
  const plugin = localRiftBlazePlugin();
  plugin.configResolved({ root });
  let middleware;
  plugin.configureServer({ middlewares: { use(handler) { middleware = handler; } } });
  return listen(t, (req, res) => middleware(req, res, () => {
    res.statusCode = 404;
    res.end();
  }));
}

test('GET transmite somente o arquivo fixo; HEAD retorna os mesmos headers sem corpo', async t => {
  const { root } = await fixture(t);
  const server = await routeServer(t, root);
  for (const method of ['GET', 'HEAD']) {
    const response = await send(server, RIFT_BLAZE_URL, method);
    assert.equal(response.status, 200);
    assert.equal(response.headers['content-type'], 'model/gltf-binary');
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['content-length'], String(payload.length));
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.deepEqual(response.body, method === 'GET' ? payload : Buffer.alloc(0));
  }
});

test('métodos diferentes de GET e HEAD recebem 405', async t => {
  const { root } = await fixture(t);
  const server = await routeServer(t, root);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const response = await send(server, RIFT_BLAZE_URL, method);
    assert.equal(response.status, 405);
    assert.equal(response.headers.allow, 'GET, HEAD');
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.body.length, 0);
  }
});

test('não aceita listagem, outros nomes, query strings, codificação ou travessia', async t => {
  const { root } = await fixture(t);
  const server = await routeServer(t, root);
  for (const path of [
    '/__local-models/', '/__local-models/other.glb', `${RIFT_BLAZE_URL}/extra`,
    `${RIFT_BLAZE_URL}?file=other.glb`, `${RIFT_BLAZE_URL}?raw`,
    '/__local-models/../referencias-locais/Vehicles/sci_-_fi_buggy.glb',
    '/__local-models/%2e%2e/Vehicles/sci_-_fi_buggy.glb',
    '/__local-models%2frift-blaze.glb', '/__local-models/./rift-blaze.glb',
  ]) {
    const response = await send(server, path);
    assert.equal(response.status, 404, path);
    assert.equal(response.body.length, 0, path);
  }
});

test('arquivo ausente ou diretório responde 404 vazio sem expor caminhos', async t => {
  const { root, model } = await fixture(t);
  const server = await routeServer(t, root);
  await rm(model);
  for (const method of ['GET', 'HEAD']) {
    const response = await send(server, RIFT_BLAZE_URL, method);
    assert.equal(response.status, 404);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.body.length, 0);
  }
  await mkdir(model);
  assert.equal((await send(server)).status, 404);
});

async function linkOrSkip(t, target, path, type) {
  try {
    await symlink(target, path, type);
    return true;
  } catch (error) {
    if (error.code !== 'EPERM' && error.code !== 'EACCES') throw error;
    t.skip('Sistema não permite criar este tipo de symlink sem privilégios.');
    return false;
  }
}

test('bloqueia arquivo symlink que sai do diretório Vehicles autorizado', async t => {
  const { root, model } = await fixture(t);
  const outside = join(root, 'outside.glb');
  await writeFile(outside, 'private synthetic bytes');
  await rm(model);
  if (!await linkOrSkip(t, outside, model, 'file')) return;
  const server = await routeServer(t, root);
  const response = await send(server);
  assert.equal(response.status, 404);
  assert.equal(response.body.length, 0);
});

test('bloqueia Vehicles redirecionado por symlink/junction para fora', async t => {
  const { root, vehicles } = await fixture(t);
  const outside = join(root, 'outside');
  await mkdir(outside);
  await writeFile(join(outside, 'sci_-_fi_buggy.glb'), 'private synthetic bytes');
  await rm(vehicles, { recursive: true });
  if (!await linkOrSkip(t, outside, vehicles, process.platform === 'win32' ? 'junction' : 'dir')) return;
  const server = await routeServer(t, root);
  assert.equal((await send(server)).status, 404);
});

test('erro de leitura encerra o stream sem rejeição não tratada', async t => {
  const { root } = await fixture(t);
  const original = Readable.prototype.pipe;
  let injected = false;
  // Simulate an I/O failure after opening the fixture, without reading real assets.
  t.mock.method(Readable.prototype, 'pipe', function (...args) {
    if (this.constructor.name === 'ReadStream' && !injected) {
      injected = true;
      queueMicrotask(() => this.destroy(new Error('synthetic read failure')));
    }
    return original.apply(this, args);
  });
  const server = await routeServer(t, root);
  await assert.rejects(send(server), /socket hang up|aborted|ECONNRESET/i);
  assert.equal(injected, true);
});

test('plugin é excluído de build e preview e preserva as regras deny existentes', async () => {
  const plugin = localRiftBlazePlugin();
  assert.equal(plugin.apply({}, { command: 'serve', isPreview: false }), true);
  assert.equal(plugin.apply({}, { command: 'build', isPreview: false }), false);
  assert.equal(plugin.apply({}, { command: 'serve', isPreview: true }), false);
  const config = plugin.config({ server: { host: '127.0.0.1', fs: { deny: ['**/private/**'] } } });
  for (const pattern of ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', '**/private/**', '**/referencias-locais/**']) {
    assert.ok(config.server.fs.deny.includes(pattern), pattern);
  }
  assert.equal(config.server.host, undefined);
  assert.equal(plugin.configurePreviewServer, undefined);
  assert.equal(plugin.generateBundle, undefined);

  for (const environment of [{ command: 'build' }, { command: 'serve', isPreview: true }]) {
    const resolved = await resolveConfig({ configFile: false, plugins: [localRiftBlazePlugin()] }, environment.command, 'production', 'production', environment.isPreview);
    assert.ok(!resolved.plugins.some(entry => entry.name === plugin.name));
  }
});

test('Vite bloqueia URLs públicas, /@fs e imports raw dos arquivos locais; rota fixa continua disponível', async t => {
  const { root, model } = await fixture(t);
  await writeFile(join(root, '.env'), 'SYNTHETIC_SECRET=private');
  const vite = await createViteServer({
    configFile: false,
    root,
    logLevel: 'silent',
    plugins: [localRiftBlazePlugin()],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: '127.0.0.1', middlewareMode: true, watch: null, fs: { deny: ['**/private/**'] } },
  });
  t.after(() => vite.close());
  const server = await listen(t, vite.middlewares);
  assert.equal(vite.config.server.host, '127.0.0.1');
  for (const pattern of ['.env', '.env.*', '**/.git/**', '**/private/**']) {
    assert.ok(vite.config.server.fs.deny.includes(pattern), pattern);
  }
  const publicPath = '/referencias-locais/Vehicles/sci_-_fi_buggy.glb';
  for (const path of [
    publicPath, `${publicPath}?raw`, `${publicPath}?url`,
    `/@fs/${model.replaceAll('\\', '/')}`, '/.env',
    '/referencias-locais/Vehicles/',
  ]) {
    const response = await send(server, path);
    assert.ok([403, 404].includes(response.status), `${path}: ${response.status}`);
    assert.ok(!response.body.includes(payload));
  }
  const response = await send(server);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, payload);
});
