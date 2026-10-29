import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { VEHICLE_MODEL_ASSETS } from '../src/visuals/vehicles/vehicleModels.ts';

type VehicleAsset = (typeof VEHICLE_MODEL_ASSETS)[number];
type ManifestEntry = { fileName: string; url: string; bytes: number; sha256: string } & Record<string, unknown>;
type Manifest = { version: 1; assets: ManifestEntry[] };
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const urls = new Map<string, VehicleAsset>(VEHICLE_MODEL_ASSETS.map(asset => [asset.url, asset]));
const deny = ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**'];
export const MAX_VEHICLE_BYTES = 25 * 1024 * 1024;

function invalid(fileName: string, reason: string) {
  // Never include filesystem errors, absolute paths or private source metadata.
  return new Error(`assets/vehicles/${fileName}: ${reason}. Execute a preparação explícita dos assets antes do build.`);
}

async function readApproved(root: string, fileName: string, limit: number) {
  let file;
  try {
    let directory = await realpath(root);
    for (const part of ['assets', 'vehicles']) {
      const expected = join(directory, part);
      if (await realpath(expected) !== expected) throw invalid(fileName, 'diretório redirecionado');
      directory = expected;
    }
    const expected = join(directory, fileName);
    if (await realpath(expected) !== expected) throw invalid(fileName, 'arquivo redirecionado');
    file = await open(expected, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stats = await file.stat();
    if (!stats.isFile() || stats.size >= limit) throw invalid(fileName, 'tipo ou tamanho não permitido');
    const source = await file.readFile();
    if (source.length !== stats.size || source.length >= limit) throw invalid(fileName, 'tamanho inconsistente');
    return source;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`assets/vehicles/${fileName}:`)) throw error;
    throw invalid(fileName, 'arquivo ausente ou indisponível');
  } finally { await file?.close(); }
}

// Only container integrity and embedded-resource policy: no geometry processing,
// image decoding, Three.js or optimizer is loaded by normal dev/build.
export function validateVehiclePayload(source: Buffer, fileName: string) {
  if (source.length >= MAX_VEHICLE_BYTES) throw invalid(fileName, 'deve ser menor que 25 MiB');
  if (source.length < 20 || source.readUInt32LE(0) !== 0x46546c67
    || source.readUInt32LE(4) !== 2 || source.readUInt32LE(8) !== source.length
    || source.readUInt32LE(16) !== 0x4e4f534a) throw invalid(fileName, 'cabeçalho GLB inválido');
  const jsonLength = source.readUInt32LE(12);
  if (jsonLength % 4 || jsonLength > source.length - 20) throw invalid(fileName, 'chunk JSON inválido');
  let json: unknown;
  try { json = JSON.parse(source.toString('utf8', 20, 20 + jsonLength)); }
  catch { throw invalid(fileName, 'JSON GLB inválido'); }
  if (!isRecord(json) || !isRecord(json.asset) || json.asset.version !== '2.0') throw invalid(fileName, 'versão glTF inválida');
  if ((json.buffers != null && !Array.isArray(json.buffers)) || (json.images != null && !Array.isArray(json.images))) throw invalid(fileName, 'recursos inválidos');
  const embedded: unknown[] = [...(json.buffers ?? []), ...(json.images ?? [])];
  if (embedded.some(item => !isRecord(item) || Object.hasOwn(item, 'uri'))) throw invalid(fileName, 'recursos externos bloqueados');
  for (let offset = 20 + jsonLength; offset < source.length;) {
    if (offset + 8 > source.length) throw invalid(fileName, 'chunk GLB incompleto');
    const length = source.readUInt32LE(offset);
    if (length % 4 || offset + 8 + length > source.length
      || source.readUInt32LE(offset + 4) !== 0x004e4942) throw invalid(fileName, 'chunk binário inválido');
    offset += 8 + length;
  }
}

export async function readVehicleManifest(root: string): Promise<Manifest> {
  const source = await readApproved(root, 'manifest.json', 128 * 1024);
  let manifest: unknown;
  try { manifest = JSON.parse(source.toString('utf8')); }
  catch { throw invalid('manifest.json', 'JSON inválido'); }
  if (!isRecord(manifest) || manifest.version !== 1 || !Array.isArray(manifest.assets)
    || manifest.assets.length !== VEHICLE_MODEL_ASSETS.length) throw invalid('manifest.json', 'esperados exatamente cinco assets');
  const names = new Set<string>();
  for (const entry of manifest.assets as unknown[]) {
    if (!isRecord(entry)) throw invalid('manifest.json', 'entrada, atribuição, tamanho ou SHA-256 inválido');
    const asset = VEHICLE_MODEL_ASSETS.find(item => item.fileName === entry.fileName);
    if (!asset || typeof entry.fileName !== 'string' || names.has(entry.fileName) || entry.url !== asset.url
      || typeof entry.bytes !== 'number' || !Number.isSafeInteger(entry.bytes) || entry.bytes < 20 || entry.bytes >= MAX_VEHICLE_BYTES
      || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)
      || ['author', 'title', 'source', 'license', 'licenseURL', 'adaptations', 'notice']
        .some(key => typeof entry[key] !== 'string' || !(entry[key] as string).trim())) throw invalid('manifest.json', 'entrada, atribuição, tamanho ou SHA-256 inválido');
    names.add(entry.fileName);
  }
  return manifest as Manifest;
}

async function loadAsset(root: string, entry: ManifestEntry | undefined) {
  if (!entry) throw invalid('manifest.json', 'asset ausente');
  const source = await readApproved(root, entry.fileName, MAX_VEHICLE_BYTES);
  if (source.length !== entry.bytes) throw invalid(entry.fileName, 'tamanho diferente do manifesto');
  if (createHash('sha256').update(source).digest('hex') !== entry.sha256) throw invalid(entry.fileName, 'SHA-256 diferente do manifesto');
  validateVehiclePayload(source, entry.fileName);
  return source;
}

function reject(response: ServerResponse, status = 404) {
  response.statusCode = status;
  response.end();
}

// Reject encoded/normalized variants rather than decoding them into a file path.
// The only path ever passed to fs comes from the static allowlist above.
function guard(request: IncomingMessage, response: ServerResponse) {
  const raw = request.url ?? '';
  let decoded;
  try { decoded = decodeURIComponent(raw); } catch { decoded = raw; }
  const relevant = [raw, decoded].some(value => value.replaceAll('\\', '/').startsWith('/models/vehicles'));
  if (!relevant) return undefined;
  const asset = urls.get(raw);
  response.setHeader('Cache-Control', 'no-cache');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (!asset) { reject(response); return null; }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    reject(response, 405);
    return null;
  }
  return asset;
}

async function streamAsset(request: IncomingMessage, response: ServerResponse, root: string, asset: VehicleAsset) {
  try {
    const manifest = await readVehicleManifest(root);
    const source = await loadAsset(root, manifest.assets.find(entry => entry.fileName === asset.fileName));
    if (response.destroyed) return;
    response.setHeader('Content-Type', 'model/gltf-binary');
    response.setHeader('Content-Length', source.length);
    response.end(request.method === 'HEAD' ? undefined : source);
  } catch {
    if (!response.headersSent && !response.destroyed) {
      response.removeHeader('Content-Length');
      response.removeHeader('Content-Type');
      reject(response);
    } else if (!response.destroyed) response.destroy();
  }
}

export function vehicleAssetsPlugin(): Plugin {
  let root: string;
  return {
    name: 'approved-vehicle-assets',
    config(config) {
      return { server: { fs: { deny: [...new Set([
        ...deny, ...(config.server?.fs?.deny ?? []), '**/referencias-locais/**',
      ])] } } };
    },
    configResolved(config) { root = resolve(config.root); },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const asset = guard(request, response);
        if (asset === undefined) next();
        else if (asset) void streamAsset(request, response, root, asset);
      });
    },
    configurePreviewServer(server) {
      // Preview serves emitted assets, never the private originals. Apply the
      // same URL/method policy before Vite's static-file/SPA middleware.
      server.middlewares.use((request, response, next) => {
        if (guard(request, response) !== null) next();
      });
    },
    async generateBundle() {
      const manifest = await readVehicleManifest(root);
      // Validate the entire curated package before publishing any payload.
      const sources = [];
      for (const asset of VEHICLE_MODEL_ASSETS) {
        sources.push(await loadAsset(root, manifest.assets.find(entry => entry.fileName === asset.fileName)));
      }
      for (const [index, asset] of VEHICLE_MODEL_ASSETS.entries()) {
        this.emitFile({ type: 'asset', fileName: asset.url.slice(1), source: sources[index] });
      }
    },
  };
}
