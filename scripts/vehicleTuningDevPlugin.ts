import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEnv, type Plugin } from 'vite';
import { VEHICLE_TUNING_FIELDS, VEHICLE_TUNING_IDS } from '../src/data/vehicleTuningSchema.ts';

const API = '/__riffshot_dev/vehicle-tuning';
const BODY_LIMIT = 16 * 1024;
const SESSION_MS = 15 * 60 * 1000;
const LOCAL_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
type VehicleTuningInput = Record<string, Record<string, unknown>>;
type VehicleTuningOutput = Record<string, Record<string, number>>;
type Session = { expiresAt: number };

export function validateVehicleTuning(input: unknown): VehicleTuningOutput | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const root = input as VehicleTuningInput;
  if (Object.keys(root).length !== VEHICLE_TUNING_IDS.length
    || !VEHICLE_TUNING_IDS.every(id => Object.hasOwn(root, id))) return null;
  const output: VehicleTuningOutput = {};
  for (const id of VEHICLE_TUNING_IDS) {
    const record = root[id];
    if (!record || typeof record !== 'object' || Array.isArray(record)
      || Object.keys(record).length !== VEHICLE_TUNING_FIELDS.length
      || !VEHICLE_TUNING_FIELDS.every(field => Object.hasOwn(record, field))) return null;
    const stats: Record<string, number> = {};
    for (const field of VEHICLE_TUNING_FIELDS) {
      const value = record[field];
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 100) return null;
      stats[field] = value;
    }
    output[id] = stats;
  }
  return output;
}

export interface VehicleTuningDevPluginOptions { password?: string }

function passwordMatches(provided: string, expected: string): boolean {
  const actualHash = createHash('sha256').update(provided, 'utf8').digest();
  const expectedHash = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(actualHash, expectedHash);
}

function json(response: ServerResponse, status: number, data: unknown): void {
  const body = Buffer.from(JSON.stringify(data));
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Length', body.byteLength);
  response.end(body);
}

async function body(request: IncomingMessage): Promise<unknown> {
  const length = Number(request.headers['content-length'] ?? 0);
  if (Number.isFinite(length) && length > BODY_LIMIT) throw new RangeError('body-too-large');
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += bytes.byteLength;
    if (received > BODY_LIMIT) throw new RangeError('body-too-large');
    chunks.push(bytes);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new SyntaxError('invalid-json'); }
}

/** Local Vite server only; the plugin is absent from production builds. */
export function vehicleTuningDevPlugin(options: VehicleTuningDevPluginOptions = {}): Plugin {
  let filePath = '';
  let password = '';
  const sessions = new Map<string, Session>();
  return {
    name: 'local-vehicle-tuning-editor',
    apply: 'serve',
    configResolved(config) {
      filePath = resolve(config.root, 'src/data/vehicleTuning.json');
      password = options.password ?? loadEnv(config.mode, config.root, 'RIFFSHOT_').RIFFSHOT_DEV_MODE_PASSWORD ?? '';
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith(`${API}/`)) { next(); return; }
        void (async () => {
          const address = request.socket.remoteAddress;
          if (!address || !LOCAL_ADDRESSES.has(address)) { json(response, 403, { error: 'local-only' }); return; }
          const origin = request.headers.origin;
          if (origin) {
            if (origin !== `http://${request.headers.host}`) { json(response, 403, { error: 'origin-denied' }); return; }
          }
          const route = request.url!.slice(API.length).split('?')[0];
          if (route === '/auth' && request.method === 'POST') {
            if (!password) { json(response, 503, { error: 'password-not-configured' }); return; }
            const input = await body(request) as { password?: unknown };
            if (typeof input.password !== 'string' || !passwordMatches(input.password, password)) {
              json(response, 401, { error: 'invalid-password' }); return;
            }
            const token = randomBytes(32).toString('hex');
            sessions.set(token, { expiresAt: Date.now() + SESSION_MS });
            const stats = validateVehicleTuning(JSON.parse(await readFile(filePath, 'utf8')));
            if (!stats) { json(response, 500, { error: 'invalid-config' }); return; }
            json(response, 200, { token, vehicles: stats });
            return;
          }
          const authorization = request.headers.authorization ?? '';
          const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
          const session = sessions.get(token);
          if (!session || session.expiresAt < Date.now()) {
            sessions.delete(token);
            json(response, 401, { error: 'session-expired' }); return;
          }
          session.expiresAt = Date.now() + SESSION_MS;
          if (route === '/logout' && request.method === 'POST') {
            sessions.delete(token);
            json(response, 200, { loggedOut: true });
            return;
          }
          if (route === '/save' && request.method === 'POST') {
            const input = await body(request) as { vehicles?: unknown };
            const tuning = validateVehicleTuning(input.vehicles);
            if (!tuning) { json(response, 400, { error: 'invalid-values' }); return; }
            const temporary = `${filePath}.${randomBytes(8).toString('hex')}.tmp`;
            try {
              await writeFile(temporary, `${JSON.stringify(tuning, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
              await rename(temporary, filePath);
            } finally { await rm(temporary, { force: true }); }
            // Force the browser to recreate catalog modules from the versioned
            // JSON after the successful response (Vite also watches this file).
            response.once('finish', () => server.ws.send({ type: 'full-reload', path: '*' }));
            json(response, 200, { saved: true });
            return;
          }
          json(response, 404, { error: 'not-found' });
        })().catch(() => {
          if (!response.headersSent) json(response, 500, { error: 'local-editor-failed' });
          else response.destroy();
        });
      });
    },
  };
}
