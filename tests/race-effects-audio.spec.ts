import { test, expect, openMenu, waitScene } from './helpers.ts';
import type { Page } from '@playwright/test';
import type { RaceScene } from '../src/scenes/RaceScene.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { createChampionshipState, setSelections, ensureAssignedTrack, beginChampionshipRace } from '../src/championship/championshipState.ts';
import { CHAMPIONSHIP_SAVE_KEY } from '../src/championship/championshipStorage.ts';
import { RACE_AUDIO_ASSETS } from '../src/audio/raceAudioAssets.ts';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

type SoundScene = RaceScene & { effectsProbe: AnalyserNode; effectsContext: BaseAudioContext };
const inspect = <T>(page: Page, fn: (scene: SoundScene) => T) => page.evaluate(async source => {
  const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
  if (!script) throw new Error('Entrada ausente');
  const { game } = await import(script.src);
  return new Function('scene', `return (${source})(scene)`)(game.scene.getScene('Race')) as T;
}, fn.toString());

test('efeitos Web Audio: MP3 privados apenas em dev, fallback no build, disparo, impacto, skid, mute e descarte', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const state = beginChampionshipRace(ensureAssignedTrack(setSelections({
    ...createChampionshipState({ id: 'effects-audio', attemptId: 'effects-attempt' }), ownedVehicleIds: ['rift-blaze'],
  }, { pilotId: CHARACTERS[0].id, vehicleId: 'rift-blaze', paintId: 'inferno', difficultyId: 'hard' }), () => 0.99), 'effects-race');
  await page.addInitScript(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: CHAMPIONSHIP_SAVE_KEY, state });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMenu(page);
  await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada ausente');
    const { game } = await import(script.src);
    game.scene.getScenes(true)[0].scene.start('Race');
  });
  await waitScene(page, 'Race');
  await expect.poll(() => inspect(page, scene => scene.ready), { timeout: 60_000 }).toBe(true);
  await expect.poll(() => inspect(page, scene => scene.effectsAudio.diagnostics.sampleStatus), { timeout: 20_000 }).toBe('ready');
  for (const asset of RACE_AUDIO_ASSETS) {
    const source = await readFile(new URL(`../referencias-locais/audio/${asset.sourceFileName}`, import.meta.url));
    const hash = createHash('sha256').update(source).digest('hex');
    const development = await page.request.get(`http://127.0.0.1:5183${asset.url}`);
    expect(development.ok()).toBe(true);
    expect(development.headers()['content-type']).toContain('audio/mpeg');
    expect(createHash('sha256').update(await development.body()).digest('hex')).toBe(hash);
    const production = await page.request.get(`http://127.0.0.1:4183${asset.url}`);
    expect(production.status()).toBe(404);
    expect((await production.body()).length).toBe(0);
  }
  const setup = await inspect(page, scene => {
    // Controlled audio fixture: pause physical motion, retain the real Web Audio
    // context. The separate cannon spec verifies autonomous live-loop events.
    scene.scene.pause();
    const sim = scene.simulation;
    sim.start();
    scene.effectsAudio.update(sim.participants, sim.status, sim.elapsedTime, []);
    const output = scene.effectsAudio.outputNode;
    if (!output) throw new Error('Saída dos efeitos indisponível');
    scene.effectsContext = output.context;
    scene.effectsProbe = output.context.createAnalyser();
    scene.effectsProbe.fftSize = 1024;
    output.connect(scene.effectsProbe);
    return scene.effectsAudio.diagnostics;
  });
  expect(setup.silent).toBe(false);
  expect(setup.generatedBuffers).toBe(4);
  expect(setup.decodedSamples).toBe(3);
  expect(setup.sampleSources).toMatchObject({ shot: '/__local-audio/canhao_disparo_windowmaker.mp3',
    hit: '/__local-audio/impacto_disparo.mp3', skid: '/__local-audio/pneu_derrapando.mp3' });
  const decoded = await inspect(page, scene => {
    const samples = (scene.effectsAudio as unknown as { sampleBuffers: Record<string, AudioBuffer> }).sampleBuffers;
    return Object.fromEntries(Object.entries(samples).map(([kind, buffer]) => {
      const data = buffer.getChannelData(0);
      let peak = 0, first = -1;
      for (let i = 0; i < data.length; i++) {
        peak = Math.max(peak, Math.abs(data[i]));
        if (first < 0 && Math.abs(data[i]) > 0.005) first = i;
      }
      return [kind, { duration: buffer.duration, peak, firstSignal: first / buffer.sampleRate }];
    }));
  });
  await testInfo.attach('mp3-decodificados', { body: JSON.stringify(decoded, null, 2), contentType: 'application/json' });
  // Feed semantic events only to the new bus, so music/engines cannot falsely
  // satisfy the signal assertions. No external sample or fake AudioContext.
  const shot = await inspect(page, async scene => {
    const sim = scene.simulation, player = sim.participants[0], rival = sim.participants[1];
    sim.elapsedTime += 0.1;
    scene.effectsAudio.update(sim.participants, sim.status, sim.elapsedTime, [{
      id: 1, projectileId: 1, kind: 'shot', ownerId: rival.id, dirX: 1, dirZ: 0,
      x: player.x, y: player.y + 1, z: player.z, time: sim.elapsedTime,
    }]);
    await new Promise(resolve => setTimeout(resolve, 45));
    const values = new Float32Array(scene.effectsProbe.fftSize);
    scene.effectsProbe.getFloatTimeDomainData(values);
    return { rms: Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length), diag: scene.effectsAudio.diagnostics };
  });
  expect(shot.rms).toBeGreaterThan(0.001);
  expect(shot.diag.shots).toBe(1);
  await expect.poll(() => inspect(page, scene => scene.effectsAudio.diagnostics.activeShots), { timeout: 30_000 }).toBe(0);
  const impact = await inspect(page, async scene => {
    const sim = scene.simulation, player = sim.participants[0], rival = sim.participants[1];
    sim.elapsedTime += 0.2;
    scene.effectsAudio.update(sim.participants, sim.status, sim.elapsedTime, [{
      id: 2, projectileId: 1, kind: 'hit', ownerId: rival.id, targetId: player.id, dirX: 1, dirZ: 0,
      x: player.x, y: player.y + 1, z: player.z, time: sim.elapsedTime,
    }]);
    await new Promise(resolve => setTimeout(resolve, 45));
    const values = new Float32Array(scene.effectsProbe.fftSize);
    scene.effectsProbe.getFloatTimeDomainData(values);
    return { rms: Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length), diag: scene.effectsAudio.diagnostics };
  });
  expect(impact.rms).toBeGreaterThan(0.001);
  expect(impact.diag.impacts).toBe(1);
  await expect.poll(() => inspect(page, scene => scene.effectsAudio.diagnostics.activeShots), { timeout: 30_000 }).toBe(0);
  const explosion = await inspect(page, async scene => {
    const sim = scene.simulation;
    sim.applyDamage(sim.participants[0], 9999);
    sim.elapsedTime += 0.1;
    scene.effectsAudio.update(sim.participants, sim.status, sim.elapsedTime, []);
    await new Promise(resolve => setTimeout(resolve, 70));
    const values = new Float32Array(scene.effectsProbe.fftSize);
    scene.effectsProbe.getFloatTimeDomainData(values);
    return { rms: Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length), diag: scene.effectsAudio.diagnostics };
  });
  expect(explosion.rms).toBeGreaterThan(0.001);
  expect(explosion.diag.explosions).toBe(1);
  await expect.poll(() => inspect(page, scene => scene.effectsAudio.diagnostics.activeShots)).toBe(0);
  const skid = await inspect(page, async scene => {
    const sim = scene.simulation, car = sim.participants[0];
    Object.assign(car, { destroyed: false, health: car.maxHealth, heading: 0, velocityX: 16, velocityZ: 18 });
    sim.elapsedTime += 0.2;
    scene.effectsAudio.update(sim.participants, sim.status, sim.elapsedTime, []);
    await new Promise(resolve => setTimeout(resolve, 100));
    const values = new Float32Array(scene.effectsProbe.fftSize);
    scene.effectsProbe.getFloatTimeDomainData(values);
    return { rms: Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length), diag: scene.effectsAudio.diagnostics };
  });
  expect(skid.rms).toBeGreaterThan(0.001);
  expect(skid.diag.skidVoices).toBe(1);
  const npcSounds = await inspect(page, scene => {
    const sim = scene.simulation, player = sim.participants[0];
    player.velocityX = player.velocityZ = 0;
    const npcs = sim.participants.slice(1);
    npcs.forEach((car, index) => Object.assign(car, { x: player.x + 5 * (index + 1), z: player.z,
      heading: 0, velocityX: 16, velocityZ: 18 }));
    sim.elapsedTime += 0.2;
    scene.effectsAudio.update(sim.participants, sim.status, sim.elapsedTime, npcs.map((car, index) => ({
      id: 3 + index, projectileId: 2 + index, kind: 'hit' as const, ownerId: 'fixture', targetId: car.id,
      dirX: 1, dirZ: 0, x: car.x, y: car.y + 1, z: car.z, time: sim.elapsedTime,
    })));
    const internals = scene.effectsAudio as unknown as {
      sampleBuffers: Record<string, AudioBuffer>;
      skids: Map<string, { source: AudioBufferSourceNode }>;
      oneShots: Set<{ source: AudioBufferSourceNode }>;
    };
    scene.engineAudio.update(sim.participants, sim.status);
    return { diag: scene.effectsAudio.diagnostics,
      npcSkidsUseMp3: npcs.map(car => internals.skids.get(car.id)?.source.buffer === internals.sampleBuffers.skid),
      hitsUseMp3: [...internals.oneShots].every(voice => voice.source.buffer === internals.sampleBuffers.hit),
      engines: scene.engineAudio.diagnostics };
  });
  expect(npcSounds.npcSkidsUseMp3).toEqual([true, true, true]);
  expect(npcSounds.hitsUseMp3).toBe(true);
  expect(npcSounds.diag.impacts).toBe(4);
  for (const voice of npcSounds.engines.voices.filter(voice => voice.id !== 'vera-volt')) {
    expect(voice.level).toBeGreaterThan(0.2);
  }
  await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada ausente');
    (await import(script.src)).game.menuMusic.toggle();
  });
  const muted = await inspect(page, async scene => {
    await new Promise(resolve => setTimeout(resolve, 80));
    const values = new Float32Array(scene.effectsProbe.fftSize);
    scene.effectsProbe.getFloatTimeDomainData(values);
    return { rms: Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length), diag: scene.effectsAudio.diagnostics };
  });
  expect(muted.rms).toBeLessThan(0.0001);
  expect(muted.diag.silent).toBe(true);
  expect(muted.diag.skidVoices).toBe(0);
  await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada ausente');
    (await import(script.src)).game.menuMusic.toggle();
  });
  const resumed = await inspect(page, scene => {
    const sim = scene.simulation;
    sim.participants[0].velocityX = sim.participants[0].velocityZ = 0;
    sim.elapsedTime += 0.1;
    scene.effectsAudio.update(sim.participants, sim.status, sim.elapsedTime, []);
    scene.effectsProbe.disconnect();
    scene.scene.resume();
    return scene.effectsAudio.diagnostics;
  });
  expect(resumed.shots).toBe(1);
  expect(resumed.impacts).toBe(4);
  expect(resumed.explosions).toBe(1);
  expect(resumed.errorCount).toBe(0);
  await page.locator('canvas:not(.race-three-canvas)').focus();
  await page.keyboard.press('Escape');
  await waitScene(page, 'RacePreparation');
  const destroyed = await inspect(page, scene => ({ ...scene.effectsAudio.diagnostics, sharedContext: scene.effectsContext.state }));
  expect(destroyed.destroyed).toBe(true);
  expect(destroyed.nodes).toBe(0);
  expect(destroyed.sharedContext).toBe('running');
  await testInfo.attach('sinais-reais-efeitos', { body: JSON.stringify({ shot, impact, explosion, skid, npcSounds, muted, resumed, destroyed }, null, 2), contentType: 'application/json' });
});
