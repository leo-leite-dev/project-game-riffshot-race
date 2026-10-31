import { test, expect, openMenu, waitScene } from './helpers.ts';
import type { Page } from '@playwright/test';
import type { RaceScene } from '../src/scenes/RaceScene.ts';
import type { VehicleVisualAdapter } from '../src/visuals/vehicles/VehicleVisualAdapter.ts';

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
async function openRace(page: Page, vehicleId = 'rift-blaze', staticGrid = true, captureLoading = false) {
  if (captureLoading) await page.route('**/assets/models/vehicles/*.glb', async route => {
    await new Promise(resolve => setTimeout(resolve, 700));
    await route.continue();
  });
  await page.addInitScript(({ key, value }: { key: string; value: ChampionshipState }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: CHAMPIONSHIP_SAVE_KEY, value: fixture(vehicleId),
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMenu(page);
  // Isolated valid active race: open only the affected screen, not a championship.
  await inspect(page, game => game.scene.getScenes(true)[0].scene.start('Race'));
  await waitScene(page, 'Race');
  expect(await inspect(page, game => {
    const scene = game.scene.getScene('Race');
    return scene.ready || (scene.loadingLabel.visible && String(scene.loadingLabel.text) === 'CARREGANDO CARROS E PISTA…');
  })).toBe(true);
  if (captureLoading) await page.screenshot({ path: 'previews-ui/corrida-carregando-carros.png' });
  await expect.poll(() => inspect(page, game => !!game.scene.getScene('Race').ready), { timeout: 90_000 }).toBe(true);
  expect(await inspect(page, game => game.garageResources.modelFailures)).toEqual([]);
  if (staticGrid) await inspect(page, game => {
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

test('Thunder integrado: vista arcade inicial, três aproximações com Z e terceira pessoa', async ({ page }) => {
  await openRace(page);
  const setup = await inspect(page, game => {
    const world = game.scene.getScene('Race').garageView;
    return { model: world.vehicles[0].userData.modelFile, length: world.vehicles[0].userData.size.z,
      capacity: game.scene.getScene('Race').simulation.participants.map((car: Dynamic) => car.healthOrbs),
      initialMode: world.cameraRig.mode };
  });
  expect(setup.model).toBe('thunder_bug.glb');
  expect(setup.initialMode).toBe('isometric');
  expect(setup.length).toBeCloseTo(4.225, 6);
  expect(setup.capacity).toEqual([4, 6, 4, 4]);
  await settle(page);
  await page.screenshot({ path: 'previews-ui/camera-arcade-inicial.png' });
  await page.keyboard.press('c'); await settle(page);
  expect(await inspect(page, game => game.scene.getScene('Race').garageView.cameraRig.mode)).toBe('chase');
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
  await expect.poll(() => inspect(page, game => game.scene.getScene('Race').garageView.cameraRig.mode)).toBe('chase');
  await page.screenshot({ path: 'previews-ui/camera-terceira-pessoa.png' });
  await page.keyboard.press('c'); await settle(page);
  expect(await inspect(page, game => game.scene.getScene('Race').garageView.cameraRig.mode)).toBe('isometric');
});

test('Thunder mobile: enquadramento estável nas duas câmeras e zoom próximo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRace(page);
  await expect.poll(() => inspect(page, game => game.scale.width)).toBe(390);
  await settle(page);
  expect(await inspect(page, game => game.scene.getScene('Race').garageView.cameraRig.mode)).toBe('isometric');
  await page.screenshot({ path: 'previews-ui/camera-arcade-mobile.png' });
  await page.keyboard.press('c'); await settle(page);
  await page.keyboard.press('z'); await settle(page);
  await page.keyboard.press('z'); await settle(page);
  await page.screenshot({ path: 'previews-ui/camera-terceira-mobile.png' });
  expect(await inspect(page, game => game.scene.getScene('Race').garageView.cameraRig.mode)).toBe('chase');
  await page.keyboard.press('c'); await settle(page);
});

test('corrida mobile em paisagem: orientação e controles touch alimentam o controlador', async ({ page }, testInfo) => {
  if (testInfo.project.name !== 'landscape') {
    await page.goto('/');
    test.skip(true, 'Este caso valida a tela e os controles de um dispositivo touch.');
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await openRace(page);
  await expect(page.locator('#orientation-prompt')).not.toBeVisible();
  const result = await inspect(page, game => {
    const scene = game.scene.getScene('Race');
    const controls = scene.touchControls.list as unknown as Dynamic[];
    scene.playerController.setAnalogControl(-0.75, -0.8, true);
    const driven = scene.playerController.read(scene.simulation.participants[0]);
    scene.playerController.setAnalogControl(0, 0, false);
    const released = scene.playerController.read(scene.simulation.participants[0]);
    const base = scene.touchStickBase;
    const basePosition = { x: Number(base.x), y: Number(base.y) };
    const pointer = { id: 17, x: basePosition.x + 30, y: basePosition.y - 30,
      event: { preventDefault() {} } } as unknown as Dynamic;
    base.emit('pointerdown', pointer);
    scene.handleTouchStickMove(pointer);
    const draggedKnob = { x: Number(scene.touchStickKnob.x), y: Number(scene.touchStickKnob.y) };
    const draggedControls = scene.playerController.read(scene.simulation.participants[0]);
    scene.handleTouchStickEnd(pointer);
    const centeredKnob = { x: Number(scene.touchStickKnob.x), y: Number(scene.touchStickKnob.y) };
    const dragReleased = scene.playerController.read(scene.simulation.participants[0]);
    controls[2].emit('pointerdown', { event: { preventDefault() {} } });
    const handbrake = scene.playerController.read(scene.simulation.participants[0]).handbrake;
    controls[2].emit('pointerup');
    return { visible: scene.touchControls.visible, count: controls.length,
      throttle: driven.throttle, steer: driven.steer, released: released.throttle, handbrake,
      draggedThrottle: draggedControls.throttle, draggedSteer: draggedControls.steer,
      dragReleasedThrottle: dragReleased.throttle, dragReleasedSteer: dragReleased.steer,
      base: basePosition, draggedKnob, centeredKnob,
      map: scene.minimap.visible, resources: scene.weaponLabels.map((label: Dynamic) => label.text),
      vehicleStatus: scene.vehicleStatus.text,
      mapX: scene.hudLayout.map.x, lapRight: Number(scene.hudLayout.lap.x) + Number(scene.hudLayout.lap.width),
      pilotBottom: Number(scene.hudLayout.pilot.y) + Number(scene.hudLayout.pilot.height),
      worldScale: scene.content.scaleX, hudScale: scene.hudLayer.scaleX,
      bounds: controls.filter(control => typeof control.getBounds === 'function').map(control => control.getBounds())
        .every((bounds: Dynamic) => Number(bounds.left) >= 0
        && Number(bounds.right) <= Number(game.scale.width) && Number(bounds.top) >= 0
        && Number(bounds.bottom) <= Number(game.scale.height)) };
  });
  expect(result).toMatchObject({ visible: true, count: 4, throttle: 0.8, steer: 0.75, released: 0, handbrake: 1,
    map: true, resources: ['0', '0', '0'], vehicleStatus: 'VIDA 4/4   NITRO 2/2', bounds: true, hudScale: 1 });
  expect(result.draggedThrottle).toBeCloseTo(30 / 49, 4);
  expect(result.draggedSteer).toBeCloseTo(-30 / 49, 4);
  expect(result.dragReleasedThrottle).toBe(0);
  expect(result.dragReleasedSteer).toBe(0);
  expect(result.draggedKnob).toEqual({ x: result.base.x + 30, y: result.base.y - 30 });
  expect(result.centeredKnob).toEqual(result.base);
  expect(result.mapX).toBeLessThan(30);
  expect(result.lapRight).toBeGreaterThan(814);
  expect(result.pilotBottom).toBeGreaterThan(370);
  await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada do jogo não encontrada');
    const { game } = await import(script.src);
    const scene = game.scene.getScene('Race') as unknown as Dynamic;
    const base = scene.touchStickBase as Dynamic;
    const pointer = { id: 18, x: Number(base.x) + 30, y: Number(base.y) - 30,
      event: { preventDefault() {} } };
    base.emit('pointerdown', pointer);
    scene.handleTouchStickMove(pointer);
  });
  await page.screenshot({ path: 'previews-ui/analogo-mobile-arrasto.png' });
  await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada do jogo não encontrada');
    const { game } = await import(script.src);
    const scene = game.scene.getScene('Race') as unknown as Dynamic;
    scene.handleTouchStickEnd({ id: 18 });
  });
  await page.screenshot({ path: 'previews-ui/corrida-mobile-paisagem-controles.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#orientation-prompt')).toBeVisible();
  await expect(page.getByRole('button', { name: 'TENTAR GIRAR A TELA' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fechar aviso de orientação' })).toBeVisible();
  await page.screenshot({ path: 'previews-ui/orientacao-mobile-retrato.png' });
  await page.getByRole('button', { name: 'Fechar aviso de orientação' }).click();
  await expect(page.locator('#orientation-prompt')).not.toBeVisible();
});

test('HUD desktop: mapa, recursos do veículo, vida em orbes e N/A para carro sem nitro', async ({ page }, testInfo) => {
  if (testInfo.project.name !== 'desktop') {
    await page.goto('/');
    test.skip(true, 'Este caso valida a HUD sem controles touch.');
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openRace(page, 'volt-vector');
  const hud = await inspect(page, game => {
    const scene = game.scene.getScene('Race');
    const player = scene.simulation.participants[0];
    const pilot = scene.hudLayout.pilot;
    const ratio = (value: unknown, origin: unknown, size: unknown) => (Number(value) - Number(origin)) / Number(size);
    return { mapVisible: scene.minimap.visible, mapFrameVisible: scene.minimapFrame.visible,
      resources: scene.weaponLabels.map((label: Dynamic) => label.text),
      resourceNames: scene.weaponNames.map((label: Dynamic) => label.text), status: scene.vehicleStatus.text,
      weaponStats: scene.vehicleSelection.vehicle.stats,
      weaponIcons: scene.weaponIcons.map((icon: Dynamic) => icon.texture.key),
      playerHudTextureLoaded: game.textures.exists('race-hud-player'),
      pilotPortrait: scene.playerHudPortrait.visible,
      lifeDisplay: { text: scene.lifeValue.text, visible: scene.lifeValue.visible },
      nitroDisplay: { text: scene.nitroValue.text, visible: scene.nitroValue.visible },
       difficulty: { text: scene.difficultyLabel.text, visible: scene.difficultyLabel.visible },
       controlKeys: scene.controlKeys.map((label: Dynamic) => label.text),
       controlCaptions: scene.controlCaptions.map((label: Dynamic) => label.text),
       controlAlphas: scene.controlKeys.concat(scene.controlCaptions).map((label: Dynamic) => label.alpha),
       controlFrameAlpha: scene.controlsFrame.alpha,
       botVehicles: scene.simulation.participants.slice(2).map((car: Dynamic) => car.vehicleId),
      totalHealthOrbs: player.healthOrbs, nitro: player.vehicle.nitroCharges,
      hudAnchors: { nameX: ratio(scene.playerLabel.x, pilot.x, pilot.width),
        nameOriginX: Number(scene.playerLabel.originX),
        healthX: ratio(scene.healthOrbs.x, pilot.x, pilot.width),
        healthY: ratio(scene.healthOrbs.y, pilot.y, pilot.height),
        nitroX: ratio(scene.nitroBars.x, pilot.x, pilot.width),
        nitroY: ratio(scene.nitroBars.y, pilot.y, pilot.height),
        speedX: ratio(scene.speedBars.x, pilot.x, pilot.width),
        speedY: ratio(scene.speedBars.y, pilot.y, pilot.height) },
      minimap: scene.minimapLayout, hintOrigin: scene.controlsHint.originX,
      map: scene.hudLayout.map, lap: scene.hudLayout.lap, pilot: scene.hudLayout.pilot,
      lapsLabel: scene.lapLabel.text, lapsCount: scene.positionLabel.text,
      hudScale: scene.hudLayer.scaleX };
  });
  expect(hud.mapVisible).toBe(true);
  expect(hud.mapFrameVisible).toBe(true);
  expect(hud.resources).toEqual(['shotCount', 'bombCount', 'oilSlickCount']
    .map(key => String(hud.weaponStats[key] ?? 0)));
  expect(hud.resourceNames).toEqual(['TIROS', 'BOMBAS', 'ÓLEO']);
  expect(hud.weaponIcons).toEqual([
    'race-hud-weapon-shots', 'race-hud-weapon-bomb', 'race-hud-weapon-oil',
  ]);
  expect(hud.playerHudTextureLoaded).toBe(false);
  expect(hud.status).toContain(`VIDA ${hud.totalHealthOrbs}/${hud.totalHealthOrbs}`);
  expect(hud.status).toContain('NITRO N/A');
  expect(hud.totalHealthOrbs).toBeGreaterThan(0);
  expect(hud.nitro).toBe(0);
  expect(hud.pilotPortrait).toBe(true);
  expect(hud.lifeDisplay).toEqual({ text: `${hud.totalHealthOrbs}/${hud.totalHealthOrbs}`, visible: true });
  expect(hud.nitroDisplay).toEqual({ text: 'N/A', visible: true });
  expect(hud.hudAnchors.nameOriginX).toBe(0.5);
  for (const [anchor, expected] of Object.entries({ nameX: 0.625, healthX: 0.56, healthY: 0.445,
    nitroX: 0.52, nitroY: 0.595, speedX: 0.52, speedY: 0.79 })) {
    expect(hud.hudAnchors[anchor]).toBeCloseTo(expected, 5);
  }
  expect(hud.difficulty).toEqual({ text: 'NORMAL', visible: true });
  expect(hud.controlKeys).toEqual(['W', 'S', 'A', 'D', 'C', 'Z', 'SHIFT', 'SPACE']);
  expect(hud.controlCaptions.slice(4, 6)).toEqual(['CÂMERA', 'ZOOM']);
  const hintTransition = await inspect(page, game => {
    const scene = game.scene.getScene('Race');
    const gaps = scene.controlCaptions.slice(0, 7).map((caption: Dynamic, index: number) =>
      Number(scene.controlKeys[index + 1].getBounds().left) - Number(caption.getBounds().right));
    Object.assign(scene, { simulationStarted: false });
    scene.setControlHintOpacity();
    const beforeStart = { frame: scene.controlsFrame.alpha,
      text: scene.controlKeys.concat(scene.controlCaptions).map((item: Dynamic) => item.alpha) };
    Object.assign(scene, { simulationStarted: true });
    scene.setControlHintOpacity();
    const afterStart = { frame: scene.controlsFrame.alpha,
      text: scene.controlKeys.concat(scene.controlCaptions).map((item: Dynamic) => item.alpha) };
    return { beforeStart, afterStart, gaps };
  });
  expect(hintTransition.beforeStart.frame).toBe(1);
  expect(hintTransition.beforeStart.text).toEqual(Array(16).fill(1));
  expect(hintTransition.afterStart.frame).toBe(0.35);
  expect(hintTransition.afterStart.text).toEqual(Array(16).fill(0.35));
  expect(Math.min(...hintTransition.gaps)).toBeGreaterThan(0);
  expect(hud.botVehicles).toEqual(['rift-blaze', 'rift-blaze']);
  expect(Number(hud.minimap.x)).toBeGreaterThan(0);
  expect(Number(hud.minimap.y)).toBeGreaterThan(0);
  expect(hud.hintOrigin).toBe(1);
  expect(hud.hudScale).toBe(1);
  expect(hud.lapsLabel).toBe('LAPS');
  expect(hud.lapsCount).toBe('4');
  expect(hud.map.x).toBeLessThanOrEqual(24);
  expect(hud.map.y).toBeLessThanOrEqual(24);
  expect(hud.lap.x + hud.lap.width).toBe(1896);
  expect(hud.pilot.y + hud.pilot.height).toBe(1056);
  await inspect(page, game => game.scene.getScene('Race').cameraNotice.setAlpha(0));
   await page.evaluate(async () => {
     const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
     if (!script) throw new Error('Entrada ausente');
     const { game } = await import(script.src);
     const scene = game.scene.getScene('Race');
     scene.simulationStarted = true;
     scene.setControlHintOpacity();
   });
   await page.screenshot({ path: 'previews-ui/corrida-hud-teclas-desktop.png' });
  const liveCounts = await inspect(page, async game => {
    const scene = game.scene.getScene('Race');
    const { getVehicleById } = await import(new URL('/src/data/vehicles.ts', location.origin).href);
    scene.vehicleSelection.vehicle = getVehicleById('widowmaker');
    scene.updateHud();
    return scene.weaponLabels.map((label: Dynamic) => label.text);
  });
  expect(liveCounts).toEqual(['5', '1', '1']);
  const speedMeter = await inspect(page, game => {
    const scene = game.scene.getScene('Race');
    const player = scene.simulation.participants[0];
    Object.assign(player, { speed: Number(player.vehicle.maxSpeed) / 2 });
    scene.updateHud();
    return { speed: scene.speedValue.text, filledSegments: scene.speedBarSegments };
  });
  expect(speedMeter.speed).not.toBe('000');
  expect(speedMeter.filledSegments).toBeGreaterThan(0);
  await page.screenshot({ path: 'previews-ui/hud-vida-nitro-velocidade.png' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => inspect(page, game => Number(game.scene.getScene('Race').hudLayout.lap.x)
    + Number(game.scene.getScene('Race').hudLayout.lap.width))).toBe(1416);
  await page.setViewportSize({ width: 2560, height: 1440 });
  await expect.poll(() => inspect(page, game => Number(game.scene.getScene('Race').hudLayer.scaleX)))
    .toBeCloseTo(4 / 3, 5);
  const qhd = await inspect(page, game => {
    const scene = game.scene.getScene('Race');
    return { scale: scene.hudLayer.scaleX, mapX: scene.hudLayout.map.x,
      lapRight: Number(scene.hudLayout.lap.x) + Number(scene.hudLayout.lap.width),
      pilotBottom: Number(scene.hudLayout.pilot.y) + Number(scene.hudLayout.pilot.height) };
  });
  expect(Number(qhd.scale)).toBeCloseTo(4 / 3, 5);
  expect(Number(qhd.mapX) * Number(qhd.scale)).toBeCloseTo(32, 4);
  expect(Number(qhd.lapRight) * Number(qhd.scale)).toBeCloseTo(2528, 4);
  expect(Number(qhd.pilotBottom) * Number(qhd.scale)).toBeCloseTo(1408, 4);
  await page.screenshot({ path: 'previews-ui/corrida-hud-qhd.png' });
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

test('largada natural: jogador e três bots avançam com rodas girando sem apresentação alterar a física', async ({ page }, testInfo) => {
  await openRace(page, 'rift-blaze', false, true);
  const sample = () => page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada ausente');
    const { game } = await import(script.src);
    const scene = game.scene.getScene('Race') as RaceScene;
    const world = scene.garageView;
    if (!world) throw new Error('Mundo da corrida ausente');
    return scene.simulation.participants.map((car, index) => {
      const vehicle = world.vehicles[index];
      const adapter = vehicle.userData.visualAdapter as VehicleVisualAdapter | undefined;
      if (!adapter) throw new Error(`Adaptador de rodas ausente: ${car.id}`);
      return { id: car.id, x: car.x, z: car.z, speed: car.speed,
        visualX: vehicle.position.x, visualZ: vehicle.position.z,
        independent: world.renderPoses[index] !== car,
        wheels: adapter.wheels.map(wheel => wheel.spin.rotation.x),
        source: String(vehicle.userData.source) };
    });
  });
  const before = await sample();
  expect(before).toHaveLength(4);
  expect(before.every(car => car.independent && car.source === 'vehicle-glb' && car.wheels.length === 4)).toBe(true);
  await expect(page.locator('#screen-status')).toContainText('Largada', { timeout: 20_000 });
  await page.keyboard.down('w');
  try {
    // Only observe the live Phaser loop: no manual start/advance or physics edits.
    await expect.poll(async () => (await sample()).every((car, index) =>
      car.speed > 4 && Math.hypot(car.x - before[index].x, car.z - before[index].z) > 2
      && Math.hypot(car.visualX - before[index].visualX, car.visualZ - before[index].visualZ) > 1
      && car.wheels.every((angle, wheel) => Math.abs(angle - before[index].wheels[wheel]) > 0.1)),
    { timeout: 20_000 }).toBe(true);
    const after = await sample();
    expect(after.every(car => car.independent)).toBe(true);
    await testInfo.attach('movimento-e-rodas', { body: JSON.stringify({ before, after }, null, 2), contentType: 'application/json' });
    await page.screenshot({ path: 'previews-ui/corrida-movimento-rodas-corrigidos.png' });
  } finally {
    await page.keyboard.up('w');
  }
});

test('sensação de velocidade: perseguição amplia FOV e acompanha drift, C mantém câmera isométrica', async ({ page }) => {
  // Preserve a deterministic visible loading state for the separate loading test.
  await page.route('**/assets/models/vehicles/*.glb', async route => {
    await new Promise(resolve => setTimeout(resolve, 350));
    await route.continue();
  });
  await openRace(page);
  await inspect(page, game => {
    const scene = game.scene.getScene('Race');
    scene.simulation.start();
    scene.simulationStarted = true as unknown as Dynamic;
    scene.lastSimulationTime = null as unknown as Dynamic;
  });
  const baseline = await inspect(page, game => {
    const rig = game.scene.getScene('Race').garageView.cameraRig;
    return { fov: rig.zoomFov, roll: rig.chaseRoll };
  });
  await page.keyboard.down('w');
  try {
    await expect.poll(() => inspect(page, game => {
      const scene = game.scene.getScene('Race'), rig = scene.garageView.cameraRig;
      const pose = rig.chase;
      return { speed: scene.simulation.participants[0].speed, fov: rig.zoomFov,
        roll: rig.chaseRoll, finite: pose.position.toArray().every(Number.isFinite) };
    }), { timeout: 8_000 }).toMatchObject({ finite: true });
    await expect.poll(() => inspect(page, game => Number(game.scene.getScene('Race').simulation.participants[0].speed)),
      { timeout: 8_000 }).toBeGreaterThan(15);
    const feedback = await inspect(page, game => {
      const scene = game.scene.getScene('Race'), rig = scene.garageView.cameraRig;
      return { speed: scene.simulation.participants[0].speed, lateralSpeed: scene.garageView.renderPoses[0].lateralSpeed,
        roll: rig.chaseRoll, fov: rig.zoomFov };
    });
    expect(feedback.fov).toBeGreaterThan(62.1);
    await page.screenshot({ path: 'previews-ui/dirigibilidade-chase-feedback.png' });
    await page.keyboard.press('c');
    await expect.poll(() => inspect(page, game => game.scene.getScene('Race').garageView.cameraRig.mode)).toBe('isometric');
    await expect.poll(() => inspect(page, game => game.scene.getScene('Race').garageView.cameraRig.transitioning)).toBe(false);
    await page.screenshot({ path: 'previews-ui/dirigibilidade-isometrica-feedback.png' });
    expect(baseline).toMatchObject({ fov: 62, roll: 0 });
  } finally {
    await page.keyboard.up('w');
  }
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
  await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada ausente');
    (await import(script.src)).game.menuMusic.toggle();
  });
  await expect.poll(() => inspect(page, game => game.scene.getScene('Race').engineAudio.diagnostics.silent)).toBe(true);
  await expect.poll(signal).toBeLessThan(0.0001);
  await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada ausente');
    (await import(script.src)).game.menuMusic.toggle();
  });
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
    if (response.ok() && response.url().endsWith('/assets/models/vehicles/thunder_bug.glb')) {
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
