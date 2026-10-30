import { test, expect, openMenu, waitScene } from './helpers.ts';
import type { Page } from '@playwright/test';
import type { RaceScene } from '../src/scenes/RaceScene.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { createChampionshipState, setSelections, ensureAssignedTrack, beginChampionshipRace } from '../src/championship/championshipState.ts';
import { CHAMPIONSHIP_SAVE_KEY } from '../src/championship/championshipStorage.ts';

const inspect = <T>(page: Page, fn: (scene: RaceScene) => T) => page.evaluate(async source => {
  const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
  if (!script) throw new Error('Entrada ausente');
  const { game } = await import(script.src);
  return new Function('scene', `return (${source})(scene)`)(game.scene.getScene('Race')) as T;
}, fn.toString());

async function openCannonRace(page: Page) {
  const state = beginChampionshipRace(ensureAssignedTrack(setSelections({
    ...createChampionshipState({ id: 'cannon-test', attemptId: 'cannon-attempt' }), ownedVehicleIds: ['rift-blaze'],
  }, { pilotId: CHARACTERS[3].id, vehicleId: 'rift-blaze', paintId: 'inferno', difficultyId: 'hard' }), () => 0.99), 'cannon-race');
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
}

test('canhão Forja: boca no rival, projétil fixo, acerto retira uma bolinha e efeitos são descartados', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  await openCannonRace(page);
  await inspect(page, scene => {
    scene.simulationStarted = true;
    scene.countdownLabel.setVisible(false);
    const world = scene.garageView!;
    world.setCameraFrozen(true);
    const car = scene.simulation.participants[1];
    const sin = Math.sin(car.heading), cos = Math.cos(car.heading);
    world.camera.position.set(car.x + cos * 5 - sin * 1, car.y + 2.6, car.z - sin * 5 - cos * 1);
    world.camera.lookAt(car.x, car.y + 0.8, car.z);
  });
  await page.screenshot({ path: 'previews-ui/rival-canhao-inspecao.png' });
  const model = await inspect(page, scene => ({ id: scene.simulation.participants[1].id,
    size: scene.garageView!.vehicles[1].userData.size.toArray() }));
  await testInfo.attach('modelo-rival', { body: JSON.stringify(model), contentType: 'application/json' });
  expect(model.id).toBe('ravik-ferro');
  const shot = await inspect(page, async scene => {
    const { sampleTrackAtProgress } = await import(new URL('/src/race/RaceSimulation.ts', location.origin).href);
    scene.scene.pause();
    const sim = scene.simulation, world = scene.garageView!;
    sim.setVehicleContactsEnabled(false);
    for (const other of sim.participants.slice(2)) other.finished = true;
    const rival = sim.participants[1], player = sim.participants[0];
    for (const [car, distance] of [[rival, 10], [player, 23]] as const) {
      const point = sampleTrackAtProgress(sim.track, distance);
      Object.assign(car, { x: point.x, y: point.y, z: point.z, heading: Math.atan2(point.tangentX, point.tangentZ) });
      sim._resetMotion(car);
    }
    sim.start();
    sim._step(1 / 60, { throttle: 0, brake: 0, steer: 0, handbrake: 0 });
    world.setParticipants(sim.participants, (car, output) => sim.getVisualTelemetry(car, sim.getRenderPose(car, 1, output)));
    world.setCannon(sim.cannon, sim.elapsedTime, 1);
    const sin = Math.sin(rival.heading), cos = Math.cos(rival.heading);
    world.camera.position.set(rival.x + cos * 12 + sin * 6, rival.y + 6.8, rival.z - sin * 12 + cos * 6);
    world.camera.lookAt(rival.x + sin * 6, rival.y + 0.8, rival.z + cos * 6);
    world.update(16.667);
    return { ammo: sim.cannon.ammo, shots: world.cannonEffects.shotCount,
      projectileCount: world.cannonEffects.projectileCount, hp: player.health,
      physicsPosition: { x: player.x, z: player.z } };
  });
  expect(shot.ammo).toBe(4);
  expect(shot.shots).toBe(1);
  expect(shot.projectileCount).toBe(1);
  await page.screenshot({ path: 'previews-ui/rival-forja-disparo.png' });
  const flight = await inspect(page, scene => {
    const sim = scene.simulation, world = scene.garageView!;
    for (let i = 0; i < 5; i++) sim._step(1 / 60, { throttle: 0, brake: 0, steer: 0, handbrake: 0 });
    world.setParticipants(sim.participants, (car, output) => sim.getVisualTelemetry(car, sim.getRenderPose(car, 1, output)));
    world.setCannon(sim.cannon, sim.elapsedTime, 1);
    world.update(1000 / 12);
    const shell = sim.cannon.projectiles.find(shell => shell.active)!;
    return { dir: [shell.dirX, shell.dirZ], distance: shell.distance, active: world.cannonEffects.projectileCount };
  });
  expect(flight.active).toBe(1);
  expect(flight.distance).toBeGreaterThan(5);
  await page.screenshot({ path: 'previews-ui/rival-forja-projetil.png' });
  const hit = await inspect(page, scene => {
    const sim = scene.simulation, world = scene.garageView!, player = sim.participants[0];
    for (let i = 0; i < 30 && !player.shotImpactSequence; i++) {
      sim._step(1 / 60, { throttle: 0, brake: 0, steer: 0, handbrake: 0 });
    }
    world.setParticipants(sim.participants, (car, output) => sim.getVisualTelemetry(car, sim.getRenderPose(car, 1, output)));
    world.setCannon(sim.cannon, sim.elapsedTime, 1);
    world.update(16.667);
    scene.updateHud();
    return { hp: player.health, impactSequence: player.shotImpactSequence,
      impacts: world.cannonEffects.impactCount, speed: player.speed, hud: scene.vehicleStatus.text,
      activeShells: sim.cannon.projectiles.filter(shell => shell.active).length };
  });
  expect(hit.hp).toBe(shot.hp - 20);
  expect(hit.impactSequence).toBe(1);
  expect(hit.impacts).toBe(1);
  expect(hit.speed).toBeGreaterThan(0);
  expect(hit.hud).toContain('VIDA 3/4');
  expect(hit.activeShells).toBe(0);
  await page.screenshot({ path: 'previews-ui/rival-forja-impacto.png' });
  const expired = await inspect(page, scene => {
    const world = scene.garageView!, sim = scene.simulation;
    sim.participants[1].finished = true;
    for (let i = 0; i < 100; i++) sim._step(1 / 60, { throttle: 0, brake: 0, steer: 0, handbrake: 0 });
    world.setCannon(sim.cannon, sim.elapsedTime, 1);
    world.update(1700);
    const active = world.cannonEffects.activeCount;
    const root = world.cannonEffects.root;
    world.cannonEffects.destroy();
    return { active, detached: root.parent === null };
  });
  expect(expired).toEqual({ active: 0, detached: true });
  await testInfo.attach('combate-real', { body: JSON.stringify({ shot, flight, hit, expired }), contentType: 'application/json' });
});

test('canhão no loop real: largada, IA dispara sozinha, HUD perde uma bolinha e render recebe impacto', async ({ page }) => {
  test.setTimeout(120_000);
  await openCannonRace(page);
  const health = await inspect(page, async scene => {
    const { sampleTrackAtProgress } = await import(new URL('/src/race/RaceSimulation.ts', location.origin).href);
    const sim = scene.simulation;
    scene.countdownElapsed = 0;
    sim.setVehicleContactsEnabled(false);
    for (const other of sim.participants.slice(2)) other.finished = true;
    for (const [car, distance] of [[sim.participants[1], 10], [sim.participants[0], 23]] as const) {
      const point = sampleTrackAtProgress(sim.track, distance);
      Object.assign(car, { x: point.x, y: point.y, z: point.z, heading: Math.atan2(point.tangentX, point.tangentZ) });
      sim._resetMotion(car);
    }
    return sim.participants[0].health;
  });
  // No manual step, start or effect update: the scene runs the full integration.
  await expect(page.locator('#screen-status')).toContainText('Largada', { timeout: 20_000 });
  await expect.poll(() => inspect(page, scene => scene.garageView!.cannonEffects.impactCount), { timeout: 10_000 }).toBeGreaterThan(0);
  await expect.poll(() => inspect(page, scene => scene.vehicleStatus.text)).not.toContain('VIDA 4/4');
  const hit = await inspect(page, scene => ({ health: scene.simulation.participants[0].health,
    hits: scene.simulation.participants[0].shotImpactSequence ?? 0,
    shots: scene.garageView!.cannonEffects.shotCount, hud: scene.vehicleStatus.text }));
  expect(hit.hits).toBeGreaterThan(0);
  expect(health - hit.health).toBe(hit.hits * 20);
  expect(hit.shots).toBeGreaterThan(0);
  expect(hit.hud).not.toContain('VIDA 4/4');
  const sound = await inspect(page, scene => scene.effectsAudio.diagnostics);
  expect(sound.shots).toBeGreaterThan(0);
  expect(sound.impacts).toBeGreaterThan(0);
  expect(sound.errorCount).toBe(0);
  expect(sound.decodedSamples).toBe(3);
  expect(sound.sampleStatus).toBe('ready');
  expect(sound.sampleSources.shot).toBe('/__local-audio/canhao_disparo_windowmaker.mp3');
  expect(sound.sampleSources.hit).toBe('/__local-audio/impacto_disparo.mp3');
  const publicCredits = await page.request.get('http://127.0.0.1:4183/credits.html');
  expect(publicCredits.ok()).toBe(true);
  const creditsHtml = await publicCredits.text();
  expect(creditsHtml).toContain('autoria, a origem e a licença ainda não foram confirmadas');
  for (const localFile of ['canhão_disparo_windowmaker.mp3', 'impacto_disparo.mp3', 'pneu_derrapando.mp3', '/__local-audio/']) {
    expect(creditsHtml).not.toContain(localFile);
  }
  await page.keyboard.press('Escape');
  await waitScene(page, 'RacePreparation');
});
