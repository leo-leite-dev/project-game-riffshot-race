import { test, expect } from '@playwright/test';
import { createChampionshipState, setSelections } from '../src/championship/championshipState.ts';
import { CHAMPIONSHIP_SAVE_KEY } from '../src/championship/championshipStorage.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { clickObject, waitScene } from './helpers.ts';
import type { Page, TestInfo } from '@playwright/test';

type Dynamic = { [key: string]: Dynamic; [key: number]: Dynamic; (...args: unknown[]): Dynamic };

const read = (page: Page, fn: (game: Dynamic) => unknown) => page.evaluate(async (source: string) => {
  const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]'); if (!script) throw new Error('Entrada ausente'); const { game } = await import(script.src);
  return (new Function('game', `return (${source})(game)`))(game);
}, fn.toString());

test('buggy experimental local: garagem, braço, jogador, rodas, slip, nitro e câmeras', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  const seed = setSelections({ ...createChampionshipState({ id: 'local-career', attemptId: 'local-attempt' }),
    ownedVehicleIds: ['rift-blaze'] }, {
    pilotId: CHARACTERS[0].id, vehicleId: 'rift-blaze', paintId: 'inferno', difficultyId: 'normal',
  });
  await page.addInitScript(({ key, seed }) => localStorage.setItem(key, JSON.stringify(seed)), { key: CHAMPIONSHIP_SAVE_KEY, seed });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?localRiftBlaze=1');
  await page.keyboard.press('Enter'); await waitScene(page, 'MainMenu');
  await page.keyboard.press('Enter'); await waitScene(page, 'RacePreparation');
  await expect.poll(() => read(page, game => game.garageResources?.experimentalStatus), { timeout: 60_000 }).toBe('ready');
  await expect.poll(() => read(page, game => !!game.scene.getScene('RacePreparation').garageView), { timeout: 30_000 }).toBe(true);
  const initial = await read(page, game => {
    const resources = game.garageResources;
    const car = game.scene.getScene('RacePreparation').garageView.vehicles[0];
    return { source: car.userData.source, loadMs: resources.experimentalTemplate.loadMs,
      size: car.userData.size.toArray(), wheels: car.userData.visualAdapter.wheels.length,
      textures: resources.renderer.info.memory.textures, geometries: resources.renderer.info.memory.geometries };
  });
  expect(initial.source).toBe('local-buggy'); expect(initial.wheels).toBe(4);
  expect(initial.size[2]).toBeCloseTo(3.25, 5);
  console.info('Buggy local / carga e memória de recursos:', JSON.stringify(initial));
  await page.screenshot({ path: testInfo.outputPath('buggy-preparation.png') });
  await clickObject(page, 'modules', 3); await waitScene(page, 'VehicleSelection');
  await expect.poll(() => read(page, game => game.scene.getScene('VehicleSelection').garageView?.vehicles[0].userData.source)).toBe('local-buggy');
  await page.keyboard.press('Enter');
  await clickObject(page, 'paintCards', 2);
  expect(await read(page, game => game.scene.getScene('VehicleSelection').garageView.vehicles[0].userData.paintMaterials[0].color.getHexString())).toBe('ffd027');
  await clickObject(page, 'paintCards', 1);
  expect(await read(page, game => game.scene.getScene('VehicleSelection').garageView.vehicles[0].userData.paintMaterials[0].color.getHexString())).toBe('1677ff');
  await page.screenshot({ path: testInfo.outputPath('buggy-garage-blue.png') });
  await page.keyboard.press('Enter');
  await expect.poll(() => read(page, game => game.scene.getScenes(true)[0].scene.key), { timeout: 25_000 }).toBe('RacePreparation');
  await clickObject(page, 'startButton'); await waitScene(page, 'RaceTrackSelection');
  await page.keyboard.press('Enter'); await waitScene(page, 'Race');
  await expect.poll(() => read(page, game => game.scene.getScene('Race').garageView?.renderFrames ?? 0), { timeout: 30_000 }).toBeGreaterThan(3);
   expect(await read(page, game => game.scene.getScene('Race').garageView.vehicles.map((v: Dynamic) => v.userData.source)))
    .toEqual(['local-buggy', 'vehicle-glb', 'vehicle-glb', 'vehicle-glb']);
  await expect(page.locator('#screen-status')).toContainText('Largada!', { timeout: 15_000 });
  const before = await read(page, game => game.scene.getScene('Race').garageView.vehicles[0].userData.visualAdapter.wheels[0].spin.rotation.x);
  await page.keyboard.down('w'); await page.keyboard.down('Shift'); await page.waitForTimeout(650);
  await page.keyboard.up('Shift'); await page.keyboard.up('w');
  const driven = await read(page, game => {
    const scene = game.scene.getScene('Race'); const a = scene.garageView.vehicles[0].userData.visualAdapter;
    return { angle: a.wheels[0].spin.rotation.x, charges: scene.simulation.participants[0].nitroCharges,
       flames: a.flames.every((f: Dynamic) => f.visible), animationMs: scene.garageView.lastAnimationMs };
  });
  expect(driven.angle).not.toBe(before); expect(driven.charges).toBe(1); expect(driven.flames).toBe(true);
  // Controlled adapter inputs test presentation in the real WebGL renderer,
  // not a claim that a human performed a measured drift on the race track.
  const controlled = await read(page, game => {
    const world = game.scene.getScene('Race').garageView;
    const car = world.vehicles[0]; const a = car.userData.visualAdapter;
    const physical = game.scene.getScene('Race').simulation.participants[0];
    const original = JSON.stringify([physical.x, physical.y, physical.z, physical.health]);
    const pose = { longitudinalSpeed: 8, lateralSpeed: 6, steer: 1, longitudinalAcceleration: -12, impactSpeed: 3 };
    a.update(pose, 0.1, world.smoke);
    const forward = a.wheels[0].spin.rotation.x;
    a.update({ ...pose, longitudinalSpeed: -8 }, 0.1);
    const backward = a.wheels[0].spin.rotation.x;
    const emitted = world.smoke.emittedCount;
    a.update({ ...pose, longitudinalSpeed: 0 }, 0.1, world.smoke);
    return { forward, backward, emitted, noExtraWhenStopped: emitted === world.smoke.emittedCount,
      steer: a.wheels[0].steer.rotation.y, pitch: a.body.rotation.x,
      stateUnchanged: original === JSON.stringify([physical.x, physical.y, physical.z, physical.health]) };
  });
  expect(controlled.forward).not.toBe(controlled.backward); expect(controlled.emitted).toBeGreaterThan(0);
  expect(controlled.noExtraWhenStopped).toBe(true); expect(controlled.stateUnchanged).toBe(true);
  expect(controlled.steer).toBeGreaterThan(0); expect(controlled.pitch).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('buggy-race-chase.png') });
  await page.keyboard.press('c');
  await expect.poll(() => read(page, game => {
    const rig = game.scene.getScene('Race').garageView.cameraRig;
    return String(rig.mode) === 'isometric' && !rig.transitioning;
  }), { timeout: 10_000 }).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('buggy-race-isometric.png') });
  const start = await read(page, game => ({ frames: game.scene.getScene('Race').garageView.renderFrames, time: performance.now() }));
  await page.waitForTimeout(1200);
  const end = await read(page, game => ({ frames: game.scene.getScene('Race').garageView.renderFrames, time: performance.now(),
    animationMs: game.scene.getScene('Race').garageView.lastAnimationMs,
    calls: game.garageResources.renderer.info.render.calls, triangles: game.garageResources.renderer.info.render.triangles }));
  console.info('Buggy local / SwiftShader, não GPU física:', JSON.stringify({ ...end, fps: (end.frames - start.frames) * 1000 / (end.time - start.time) }));
  expect(errors).toEqual([]);
});

test('produção não solicita nem habilita GLB experimental; modelos oficiais são permitidos e arquivo privado não é servido', async ({ page, request }) => {
  test.setTimeout(45_000);
  const requested: string[] = [];
  page.on('request', req => { if (new URL(req.url()).pathname.startsWith('/__local-models/')) requested.push(req.url()); });
  const seed = setSelections({ ...createChampionshipState({ id: 'production-career', attemptId: 'production-attempt' }),
    ownedVehicleIds: ['rift-blaze'] }, {
    pilotId: CHARACTERS[0].id, vehicleId: 'rift-blaze', paintId: 'inferno', difficultyId: 'normal',
  });
  await page.addInitScript(({ key, seed }) => localStorage.setItem(key, JSON.stringify(seed)), { key: CHAMPIONSHIP_SAVE_KEY, seed });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:4183/?localRiftBlaze=1');
  await expect(page.locator('#screen-status')).toContainText('Sinta a batida');
  await page.keyboard.press('Enter'); await expect(page.locator('#screen-status')).toContainText('Menu principal');
  await page.waitForTimeout(150); await page.keyboard.press('Enter');
  await expect(page.locator('#screen-status')).toContainText('Estação de Equipe');
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.waitForTimeout(1200);
  expect(requested).toEqual([]);
  const response = await request.get('http://127.0.0.1:4183/__local-models/rift-blaze.glb');
  expect(response.headers()['content-type']).not.toContain('model/gltf-binary');
  expect((await response.body()).byteLength).toBeLessThan(10000);
});

test('GLB local inválido mantém o Thunder Bug GLB oficial e não bloqueia a preparação', async ({ page }) => {
  test.setTimeout(40_000);
  const seed = setSelections({ ...createChampionshipState({ id: 'fallback-career', attemptId: 'fallback-attempt' }),
    ownedVehicleIds: ['rift-blaze'] }, {
    pilotId: CHARACTERS[0].id, vehicleId: 'rift-blaze', paintId: 'volt', difficultyId: 'normal',
  });
  await page.addInitScript(({ key, seed }) => localStorage.setItem(key, JSON.stringify(seed)), { key: CHAMPIONSHIP_SAVE_KEY, seed });
  await page.route('**/__local-models/rift-blaze.glb', route => route.fulfill({ status: 200,
    contentType: 'model/gltf-binary', body: 'invalid model data' }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?localRiftBlaze=1');
  await page.keyboard.press('Enter'); await waitScene(page, 'MainMenu');
  await page.keyboard.press('Enter'); await waitScene(page, 'RacePreparation');
  await expect.poll(() => read(page, game => !!game.scene.getScene('RacePreparation').garageView)).toBe(true);
  expect(await read(page, game => ({ status: game.garageResources.experimentalStatus,
    adapter: !!game.scene.getScene('RacePreparation').garageView.vehicles[0].userData.visualAdapter,
    source: game.scene.getScene('RacePreparation').garageView.vehicles[0].userData.source,
    modelFile: game.scene.getScene('RacePreparation').garageView.vehicles[0].userData.modelFile,
    wheels: game.scene.getScene('RacePreparation').garageView.vehicles[0].userData.visualAdapter?.wheels.length,
    wheelsAnimated: game.scene.getScene('RacePreparation').garageView.vehicles[0].userData.wheelsAnimated,
    paintSupported: game.scene.getScene('RacePreparation').garageView.vehicles[0].userData.paintSupported,
    vehicle: game.championship.state.selections.vehicleId,
    paint: game.championship.state.selections.paintId })))
    .toEqual({ status: 'fallback', adapter: true, source: 'vehicle-glb', modelFile: 'thunder_bug.glb',
      wheels: 4, wheelsAnimated: true, paintSupported: false,
      vehicle: 'rift-blaze', paint: 'volt' });
});
