import { test, expect } from '@playwright/test';
import { openMenu } from './helpers.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { RACE_TRACKS } from '../src/data/raceTracks.ts';
import { createChampionshipState, setSelections, beginChampionshipRace } from '../src/championship/championshipState.ts';
import { CHAMPIONSHIP_SAVE_KEY } from '../src/championship/championshipStorage.ts';
import type { ChampionshipState } from '../src/championship/championshipState.ts';

test('câmeras do Camaro exibem velocidade arcade sem mudar a física da corrida', async ({ page }) => {
  const trackId = 'neon-furnace';
  const state = setSelections({ ...createChampionshipState({ id: 'camaro-speed-feel', attemptId: 'camera-check' }),
    ownedVehicleIds: ['volt-vector'] }, { pilotId: CHARACTERS[0]!.id, vehicleId: 'volt-vector',
    paintId: 'inferno', difficultyId: 'normal' });
  const orderedTrackIds = [trackId, ...RACE_TRACKS.map(track => track.id).filter(id => id !== trackId)];
  const assignedState = { ...state, tracks: { ...state.tracks,
    remainingTrackIds: orderedTrackIds, pendingTrackId: trackId } } as ChampionshipState;
  const raceState = beginChampionshipRace(assignedState, 'camaro-speed-feel-race');
  await page.addInitScript(({ key, value }: { key: string; value: ChampionshipState }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: CHAMPIONSHIP_SAVE_KEY, value: raceState });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMenu(page);
  await page.evaluate(async () => {
    const entry = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!entry) throw new Error('Entrada do jogo ausente');
    const { game } = await import(entry.src);
    game.scene.getScenes(true)[0].scene.start('Race');
  });
  await expect.poll(() => page.evaluate(async () => {
    const entry = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!entry) return false;
    const { game } = await import(entry.src);
    const race = game.scene.getScene('Race');
    return race.ready && Boolean(race.garageView);
  }), { timeout: 90_000 }).toBe(true);

  const setView = async (mode: 'isometric' | 'chase') => page.evaluate(async requestedMode => {
    const entry = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!entry) throw new Error('Entrada do jogo ausente');
    const { game } = await import(entry.src);
    const race = game.scene.getScene('Race');
    const car = race.simulation.participants.find((participant: { isPlayer: boolean }) => participant.isPlayer);
    if (!car) throw new Error('Carro do jogador ausente');
    race.simulationStarted = false;
    race.simulation.advance = () => {};
    Object.assign(car.vehicle, { maxSpeed: 55 });
    car.speed = 55;
    car.velocityX = Math.sin(car.heading) * car.speed;
    car.velocityZ = Math.cos(car.heading) * car.speed;
    race.updateHud();
    const rig = race.garageView.cameraRig;
    rig.mode = requestedMode;
    rig.previousMode = requestedMode;
    rig.transitionElapsed = 2;
    rig.initialized = false;
    race.showCameraNotice();
    return { indicatedSpeed: race.speedValue.text, physicalSpeed: car.speed,
      physicalLimit: car.vehicle.maxSpeed };
  }, mode);

  const isometric = await setView('isometric');
  expect(isometric.indicatedSpeed).toBe('220');
  expect(isometric.physicalSpeed).toBe(55);
  expect(isometric.physicalLimit).toBe(55);
  await expect.poll(() => page.evaluate(async () => {
    const entry = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!;
    const { game } = await import(entry.src);
    return game.scene.getScene('Race').garageView.cameraPose.speed;
  })).toBeGreaterThan(54);
  await expect.poll(() => page.evaluate(async () => {
    const entry = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!;
    const { game } = await import(entry.src);
    return game.scene.getScene('Race').garageView.cameraRig.isometric.zoom;
  })).toBe(1);
  await page.locator('canvas.race-three-canvas').screenshot({ path: 'previews-ui/camaro-velocidade-isometrica.png' });

  const chase = await setView('chase');
  expect(chase.indicatedSpeed).toBe('220');
  expect(chase.physicalSpeed).toBe(55);
  await expect.poll(() => page.evaluate(async () => {
    const entry = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!;
    const { game } = await import(entry.src);
    return game.scene.getScene('Race').garageView.cameraRig.zoomFov;
  })).toBeGreaterThan(64.5);
  await page.locator('canvas.race-three-canvas').screenshot({ path: 'previews-ui/camaro-velocidade-terceira-pessoa.png' });
});
