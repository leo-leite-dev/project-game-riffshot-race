import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { pipeline } from 'node:stream';

export const RIFT_BLAZE_URL = '/__local-models/rift-blaze.glb';

// Vite 8 replaces its deny defaults when this option is supplied and does not
// export them publicly. Keep its sensitive-file rules alongside our extra rule.
const VITE_DEFAULT_FS_DENY = [
  '.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}',
  '.npmrc', '.yarnrc.yml', '**/.git/**',
];

function notFound(response) {
  response.statusCode = 404;
  response.end();
}

async function streamModel(request, response, root) {
  let file;
  try {
    const realRoot = await realpath(root);
    const vehiclesDirectory = join(realRoot, 'referencias-locais', 'Vehicles');
    const realVehiclesDirectory = await realpath(vehiclesDirectory);
    // Neither the directory nor the fixed file may resolve outside Vehicles.
    if (relative(vehiclesDirectory, realVehiclesDirectory) !== '') {
      notFound(response);
      return;
    }
    const model = await realpath(join(realVehiclesDirectory, 'sci_-_fi_buggy.glb'));
    if (relative(realVehiclesDirectory, dirname(model)) !== '') {
      notFound(response);
      return;
    }

    file = await open(model, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stats = await file.stat();
    if (!stats.isFile()) {
      notFound(response);
      return;
    }
    if (response.destroyed) return;

    response.setHeader('Content-Type', 'model/gltf-binary');
    response.setHeader('Content-Length', stats.size);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    // The stream owns the handle from here; pipeline also handles client aborts.
    const stream = file.createReadStream();
    file = undefined;
    pipeline(stream, response, error => {
      if (error && !response.destroyed) response.destroy();
    });
  } catch {
    // Never return filesystem paths or raw I/O errors to the browser.
    if (!response.headersSent && !response.destroyed) {
      response.removeHeader('Content-Length');
      response.removeHeader('Content-Type');
      notFound(response);
    } else if (!response.destroyed) {
      response.destroy();
    }
  } finally {
    await file?.close().catch(() => {});
  }
}

export function localRiftBlazePlugin() {
  let root;
  return {
    name: 'local-rift-blaze',
    apply: (_config, environment) => environment.command === 'serve' && !environment.isPreview,
    config(config) {
      return {
        server: {
          fs: {
            deny: [...new Set([
              ...VITE_DEFAULT_FS_DENY,
              ...(config.server?.fs?.deny ?? []),
              '**/referencias-locais/**',
            ])],
          },
        },
      };
    },
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        // Compare the raw URL: no decoding, query strings or path parameters.
        if (request.url !== RIFT_BLAZE_URL) {
          next();
          return;
        }
        response.setHeader('Cache-Control', 'no-store');
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.statusCode = 405;
          response.setHeader('Allow', 'GET, HEAD');
          response.end();
          return;
        }
        void streamModel(request, response, root);
      });
    },
  };
}
