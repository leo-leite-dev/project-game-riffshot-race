import { CHARACTERS } from '../src/data/characters.js';
import { RACE_TRACKS } from '../src/data/raceTracks.js';
import { test, expect, state, waitScene, openMenu, clickObject } from './helpers.js';

test('dificuldade → piloto → garagem → pista → corrida arcade → resultado, preservando a campanha', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await openMenu(page);
  await page.keyboard.press('Enter');
  await waitScene(page, 'DifficultySelection');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#screen-status')).toContainText('Difícil');
  await page.keyboard.press('Enter');
  await waitScene(page, 'CharacterSelection');
  await clickObject(page, 'cards', 5);
  await clickObject(page, 'confirmButton');
  await waitScene(page, 'VehicleSelection');
  await expect.poll(async () => page.evaluate(async () => {
    const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
    const scene = game.scene.getScene('VehicleSelection');
    return scene.loadingLabel.text.includes('OFICINA ONLINE') && !!scene.garageView;
  }), { timeout: 15_000 }).toBe(true);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).key, { timeout: 20_000 }).toBe('RacePreparation');
  await waitScene(page, 'RacePreparation');
  await clickObject(page, 'startButton');
  await waitScene(page, 'RaceTrackSelection');
  expect((await state(page)).difficultyId).toBe('hard');
  const assigned = await page.evaluate(async () => {
    const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
    return game.scene.getScene('RaceTrackSelection').assignedTrack;
  });
  await expect(page.locator('#screen-status')).toContainText(assigned.name);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#screen-status')).toContainText(assigned.name);
  await page.keyboard.press('Escape');
  await waitScene(page, 'RacePreparation');
  await clickObject(page, 'startButton');
  await waitScene(page, 'RaceTrackSelection');
  await expect(page.locator('#screen-status')).toContainText(assigned.name);
  await page.keyboard.press('Enter');
  await waitScene(page, 'Race');
  await expect.poll(async () => page.evaluate(async () => {
    const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
    const scene = game.scene.getScene('Race');
    return !!scene.garageView && scene.garageView.renderFrames > 5;
  }), { timeout: 15_000, message: 'pista 3D renderizada pelo loop Phaser' }).toBe(true);

  const initial = await page.evaluate(async () => {
    const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
    const scene = game.scene.getScene('Race');
    return {
      participants: scene.simulation.participants.length,
      difficulty: scene.simulation.difficulty.id,
      track: scene.track.id,
      model: game.garageResources.source,
      rendererFrames: scene.garageView.renderFrames,
      drawCalls: game.garageResources.renderer.info.render.calls,
      triangles: game.garageResources.renderer.info.render.triangles,
      startPositions: scene.simulation.participants.map(car => [car.x, car.z]),
      presentation: scene.presentationMode, copies: scene.presentationCopies,
      mode: scene.garageView.cameraRig.mode, texture: !!scene.previewTexture,
    };
  });
  expect(initial).toMatchObject({ participants: 4, difficulty: 'hard', track: assigned.id, model: 'air-blade-local' });
  expect(initial).toMatchObject({ presentation: 'direct', copies: 0, texture: false, mode: 'chase' });
  await expect(page.locator('canvas')).toHaveCount(2);
  await expect(page.locator('.race-three-canvas')).toHaveCSS('pointer-events', 'none');
  expect(new Set(initial.startPositions.map(([x, z]) => `${x.toFixed(1)},${z.toFixed(1)}`)).size).toBe(4);

  await expect(page.locator('#screen-status')).toContainText('Largada!', { timeout: 12_000 });
  const beforeDrive = await page.evaluate(async () => {
    const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
    return game.scene.getScene('Race').simulation.participants[0].speed;
  });
  await page.keyboard.down('w');
  await page.waitForTimeout(450);
  await page.keyboard.up('w');
  const afterDrive = await page.evaluate(async () => {
    const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
    return game.scene.getScene('Race').simulation.participants[0].speed;
  });
  expect(afterDrive).toBeGreaterThan(beforeDrive);
  await page.screenshot({ path: testInfo.outputPath(`${assigned.id}-chase.png`) });
  await page.keyboard.press('c');
  await page.keyboard.press('c');
  await expect.poll(() => page.evaluate(async () => {
    const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
    return game.registry.get('raceCameraMode');
  })).toBe('isometric');
  await expect.poll(() => page.evaluate(async () => {
    const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
    return game.scene.getScene('Race').garageView.cameraRig.transitioning;
  })).toBe(false);
  await page.keyboard.down('w');
  await page.keyboard.down('d');
  await page.waitForTimeout(450);
  await page.keyboard.up('w');
  await page.keyboard.up('d');
  const chase = await page.evaluate(async () => {
    const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
    const scene = game.scene.getScene('Race');
    const three = scene.garageView.resources.renderer.domElement.getBoundingClientRect();
    const phaser = game.canvas.getBoundingClientRect();
    return { mode: scene.garageView.cameraRig.mode, speed: scene.simulation.participants[0].speed,
      copies: scene.presentationCopies, aligned: ['x', 'y', 'width', 'height'].every(key => Math.abs(three[key] - phaser[key]) < 1),
      alpha: game.renderer.gl.getContextAttributes().alpha };
  });
  expect(chase).toMatchObject({ mode: 'isometric', copies: 0, aligned: true, alpha: true });
  expect(chase.speed).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath(`${assigned.id}-isometric.png`) });
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => {
      const a = document.querySelector('.race-three-canvas').getBoundingClientRect();
      const b = document.querySelector('canvas:not(.race-three-canvas)').getBoundingClientRect();
      return a.width === innerWidth && a.height === innerHeight && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
    })).toBe(true);
  }

  // Measure actual render updates in this software-WebGL test environment.
  // This is diagnostic only; it does not impose a hardware-specific FPS floor.
  const renderStart = await page.evaluate(async () => {
    const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
    return { frames: game.scene.getScene('Race').garageView.renderFrames, time: performance.now() };
  });
  await page.waitForTimeout(1000);
  const renderEnd = await page.evaluate(async () => {
    const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
    const scene = game.scene.getScene('Race');
    return { frames: scene.garageView.renderFrames, time: performance.now(), lastRenderMs: scene.garageView.lastRenderMs };
  });
  const measuredFps = (renderEnd.frames - renderStart.frames) * 1000 / (renderEnd.time - renderStart.time);
  expect(measuredFps).toBeGreaterThan(0);
  console.info(`Métrica de render de corrida (WebGL do navegador de teste): ${measuredFps.toFixed(1)} FPS; último passe Three ${renderEnd.lastRenderMs.toFixed(2)} ms; ${initial.drawCalls} draw calls / ${initial.triangles} triângulos.`);

  // Finish with real physics/gates in an isolated test controller, not fake
  // finish flags. This intentionally does not claim human-driven four laps.
  const forcedRace = await page.evaluate(async () => {
    const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
    const scene = game.scene.getScene('Race');
    const sim = scene.simulation;
    sim.start();
    // Resume the player on the track if manual steering left it facing away.
    // A fresh real race validates completion separately from manual input.
    const { RaceSimulation } = await import('/src/race/RaceSimulation.js');
    const fresh = new RaceSimulation({ track: scene.track, difficulty: scene.difficulty.id,
      player: scene.character, vehicleStats: scene.vehicleSelection.vehicle.stats,
      playerPaint: scene.vehicleSelection.paint.color, botPilots: scene.createOpponents() }).start();
    scene.simulationStarted = true;
    for (let frame = 0; frame < 120 * 60 && fresh.status !== 'finished'; frame += 1) {
      fresh.advance(1000 / 60, fresh.getBotControls(fresh.participants[0], 1 / 60));
    }
    scene.simulation = fresh;
    return { status: fresh.status, standings: fresh.getStandings().map(car => [car.rank, car.name, car.lapsCompleted, car.finishTime]) };
  });
  expect(forcedRace.status).toBe('finished');
  expect(forcedRace.standings.map(row => row[0])).toEqual([1, 2, 3, 4]);
  expect(forcedRace.standings.every(row => row[2] === 4 && Number.isFinite(row[3]))).toBe(true);
  await waitScene(page, 'RaceResults');
  await expect(page.locator('canvas')).toHaveCount(1);
  expect((await state(page)).difficultyId).toBe('hard');
  await expect(page.locator('#screen-status')).toContainText('Resultado final');
  await expect.poll(async () => page.evaluate(async () => {
    const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
    return game.registry.get('lastRaceResult').standings.length;
  })).toBe(4);
  await clickObject(page, 'backButton');
  await waitScene(page, 'RacePreparation');
  expect(await state(page)).toMatchObject({
    characterId: CHARACTERS[5].id, difficultyId: 'hard', trackId: assigned.id,
  });
  await expect.poll(() => page.evaluate(async () => {
    const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
    return !!game.scene.getScene('RacePreparation').previewTexture;
  })).toBe(true);
  await clickObject(page, 'startButton');
  await waitScene(page, 'RaceTrackSelection');
  const secondTrack = await page.evaluate(async () => {
    const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
    return game.scene.getScene('RaceTrackSelection').assignedTrack;
  });
  expect(secondTrack.id).not.toBe(assigned.id);
  await page.keyboard.press('Enter');
  await waitScene(page, 'Race');
  await expect.poll(() => page.evaluate(async () => {
    const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
    return game.scene.getScene('Race').garageView?.cameraRig.mode;
  })).toBe('chase');
  await page.screenshot({ path: testInfo.outputPath(`${secondTrack.id}-chase.png`) });
  await page.keyboard.press('c');
  await expect.poll(() => page.evaluate(async () => {
    const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
    const rig = game.scene.getScene('Race').garageView.cameraRig;
    return rig.mode === 'isometric' && !rig.transitioning;
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`${secondTrack.id}-isometric.png`) });
  const performanceSample = async label => {
    const read = () => page.evaluate(async () => {
      const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
      const scene = game.scene.getScene('Race');
      const gl = scene.garageView.resources.renderer.getContext();
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return { frames: scene.garageView.renderFrames, time: performance.now(),
        copies: scene.presentationCopies, mode: scene.presentationMode,
        width: gl.drawingBufferWidth, height: gl.drawingBufferHeight,
        device: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
    });
    const before = await read();
    await page.waitForTimeout(1600);
    const after = await read();
    console.info(`${label}: ${((after.frames - before.frames) * 1000 / (after.time - before.time)).toFixed(1)} FPS; ${after.width}x${after.height}; cópias ${after.copies - before.copies}; ${after.device}`);
    return after;
  };
  expect((await performanceSample('Composição direta')).mode).toBe('direct');
  // HUD mouse input must pass over the Three layer, then remove the layer.
  await clickObject(page, 'exitButton');
  await waitScene(page, 'RacePreparation');
  await expect(page.locator('.race-three-canvas')).toHaveCount(0);
  await page.evaluate(async () => {
    const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
    game.registry.set('racePresentationMode', 'texture');
  });
  await clickObject(page, 'startButton');
  await waitScene(page, 'RaceTrackSelection');
  await expect(page.locator('#screen-status')).toContainText(secondTrack.name);
  await page.keyboard.press('Enter');
  await waitScene(page, 'Race');
  await expect.poll(() => page.evaluate(async () => {
    const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
    return game.scene.getScene('Race').presentationCopies;
  })).toBeGreaterThan(3);
  await expect(page.locator('canvas')).toHaveCount(1);
  expect((await performanceSample('Fallback CanvasTexture')).mode).toBe('texture');
  await page.keyboard.press('c');
  await expect.poll(() => page.evaluate(async () => {
    const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
    const rig = game.scene.getScene('Race').garageView.cameraRig;
    return rig.mode === 'isometric' && !rig.transitioning;
  })).toBe(true);
  await page.keyboard.press('Escape');
  await waitScene(page, 'RacePreparation');
  await page.keyboard.press('Escape');
  await waitScene(page, 'VehicleSelection');
  await expect.poll(() => page.evaluate(async () => {
    const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
    return !!game.scene.getScene('VehicleSelection').previewTexture;
  })).toBe(true);
  await page.keyboard.press('Escape');
  await waitScene(page, 'CharacterSelection');
  await page.keyboard.press('Escape');
  await waitScene(page, 'MainMenu');
  expect((await state(page)).keyboardListeners).toBe(1);
  await expect(page.locator('canvas')).toHaveCount(1);
});
