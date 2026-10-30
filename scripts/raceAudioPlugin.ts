import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { RACE_AUDIO_ASSETS } from '../src/audio/raceAudioAssets.ts';

// User-supplied MP3s with unconfirmed licensing are readable only in dev.
// Preview explicitly returns 404 and no audio payload is emitted into builds.
export function raceAudioPlugin(): Plugin {
  let root = '';
  const audioRoute = (rawUrl: string) => {
    const path = rawUrl.replaceAll('\\', '/').split('?')[0] ?? '';
    return path === '/audios' || path.startsWith('/audios/')
      || path === '/__local-audio' || path.startsWith('/__local-audio/');
  };
  const legacyPublicAudioUrl = (rawUrl: string) => {
    const path = rawUrl.replaceAll('\\', '/').split('?')[0] ?? '';
    return path === '/audios' || path.startsWith('/audios/');
  };
  return {
    name: 'race-audio-assets',
    configResolved(config) { root = config.root; },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split('?')[0];
        if (legacyPublicAudioUrl(request.url ?? '')) {
          response.statusCode = 404;
          response.setHeader('Cache-Control', 'no-store');
          response.setHeader('X-Content-Type-Options', 'nosniff');
          response.end();
          return;
        }
        const asset = RACE_AUDIO_ASSETS.find(asset => asset.url === pathname);
        if (!asset) {
          if (audioRoute(request.url ?? '')) {
            response.statusCode = 404;
            response.setHeader('Cache-Control', 'no-store');
            response.setHeader('X-Content-Type-Options', 'nosniff');
            response.end();
          } else next();
          return;
        }
        if (!['GET', 'HEAD'].includes(request.method ?? '')) {
          response.statusCode = 405;
          response.setHeader('Allow', 'GET, HEAD');
          response.end();
          return;
        }
        void readFile(resolve(root, 'referencias-locais', 'audio', asset.sourceFileName)).then(bytes => {
          if (response.destroyed || response.writableEnded) return;
          response.setHeader('Content-Type', 'audio/mpeg');
          response.setHeader('Content-Length', bytes.byteLength);
          response.setHeader('Cache-Control', 'no-store');
          response.setHeader('X-Content-Type-Options', 'nosniff');
          response.end(request.method === 'HEAD' ? undefined : bytes);
        }, () => {
          if (response.destroyed || response.writableEnded) return;
          response.statusCode = 404;
          response.end('Áudio indisponível');
        });
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!audioRoute(request.url ?? '')) { next(); return; }
        response.statusCode = 404;
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.end();
      });
    },
  };
}
