import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { validateVehicleTuning, vehicleTuningDevPlugin } from '../scripts/vehicleTuningDevPlugin.ts';
import { VEHICLE_TUNING, VEHICLE_TUNING_FIELDS, VEHICLE_TUNING_IDS } from '../src/data/vehicles.ts';

type Middleware = (request: IncomingMessage, response: ServerResponse, next: (error?: Error) => void) => void;
type EditableTuning = { [id in (typeof VEHICLE_TUNING_IDS)[number]]: Record<(typeof VEHICLE_TUNING_FIELDS)[number], number> };
const editableTuning = (): EditableTuning => JSON.parse(JSON.stringify(VEHICLE_TUNING)) as EditableTuning;

function middleware(password: string | undefined, root: string) {
  const plugin = vehicleTuningDevPlugin(password === undefined ? {} : { password }) as unknown as {
    configResolved(config: { root: string; mode: string }): void;
    configureServer(server: { middlewares: { use(handler: Middleware): void }; ws: { send(message: unknown): void } }): void;
    apply?: string;
  };
  plugin.configResolved({ root, mode: 'test' });
  let handle: Middleware | undefined;
  const messages: unknown[] = [];
  plugin.configureServer({ middlewares: { use: handler => { handle = handler; } }, ws: { send: message => messages.push(message) } });
  if (!handle) throw new Error('Middleware local não foi instalado');
  const server = createServer((request, response) => handle!(request, response,
    () => { response.statusCode = 404; response.end(); }));
  return { plugin, server, messages };
}

test('validador aceita somente cinco veículos e os nove atributos inteiros de 0 a 100', () => {
  assert.ok(validateVehicleTuning(VEHICLE_TUNING));
  const copy = editableTuning();
  copy['rift-blaze'].tires = 101;
  assert.equal(validateVehicleTuning(copy), null);
  const fractional = editableTuning();
  fractional['volt-vector'].speed = 55.5;
  assert.equal(validateVehicleTuning(fractional), null);
  const missingVehicle = editableTuning() as unknown as Record<string, unknown>;
  delete missingVehicle.widowmaker;
  assert.equal(validateVehicleTuning(missingVehicle), null);
  const extraField = editableTuning() as unknown as Record<string, Record<string, number>>;
  extraField['rift-blaze'].unlisted = 50;
  assert.equal(validateVehicleTuning(extraField), null);
});

test('modo local: senha/server guardam sessão, rejeitam origem e dados inválidos, salvam somente JSON fixo e revogam token', async t => {
  const root = await mkdtemp(join(tmpdir(), 'riffshot-vehicle-tuning-'));
  const dataDirectory = join(root, 'src', 'data');
  await mkdir(dataDirectory, { recursive: true });
  const configPath = join(dataDirectory, 'vehicleTuning.json');
  await writeFile(configPath, `${JSON.stringify(VEHICLE_TUNING, null, 2)}\n`, 'utf8');
  const { plugin, server, messages } = middleware('test-password-only', root);
  assert.equal(plugin.apply, 'serve', 'plugin de gravação não é executado no build');
  t.after(async () => {
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Porta local indisponível');
  const base = `http://127.0.0.1:${address.port}/__riffshot_dev/vehicle-tuning`;
  const origin = `http://127.0.0.1:${address.port}`;
  const post = (path: string, body: unknown, token?: string, requestOrigin = origin) => fetch(`${base}/${path}`, {
    method: 'POST', headers: { Origin: requestOrigin, 'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
  });
  const wrongPassword = await post('auth', { password: 'not-the-fixture-password' });
  assert.equal(wrongPassword.status, 401);
  const foreignOrigin = await post('auth', { password: 'test-password-only' }, undefined, 'https://attacker.invalid');
  assert.equal(foreignOrigin.status, 403);
  const authorized = await post('auth', { password: 'test-password-only' });
  assert.equal(authorized.status, 200);
  const session = await authorized.json() as { token: string; vehicles: unknown; password?: string };
  assert.ok(session.token.length >= 64);
  assert.equal(Object.hasOwn(session, 'password'), false);
  assert.ok(validateVehicleTuning(session.vehicles));
  const before = await readFile(configPath, 'utf8');
  const invalid = editableTuning();
  invalid.widowmaker.suspension = -1;
  const invalidSave = await post('save', { vehicles: invalid }, session.token);
  assert.equal(invalidSave.status, 400);
  assert.equal(await readFile(configPath, 'utf8'), before, 'entrada rejeitada não pode alterar o arquivo');
  const updated = editableTuning();
  updated['volt-vector'].tires = 91;
  updated['volt-vector'].suspension = 73;
  const saved = await post('save', { vehicles: updated }, session.token);
  assert.equal(saved.status, 200);
  assert.deepEqual(JSON.parse(await readFile(configPath, 'utf8')), updated);
  assert.deepEqual(messages, [{ type: 'full-reload', path: '*' }], 'salvar manda o Vite recarregar o catálogo ativo');
  const logout = await post('logout', {}, session.token);
  assert.equal(logout.status, 200);
  assert.equal((await post('save', { vehicles: updated }, session.token)).status, 401);
  // Verify the fixed path changes inside only the temporary checkout fixture.
  assert.deepEqual(JSON.parse(await readFile(new URL('../src/data/vehicleTuning.json', import.meta.url), 'utf8')),
    VEHICLE_TUNING, 'o plugin de teste nunca grava na cópia real do projeto');
});

test('configuração local: plugin lê a senha exclusivamente do .env.local e autentica sem devolvê-la', async t => {
  const root = await mkdtemp(join(tmpdir(), 'riffshot-dev-env-'));
  await mkdir(join(root, 'src', 'data'), { recursive: true });
  await writeFile(join(root, 'src', 'data', 'vehicleTuning.json'), `${JSON.stringify(VEHICLE_TUNING, null, 2)}\n`, 'utf8');
  await writeFile(join(root, '.env.local'), 'RIFFSHOT_DEV_MODE_PASSWORD=local-unit-only\n', 'utf8');
  const { server } = middleware(undefined, root);
  t.after(async () => {
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Porta local indisponível');
  const origin = `http://127.0.0.1:${address.port}`;
  const response = await fetch(`${origin}/__riffshot_dev/vehicle-tuning/auth`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'local-unit-only' }),
  });
  assert.equal(response.status, 200);
  const payload = await response.json() as Record<string, unknown>;
  assert.equal(Object.hasOwn(payload, 'password'), false, 'senha não volta ao navegador');
});
