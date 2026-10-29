import { test, expect, openMenu, waitScene } from './helpers.ts';
import type { Page } from '@playwright/test';

type Dynamic = { [key: string]: Dynamic; [key: number]: Dynamic; (...args: unknown[]): Dynamic };
import { CHARACTERS } from '../src/data/characters.ts';
import { createChampionshipState, setSelections, ensureAssignedTrack, beginChampionshipRace } from '../src/championship/championshipState.ts';
import { CHAMPIONSHIP_SAVE_KEY } from '../src/championship/championshipStorage.ts';
import type { ChampionshipState } from '../src/championship/championshipState.ts';

// PNG preparation and software rendering are bounded but much slower than a GPU.
test.setTimeout(210_000);
const inspect = (page: Page, fn: (game: Dynamic) => unknown) => page.evaluate(async (source: string) => {
  const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]'); if (!script) throw new Error('Entrada ausente'); const { game } = await import(script.src);
  return new Function('game', `return (${source})(game)`)(game);
}, fn.toString());

function fixture(vehicleId = 'rift-blaze') {
  let state = createChampionshipState({ id: 'combat-isolated', attemptId: 'combat-attempt' });
  state = setSelections({ ...state, ownedVehicleIds: [vehicleId] }, {
    pilotId: CHARACTERS[0].id, vehicleId, paintId: 'inferno', difficultyId: 'normal',
  });
  return beginChampionshipRace(ensureAssignedTrack(state, () => 0.99), 'combat-race');
}
async function openRace(page: Page, vehicleId = 'rift-blaze') {
  await page.addInitScript(({ key, value }: { key: string; value: ChampionshipState }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: CHAMPIONSHIP_SAVE_KEY, value: fixture(vehicleId),
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMenu(page);
  // Isolated valid active race: open only the affected screen, not a championship.
  await inspect(page, game => game.scene.getScenes(true)[0].scene.start('Race'));
  await waitScene(page, 'Race');
  await expect.poll(() => inspect(page, game => !!game.scene.getScene('Race').ready), { timeout: 90_000 }).toBe(true);
  expect(await inspect(page, game => game.garageResources.modelFailures)).toEqual([]);
  await inspect(page, game => {
    const scene = game.scene.getScene('Race');
    // Static grid for comparable camera captures, without changing physics rules.
    scene.simulationStarted = true as unknown as Dynamic;
    scene.countdownLabel.setAlpha(0);
  });
}
async function settle(page: Page) {
  await expect.poll(() => inspect(page, game => {
     const rig = game.scene.getScene('Race').garageView.cameraRig;
     return !rig.transitioning && Math.abs(Number(rig.zoomLevel) - Number(rig.zoomIndex)) < 0.002;
  }), { timeout: 15_000 }).toBe(true);
  await inspect(page, game => new Promise(resolve => game.events.once('postrender', resolve)));
}

test('Thunder integrado: escala maior, três aproximações com Z e isométrica', async ({ page }) => {
  await openRace(page);
  const setup = await inspect(page, game => {
    const world = game.scene.getScene('Race').garageView;
    return { model: world.vehicles[0].userData.modelFile, length: world.vehicles[0].userData.size.z,
      capacity: game.scene.getScene('Race').simulation.participants.map((car: Dynamic) => car.healthOrbs) };
  });
  expect(setup.model).toBe('thunder_bug.glb');
  expect(setup.length).toBeCloseTo(4.225, 6);
  expect(setup.capacity).toEqual([4, 6, 3, 7]);
  await settle(page);
  await page.screenshot({ path: 'previews-ui/thunder-camera-proxima.png' });
  const distances = [];
  for (let level = 0; level < 3; level++) {
    if (level) await page.keyboard.press('z');
    await settle(page);
    distances.push(await inspect(page, game => {
      const scene = game.scene.getScene('Race'), rig = scene.garageView.cameraRig;
      const car = scene.simulation.participants[0];
       return { index: rig.zoomIndex, distance: Math.hypot(Number(rig.camera.position.x) - Number(car.x), Number(rig.camera.position.z) - Number(car.z)) };
    }));
    if (level) await page.screenshot({ path: `previews-ui/thunder-camera-zoom-${level + 1}.png` });
  }
  expect(distances.map(item => item.index)).toEqual([0, 1, 2]);
  expect(distances[2].distance).toBeLessThan(distances[1].distance);
  expect(distances[1].distance).toBeLessThan(distances[0].distance);
  await page.keyboard.press('z'); await settle(page);
  expect(await inspect(page, game => game.scene.getScene('Race').garageView.cameraRig.zoomIndex)).toBe(0);
  await page.keyboard.press('c'); await settle(page);
  expect(await inspect(page, game => game.scene.getScene('Race').garageView.cameraRig.mode)).toBe('isometric');
  await page.screenshot({ path: 'previews-ui/thunder-camera-isometrica.png' });
});

test('Thunder mobile: enquadramento estável nas duas câmeras e zoom próximo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRace(page);
  await expect.poll(() => inspect(page, game => game.scale.width)).toBe(390);
  await settle(page);
  await page.screenshot({ path: 'previews-ui/thunder-terceira-mobile.png' });
  await page.keyboard.press('z'); await settle(page);
  await page.keyboard.press('z'); await settle(page);
  await page.screenshot({ path: 'previews-ui/thunder-zoom-mobile.png' });
  await page.keyboard.press('c'); await settle(page);
  await page.screenshot({ path: 'previews-ui/thunder-isometrica-mobile.png' });
});

test('dano integrado: bolinhas, fumaça, explosão única e respawn central com vida cheia', async ({ page }) => {
  await openRace(page);
  await inspect(page, game => {
    const scene = game.scene.getScene('Race');
    scene.simulation.applyDamage(scene.simulation.participants[0], 56);
    scene.updateHud();
    scene.toggleCamera();
  });
  await settle(page);
  await expect.poll(() => inspect(page, game => game.scene.getScene('Race').garageView.damageEffects.activeCount), { timeout: 15_000 }).toBeGreaterThan(8);
  expect(await inspect(page, game => game.scene.getScene('Race').vehicleStatus.text)).toContain('VIDA 2/4');
  await page.screenshot({ path: 'previews-ui/thunder-danificado-fumaca.png' });
  const before = await inspect(page, game => {
    const scene = game.scene.getScene('Race'), car = scene.simulation.participants[0];
    const ledger = { progress: car.progress, laps: car.lapsCompleted, gate: car._nextGate, charges: car.nitroCharges };
    scene.simulation.applyDamage(car, 9999);
    scene.updateHud();
    // Render the actual observed destruction event before its 0.8 s timer.
    scene.garageView.setParticipants(scene.simulation.participants,
      (car: Dynamic, output: Dynamic) => scene.simulation.getVisualTelemetry(car, scene.simulation.getRenderPose(car, undefined, output)));
    scene.garageView.update(16.667);
    return ledger;
  });
  expect(await inspect(page, game => game.scene.getScene('Race').garageView.damageEffects.explosionCount)).toBe(1);
  expect(await inspect(page, game => game.scene.getScene('Race').garageView.vehicles[0].visible)).toBe(false);
  await page.screenshot({ path: 'previews-ui/thunder-explosao.png' });
  const after = await inspect(page, game => {
    const scene = game.scene.getScene('Race'), race = scene.simulation, car = race.participants[0];
    race.start();
    // Controlled functional time: real fixed-step code, not a simulated HUD.
    for (let step = 0; step < 49; step++) race.advance(1000 / 60, {});
    scene.updateHud();
    return { health: car.health, maxHealth: car.maxHealth, dead: car.destroyed, sequence: car.respawnSequence,
       protected: Number(car.respawnProtection) > 0, progress: car.progress, laps: car.lapsCompleted,
      gate: car._nextGate, charges: car.nitroCharges,
       central: Math.hypot(Number(car.x) - Number(car._respawnPoint.x), Number(car.z) - Number(car._respawnPoint.z)) < 0.01 };
  });
  expect(after).toMatchObject({ health: 80, maxHealth: 80, dead: false, sequence: 1, protected: true,
    ...before, central: true });
  await expect.poll(() => inspect(page, game => game.scene.getScene('Race').garageView.damageEffects.explosionCount)).toBe(1);
});

test('rodas e motores integrados: movimento real, timbres distintos, sinal, mute e descarte na saída', async ({ page }) => {
  await page.addInitScript(() => {
    // Engine synthesis must work even when offline music rendering is unavailable.
    (window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext = undefined;
    window.webkitOfflineAudioContext = undefined;
  });
  await openRace(page);
  await expect.poll(() => inspect(page, game => game.scene.getScene('Race').engineAudio.diagnostics.voiceCount)).toBe(4);
  const baseline = await inspect(page, game => {
    const scene = game.scene.getScene('Race');
    scene.simulation.start();
    const audio = scene.engineAudio;
    const analyser = game.sound.context.createAnalyser();
    analyser.fftSize = 2048 as unknown as Dynamic;
    audio.output.connect(analyser);
    window.__engineAnalyser = analyser as unknown as AnalyserNode;
    window.__initialAudio = audio as unknown as Dynamic;
    return { created: audio.diagnostics.createdNodes,
      pitches: audio.diagnostics.voices.map((voice: Dynamic) => voice.pitchHz),
      wheels: scene.garageView.vehicles.map((vehicle: Dynamic) => vehicle.userData.visualAdapter.wheels[0].spin.rotation.x) };
  });
  expect(new Set(baseline.pitches).size).toBe(4);
  await page.keyboard.down('w');
  await expect.poll(() => inspect(page, game => game.scene.getScene('Race').simulation.participants[0].speed)).toBeGreaterThan(4);
  await page.keyboard.up('w');
  const moving = await inspect(page, game => {
    const scene = game.scene.getScene('Race');
    return { audio: scene.engineAudio.diagnostics, wheels: scene.garageView.vehicles.map((vehicle: Dynamic) => ({
      count: vehicle.userData.wheelCount, angle: vehicle.userData.visualAdapter.wheels[0].spin.rotation.x })),
      source: scene.garageView.vehicles.map((vehicle: Dynamic) => vehicle.userData.source) };
  });
  expect(moving.audio.createdNodes).toBe(baseline.created);
  expect(moving.wheels.map((wheel: Dynamic) => wheel.count)).toEqual([4, 4, 4, 4]);
  expect(moving.wheels[0].angle).not.toBe(baseline.wheels[0]);
  expect(moving.audio.voices[0].pitchHz).toBeGreaterThan(baseline.pitches[0]);
  expect(moving.source).toEqual(Array(4).fill('vehicle-glb'));
  const signal = () => page.evaluate(() => {
    const values = new Float32Array(window.__engineAnalyser.fftSize);
    window.__engineAnalyser.getFloatTimeDomainData(values);
    return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
  });
  await expect.poll(signal).toBeGreaterThan(0.001);
  await page.keyboard.press('m');
  await expect.poll(() => inspect(page, game => game.scene.getScene('Race').engineAudio.diagnostics.silent)).toBe(true);
  await expect.poll(signal).toBeLessThan(0.0001);
  await page.locator('#music-toggle').click();
  await expect.poll(signal).toBeGreaterThan(0.001);
  // Return keyboard focus from the native sound button to the game canvas.
  await page.locator('canvas:not(.race-three-canvas)').focus();
  await page.keyboard.press('Escape'); await waitScene(page, 'RacePreparation');
  expect(await page.evaluate(() => ({ destroyed: window.__initialAudio.diagnostics.destroyed,
    nodes: window.__initialAudio.diagnostics.nodes }))).toEqual({ destroyed: true, nodes: 0 });
  await page.evaluate(() => { window.__engineAnalyser.disconnect(); window.__engineAnalyser = undefined as unknown as AnalyserNode; });
});

test('produção Thunder: derivado abaixo de 25 MiB, modelo e instruções de zoom no build', async ({ page }) => {
  await page.addInitScript(() => {
    window.__raceProjectionReady = false;
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (value, ...args) {
      if (String(value).includes('MAIS PRÓXIMA')) window.__raceProjectionReady = true;
      return original.call(this, value, ...args);
    };
  });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: CHAMPIONSHIP_SAVE_KEY, value: fixture(),
  });
  const status = page.locator('#screen-status');
  let thunderBytes = 0;
  page.on('response', response => {
    if (response.ok() && response.url().endsWith('/models/vehicles/thunder_bug.glb')) {
      thunderBytes = Number(response.headers()['content-length']);
    }
  });
  await page.goto('http://127.0.0.1:4183');
  await expect(status).toContainText('Sinta a batida');
  await page.keyboard.press('Enter'); await expect(status).toContainText('Menu principal');
  await page.keyboard.press('Enter'); await expect(status).toContainText('Estação de Equipe');
  await expect.poll(() => thunderBytes, { timeout: 90_000 }).toBeGreaterThan(0);
  expect(thunderBytes).toBeLessThan(25 * 1024 * 1024);
  // Production has no development export; use the actual user-facing flow.
  await page.keyboard.press('Enter'); await expect(status).toContainText('Pista atribuída');
  await page.keyboard.press('Enter');
  await expect(status).toContainText('A corrida começa', { timeout: 60_000 });
  await page.keyboard.press('z');
  await expect.poll(() => page.evaluate(() => window.__raceProjectionReady)).toBe(true);
  // Wait for the real countdown/fade, not just text drawn during scene creation.
  await expect(status).toContainText('Largada', { timeout: 30_000 });
  await page.screenshot({ path: 'previews-ui/thunder-producao.png' });
});
