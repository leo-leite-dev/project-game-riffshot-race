import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { createServer as createHttpServer, request, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createServer as createViteServer, resolveConfig } from 'vite';
import { localRiftBlazePlugin, RIFT_BLAZE_URL } from '../scripts/localRiftBlazePlugin.ts';
import type { Plugin } from 'vite';

// Only synthetic bytes are used; the project's local assets are never opened.
const payload = Buffer.from('synthetic model fixture');

type Response = { status: number | undefined; headers: IncomingMessage['headers']; body: Buffer };

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'rift-route-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const vehicles = join(root, 'referencias-locais', 'Vehicles');
  await mkdir(vehicles, { recursive: true });
  const model = join(vehicles, 'sci_-_fi_buggy.glb');
  await writeFile(model, payload);
  return { root, vehicles, model };
}

async function listen(t: TestContext, handler: (req: IncomingMessage, res: ServerResponse) => void) {
  const server = createHttpServer(handler);
  await new Promise<void>((resolve, reject) => server.listen({ port: 0, host: '127.0.0.1' }, () => resolve()));
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  return server;
}

function send(server: ReturnType<typeof createHttpServer>, path = RIFT_BLAZE_URL, method = 'GET'): Promise<Response> {
  return new Promise((resolve, reject) => {
    const address = server.address();
    if (!address || typeof address === 'string') return reject(new Error('endereço HTTP ausente'));
    const req = request({ host: '127.0.0.1', port: (address as AddressInfo).port, path, method }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function routeServer(t: TestContext, root: string) {
  const plugin = localRiftBlazePlugin();
  if (typeof plugin.configResolved !== 'function' || typeof plugin.configureServer !== 'function') throw new TypeError('hook ausente');
  plugin.configResolved.call({} as never, { root } as never);
  let middleware: ((req: IncomingMessage, res: ServerResponse, next: () => void) => void) | undefined;
  plugin.configureServer.call({} as never, { middlewares: { use(handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) { middleware = handler; } } } as never);
  return listen(t, (req, res) => {
    if (!middleware) throw new Error('middleware ausente');
    middleware(req, res, () => {
    res.statusCode = 404;
    res.end();
    });
  });
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

async function linkOrSkip(t: TestContext, target: string, path: string, type: string): Promise<boolean> {
  try {
    await symlink(target, path, type);
    return true;
  } catch (error: unknown) {
    if (!(error instanceof Error) || !('code' in error) || !['EPERM', 'EACCES'].includes(error.code as string)) throw error;
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
  t.mock.method(Readable.prototype, 'pipe', function (this: Readable, ...args: Parameters<Readable['pipe']>) {
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
  assert.equal(typeof plugin.apply, 'function');
  if (typeof plugin.apply !== 'function' || typeof plugin.config !== 'function') throw new TypeError('hook ausente');
  const environment = (command: 'serve' | 'build', isPreview: boolean) => ({ command, mode: 'test', isPreview });
  assert.equal(plugin.apply({}, environment('serve', false)), true);
  assert.equal(plugin.apply({}, environment('build', false)), false);
  assert.equal(plugin.apply({}, environment('serve', true)), false);
  const config = plugin.config.call({} as never, { server: { host: '127.0.0.1', fs: { deny: ['**/private/**'] } } }, environment('serve', false));
  assert.ok(config && !(config instanceof Promise) && 'server' in config);
  for (const pattern of ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', '**/private/**', '**/referencias-locais/**']) {
    assert.ok(config.server?.fs?.deny?.includes(pattern), pattern);
  }
  assert.equal(config.server?.host, undefined);
  assert.equal(plugin.configurePreviewServer, undefined);
  assert.equal(plugin.generateBundle, undefined);

  for (const environment of [{ command: 'build' }, { command: 'serve', isPreview: true }]) {
    const resolved = await resolveConfig({ configFile: false, plugins: [localRiftBlazePlugin()] }, environment.command as 'build' | 'serve', 'production', 'production', environment.isPreview);
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
     assert.ok(response.status !== undefined && [403, 404].includes(response.status), `${path}: ${response.status}`);
    assert.ok(!response.body.includes(payload));
  }
  const response = await send(server);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, payload);
});
