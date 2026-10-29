import { test, expect, state, waitScene } from './helpers.ts';
import type { Page, TestInfo } from '@playwright/test';

type Dynamic = { [key: string]: Dynamic; [key: number]: Dynamic; (...args: unknown[]): Dynamic };
type RenderState = { frames: number; camera: number[]; rotation: number[] };
type Controls = { throttle: number; brake: number; steer: number; handbrake: number; nitro: boolean };
type TelemetrySample = { speed: number; heading: number; input: Controls; x: number; z: number;
  velocityX: number; velocityZ: number; slip: number; trajectorySlip: number; lateralSpeed: number;
  longitudinalSpeed: number; wallMargin: number; barriers: number; contacts: number };
import { createChampionshipState, setSelections, ensureAssignedTrack } from '../src/championship/championshipState.ts';
import { CHAMPIONSHIP_SAVE_KEY } from '../src/championship/championshipStorage.ts';
import { CHARACTERS } from '../src/data/characters.ts';

test.describe.configure({ timeout: 60_000, retries: 0 });
// The page fixture gets a fresh, non-persistent context, containing only our save.
test.use({ storageState: { cookies: [], origins: [] } });

async function startIsolatedRace(page: Page, { id, trackId, rng }: { id: string; trackId: string; rng: number }) {
  const seed = ensureAssignedTrack(setSelections(createChampionshipState({
    id: `${id}-career`, attemptId: `${id}-attempt`,
  }), { pilotId: CHARACTERS[0].id, vehicleId: 'rift-blaze', paintId: 'inferno', difficultyId: 'normal' }), () => rng);
  await page.addInitScript(({ key, seed }) => {
    localStorage.setItem(key, JSON.stringify(seed));
  }, { key: CHAMPIONSHIP_SAVE_KEY, seed });
  await page.goto('/');
  await expect.poll(async () => (await state(page)).key).toBe('Splash');
  const started = await page.evaluate(async () => {
    const { game } = await import(document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!.src);
    const race = game.championship.startRace();
    game.scene.getScenes(true)[0].scene.start('Race');
    return { careerId: game.championship.state.id, trackId: race?.trackId };
  });
  expect(started).toEqual({ careerId: seed.id, trackId });
  // Freeze countdown/simulation as soon as Race exists, before waiting for
  // assets or fades. GarageScene still renders and updates the camera normally.
  await expect.poll(() => page.evaluate(async () => {
    const { game } = await import(document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!.src);
    const scene = game.scene.getScene('Race');
    if (!scene?.simulation || !scene.scene.isActive()) return false;
    scene.transitioning = true;
    scene.countdownLabel.setAlpha(0);
    return true;
  }), { message: 'grid isolado congelado antes da largada' }).toBe(true);
  await waitScene(page, 'Race');
  await expect.poll(() => page.evaluate(async () => {
    const { game } = await import(document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!.src);
    const scene = game.scene.getScene('Race');
    return scene.ready && !scene.loadingLabel.visible && scene.presentationMode === 'direct'
      && scene.garageView?.vehicles.length === 4 && scene.garageView.renderFrames > 3
      && game.garageResources.renderer.info.render.triangles > 0;
  }), { timeout: 15_000, message: 'RaceScene, assets e renderer Three prontos' }).toBe(true);
  await expect(page.locator('canvas.race-three-canvas')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function renderFrozenRace(page: Page) {
  const renderedBefore = await page.evaluate(async () => {
    const { game } = await import(document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!.src);
    const scene = game.scene.getScene('Race');
    scene.garageView.setParticipants(scene.simulation.participants, (car: Dynamic, output: Dynamic) =>
      scene.simulation.getVisualTelemetry(car, scene.simulation.getRenderPose(car, 1, output)));
    scene.updateHud();
    scene.updateMinimapVehicles();
    return scene.garageView.renderFrames;
  });
  // Capture the real composited page only after fresh render frames, camera
  // blending and follow have settled on the frozen simulation pose.
  let previousRender: RenderState | undefined;
  await expect.poll(() => page.evaluate(async () => {
    const { game } = await import(document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!.src);
    const world = game.scene.getScene('Race').garageView;
    return { frames: world.renderFrames, camera: world.camera.position.toArray(),
      rotation: world.camera.quaternion.toArray(), transitioning: world.cameraRig.transitioning };
  }).then(({ frames, camera, rotation, transitioning }) => {
    const movement = previousRender ? Math.hypot(...camera.map((value: number, index: number) => value - previousRender!.camera[index])) : Infinity;
    const rotationChange = previousRender ? Math.hypot(...rotation.map((value: number, index: number) => value - previousRender!.rotation[index])) : Infinity;
    const fresh = frames > (previousRender?.frames ?? frames);
    previousRender = { frames, camera, rotation };
    return fresh && frames >= renderedBefore + 6 && !transitioning && movement < 0.02 && rotationChange < 0.001;
  }), { timeout: 15_000, message: 'pose real renderizada e câmera estabilizada' }).toBe(true);
}

test('pilotagem: W + A gera drift natural sem freio de mão nem parede e mantém velocidade sob tração', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Manobra e captura direcionadas ao desktop.');
  await startIsolatedRace(page, { id: 'drift-fixture', trackId: 'neon-furnace', rng: 0.99 });

  const setup = await page.evaluate(async () => {
    const { game } = await import(document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!.src);
    const { sampleTrackAtProgress } = await import(new URL('/src/race/trackMath.ts', location.origin).href);
    const scene = game.scene.getScene('Race');
    const sim = scene.simulation;
    // Hold automatic countdown/physics; Phaser keyboard processing and the real
    // renderer remain active. Fixed steps below consume PlayerController.read().
    scene.transitioning = true;
    scene.simulationStarted = true;
    scene.countdownLabel.setAlpha(0);
    sim.start();
    for (const bot of sim.participants.slice(1)) bot.finished = true;
    const player = sim.participants[0];
    // Opening straight, 1.5 m toward the opposite side of the upcoming left
    // drift: leave room for its real trajectory inside the narrower corridor.
    // No velocity, slip, grip, handling or track width is injected.
    const center = sampleTrackAtProgress(sim.track, 10);
    const lane = 1.5;
    const x = center.x - center.tangentZ * lane, z = center.z + center.tangentX * lane;
    Object.assign(player, { x, y: center.y, z,
      heading: Math.atan2(center.tangentX, center.tangentZ),
      _prevX: x, _prevZ: z, _distance: center.distance, _lastPathDistance: center.distance });
    return { speed: player.speed, velocityX: player.velocityX, velocityZ: player.velocityZ,
      diagnostics: sim.diagnostics };
  });
  expect(setup).toEqual({ speed: 0, velocityX: 0, velocityZ: 0, diagnostics: true });

  const controls = () => page.evaluate(async () => {
    const { game } = await import(document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!.src);
    const scene = game.scene.getScene('Race');
    return scene.playerController.read(scene.simulation.participants[0]);
  });
  const drive = (frames: number) => page.evaluate(async (frames: number) => {
    const { game } = await import(document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!.src);
    const { findNearestTrackPoint } = await import(new URL('/src/race/trackMath.ts', location.origin).href);
    const scene = game.scene.getScene('Race');
    const sim = scene.simulation, player = sim.participants[0];
    const samples: TelemetrySample[] = [];
    const angle = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));
    for (let frame = 0; frame < frames; frame += 1) {
      const x = player.x, z = player.z;
      const input = scene.playerController.read(player);
      sim.advance(1000 / 60, input);
      const telemetry = sim.getVisualTelemetry(player, sim.getRenderPose(player, 1));
      samples.push({ speed: player.speed, heading: player.heading, input,
        x: player.x, z: player.z, velocityX: player.velocityX, velocityZ: player.velocityZ,
        slip: angle(Math.atan2(player.velocityX, player.velocityZ) - player.heading),
        trajectorySlip: angle(Math.atan2(player.x - x, player.z - z) - player.heading),
        lateralSpeed: telemetry.lateralSpeed, longitudinalSpeed: telemetry.longitudinalSpeed,
        wallMargin: sim.track.width / 2 - 1.2 - Math.abs(findNearestTrackPoint(sim.track, player.x, player.z).lateral),
         barriers: sim.lastAdvanceBarrierCorrections, contacts: sim.lastAdvanceContactCorrections } as unknown as TelemetrySample);
    }
    return samples;
  }, frames);

  let straight, turn, recovery;
  try {
    await page.keyboard.down('w');
    await expect.poll(controls).toEqual({ throttle: 1, brake: 0, steer: 0, handbrake: 0, nitro: false });
    straight = await drive(100);
    await page.keyboard.down('a');
    await expect.poll(controls).toEqual({ throttle: 1, brake: 0, steer: 1, handbrake: 0, nitro: false });
    turn = await drive(24);
    await page.keyboard.up('a');
    await expect.poll(controls).toEqual({ throttle: 1, brake: 0, steer: 0, handbrake: 0, nitro: false });
    // 0.2 s proves persistent slip without driving the established drift into
    // the next bend of the 14 m corridor. Wall assertions remain unchanged.
    recovery = await drive(12);
  } finally {
    await page.keyboard.up('a');
    await page.keyboard.up('w');
  }
  await expect.poll(controls).toEqual({ throttle: 0, brake: 0, steer: 0, handbrake: 0, nitro: false });
  await testInfo.attach('drift-telemetry', {
    body: JSON.stringify({ setup, straight, turn, recovery }, null, 2), contentType: 'application/json',
  });

  await renderFrozenRace(page);
  await page.screenshot({ path: 'previews-ui/drift-tracao-desktop.png', fullPage: true });

   const all = [...straight, ...turn, ...recovery] as unknown as TelemetrySample[];
   const before = all[straight.length - 1]!;
   const after = all[straight.length + turn.length - 1]!;
  expect(before.speed, 'W acelera de repouso até velocidade de corrida').toBeGreaterThan(12);
  expect(Math.abs(before.slip), 'reta não começa com slip artificial').toBeLessThan(0.02);
  expect(after.heading - before.heading, 'A gira o heading para a esquerda local').toBeGreaterThan(0.15);
  // Fixed final window, not a filtered subset that could hide speed loss. The
  // tolerance below covers floating-point noise only, not gameplay deceleration.
   const sustained = (turn as unknown as TelemetrySample[]).slice(-6);
   let previousSpeed = (turn as unknown as TelemetrySample[]).at(-7)!.speed;
  for (const sample of sustained) {
    expect(sample.speed, 'drift mantém velocidade razoável').toBeGreaterThan(12);
    expect(sample.speed, 'drift estabelecido acelerando não perde velocidade entre passos').toBeGreaterThanOrEqual(previousSpeed - 1e-8);
    expect(sample.speed, 'velocidade corresponde ao vetor real de movimento').toBeCloseTo(Math.hypot(sample.velocityX, sample.velocityZ), 8);
    expect(sample.slip, 'a traseira fica bastante solta na curva (> 20°)').toBeLessThan(-0.35);
    expect(sample.trajectorySlip).toBeCloseTo(sample.slip, 5);
    expect(Math.abs(sample.lateralSpeed), 'telemetria real confirma forte movimento lateral').toBeGreaterThan(7);
    expect(sample.input).toEqual({ throttle: 1, brake: 0, steer: 1, handbrake: 0, nitro: false });
    previousSpeed = sample.speed;
  }
   const finalRecovery = (recovery as unknown as TelemetrySample[]).at(-1)!;
   expect(finalRecovery.slip, 'o drift persiste após 0,2 s sem direção, mantendo W').toBeLessThan(-0.2);
   expect(finalRecovery.speed, 'a traseira desliza sem matar a velocidade').toBeGreaterThan(18);
  expect(all.every(sample => sample.barriers === 0 && sample.contacts === 0), 'sem correções de parede ou carro').toBe(true);
  expect(Math.min(...all.map(sample => sample.wallMargin)), 'manobra mantém folga da parede').toBeGreaterThan(1);
  expect(all.every(sample => sample.input.handbrake === 0 && !sample.input.nitro && sample.input.brake === 0)).toBe(true);
});

for (const fixture of [
  { trackId: 'neon-furnace', rng: 0.99, width: 14 },
  { trackId: 'voltage-run', rng: 0, width: 13 },
]) {
  test(`pista estreita: ${fixture.trackId} com grid isométrico de quatro carros e largura ${fixture.width} m`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Grid e captura direcionados ao desktop.');
    await startIsolatedRace(page, { ...fixture, id: `narrow-${fixture.trackId}` });
    const toggled = await page.evaluate(async () => {
      const { game } = await import(document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!.src);
      const scene = game.scene.getScene('Race');
      // scene.toggleCamera() intentionally ignores input while transitioning.
      // Toggle the real rig directly; keep renderer/camera updates running.
      const changed = scene.garageView.cameraRig.toggle();
      if (changed) scene.showCameraNotice();
      return changed;
    });
    expect(toggled, 'rig aceita transição do grid congelado para isométrica').toBe(true);
    await renderFrozenRace(page);

    const grid = await page.evaluate(async () => {
      const { game } = await import(document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!.src);
      const { findNearestTrackPoint } = await import(new URL('/src/race/trackMath.ts', location.origin).href);
      const scene = game.scene.getScene('Race');
      const sim = scene.simulation, world = scene.garageView;
      // Measure the actual road ribbon, not just the source configuration.
      const vertices = world.obstacles[0].geometry.getAttribute('position');
      const roadWidths = [];
      for (let index = 0; index < vertices.count; index += 2) {
        roadWidths.push(Math.hypot(vertices.getX(index) - vertices.getX(index + 1),
          vertices.getZ(index) - vertices.getZ(index + 1)));
      }
      return {
        trackId: scene.track.id,
        widths: { scene: scene.track.width, simulation: sim.track.width,
          world: world.trackData.width, camera: world.cameraRig.track.width },
        roadWidthMin: Math.min(...roadWidths), roadWidthMax: Math.max(...roadWidths),
        frozen: scene.transitioning, cameraFrozen: world.cameraFrozen,
        mode: world.cameraRig.mode, blending: world.cameraRig.transitioning,
        orthographic: world.camera.isOrthographicCamera,
        status: sim.status, elapsed: sim.elapsedTime, started: scene.simulationStarted,
       lanes: scene.track.startGrid.map((slot: Dynamic) => slot.lane),
       participants: sim.participants.map((car: Dynamic, index: number) => {
          const vehicle = world.vehicles[index];
          const screen = vehicle.position.clone().project(world.camera);
          return { lane: car._lane, lateral: findNearestTrackPoint(sim.track, car.x, car.z).lateral,
            halfWidth: Math.max(1.2, vehicle.userData.size.x / 2),
            speed: car.speed, position: [car.x, car.y, car.z],
            renderedPosition: vehicle.position.toArray(),
            visible: vehicle.visible && vehicle.parent === world.scene,
            screen: screen.toArray() };
        }),
        vehicles: world.vehicles.length,
      };
    });
    await testInfo.attach('narrow-track-grid', {
      body: JSON.stringify(grid, null, 2), contentType: 'application/json',
    });
    expect(grid).toMatchObject({ trackId: fixture.trackId, frozen: true, cameraFrozen: false,
      mode: 'isometric', blending: false, orthographic: true,
      status: 'waiting', elapsed: 0, started: false, vehicles: 4 });
    expect(grid.widths).toEqual({ scene: fixture.width, simulation: fixture.width,
      world: fixture.width, camera: fixture.width });
    expect(grid.roadWidthMin, 'malha real acompanha a largura estreita em toda a pista').toBeCloseTo(fixture.width, 4);
    expect(grid.roadWidthMax).toBeCloseTo(fixture.width, 4);
    expect(grid.participants).toHaveLength(4);
    expect(grid.lanes).toHaveLength(4);
     expect(new Set(grid.participants.map((car: Dynamic) => car.position.join(','))).size, 'quatro posições distintas no grid').toBe(4);
    for (const [index, car] of grid.participants.entries()) {
      expect(car.lane).toBe(grid.lanes[index]);
      expect(Math.abs(car.lane) + car.halfWidth, 'lane e carro cabem dentro da faixa').toBeLessThan(fixture.width / 2);
      expect(Math.abs(car.lateral) + car.halfWidth, 'posição real do carro cabe dentro da faixa').toBeLessThan(fixture.width / 2);
      expect(car.speed).toBe(0);
      expect(car.visible).toBe(true);
      expect(car.renderedPosition[0]).toBeCloseTo(car.position[0], 6);
      expect(car.renderedPosition[1]).toBeCloseTo(car.position[1] + 0.08, 6);
      expect(car.renderedPosition[2]).toBeCloseTo(car.position[2], 6);
      expect(Math.abs(car.screen[0]), 'carro dentro do enquadramento horizontal').toBeLessThan(0.95);
      expect(Math.abs(car.screen[1]), 'carro dentro do enquadramento vertical').toBeLessThan(0.95);
      expect(Math.abs(car.screen[2]), 'carro entre os planos de recorte da câmera').toBeLessThan(1);
    }
    await page.screenshot({ path: `previews-ui/pista-${fixture.trackId}-estreita-desktop.png`, fullPage: true });
  });
}
