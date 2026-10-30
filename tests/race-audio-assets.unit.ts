import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { raceAudioPlugin } from '../scripts/raceAudioPlugin.ts';
import { RACE_AUDIO_ASSETS } from '../src/audio/raceAudioAssets.ts';

test('MP3 pendentes: permanecem privados, não são emitidos no build e preservam os bytes originais', async t => {
  const plugin = raceAudioPlugin() as unknown as {
    configResolved(config: { root: string }): void;
    generateBundle?: unknown;
  };
  plugin.configResolved({ root: fileURLToPath(new URL('..', import.meta.url)) });
  assert.equal(plugin.generateBundle, undefined, 'plugin não contém hook de publicação dos MP3');
  for (const asset of RACE_AUDIO_ASSETS) {
    const bytes = await readFile(new URL(`../referencias-locais/audio/${asset.sourceFileName}`, import.meta.url));
    assert.ok(bytes.byteLength > 100);
    assert.equal(asset.url, `/__local-audio/${asset.fileName}`);
    t.diagnostic(JSON.stringify({ file: asset.fileName, bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex') }));
  }
  assert.equal(RACE_AUDIO_ASSETS[0].sourceFileName, 'canhão_disparo_windowmaker.mp3');
  assert.equal(RACE_AUDIO_ASSETS[0].url, '/__local-audio/canhao_disparo_windowmaker.mp3');
});
