import { test, expect } from '@playwright/test';
import { openMenu } from './helpers.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { RACE_TRACKS } from '../src/data/raceTracks.ts';
import { createChampionshipState, setSelections, beginChampionshipRace } from '../src/championship/championshipState.ts';
import { CHAMPIONSHIP_SAVE_KEY } from '../src/championship/championshipStorage.ts';
import type { ChampionshipState } from '../src/championship/championshipState.ts';

type Dynamic = { [key: string]: Dynamic; [key: number]: Dynamic; (...args: unknown[]): Dynamic };

const cameraViews = [
  { name: 'isometrica-curva-baixa', mode: 'isometric', speed: 5, place: 'curve', airborne: false, acceleration: 0 },
  { name: 'isometrica-curva-alta', mode: 'isometric', speed: 35, place: 'curve', airborne: false, acceleration: 0 },
  { name: 'terceira-pessoa-rampa-baixa', mode: 'chase', speed: 6, place: 'approach', airborne: false, acceleration: 2 },
  { name: 'terceira-pessoa-rampa-media', mode: 'chase', speed: 18, place: 'second-ramp', airborne: false, acceleration: 3 },
  { name: 'terceira-pessoa-salto-alta', mode: 'chase', speed: 35, place: 'airborne', airborne: true, acceleration: 0 },
  { name: 'terceira-pessoa-aterrissagem', mode: 'chase', speed: 18, place: 'landing', airborne: false, acceleration: -5 },
] as const;

test('câmeras de velocidade preservam o enquadramento em curvas, rampas, voo e pouso', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const trackId = 'neon-furnace';
  const initialState = createChampionshipState({ id: `camera-speed-${trackId}`, attemptId: 'camera-speed-attempt' });
  const state = setSelections({ ...initialState, ownedVehicleIds: ['rift-blaze'] }, {
    pilotId: CHARACTERS[0]!.id, vehicleId: 'rift-blaze', paintId: 'inferno', difficultyId: 'normal',
  });
  const orderedTrackIds = [trackId, ...RACE_TRACKS.map(track => track.id).filter(id => id !== trackId)];
  const assignedState = { ...state, tracks: { ...state.tracks,
    remainingTrackIds: orderedTrackIds, pendingTrackId: trackId } } as ChampionshipState;
  const raceState = beginChampionshipRace(assignedState, `camera-speed-${trackId}-race`);
  await page.addInitScript(({ key, value }: { key: string; value: ChampionshipState }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: CHAMPIONSHIP_SAVE_KEY, value: raceState });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMenu(page);
  await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada do jogo ausente');
    const { game } = await import(script.src);
    game.scene.getScenes(true)[0].scene.start('Race');
  });
  await expect.poll(() => page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada do jogo ausente');
    const { game } = await import(script.src);
    const race = game.scene.getScene('Race');
    return race.ready && game.scene.isActive('Race');
  }), { timeout: 90_000 }).toBe(true);

  const fovs: number[] = [];
  for (const view of cameraViews) {
    const cameraState = await page.evaluate(async scenario => {
      const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
      if (!script) throw new Error('Entrada do jogo ausente');
      const { game } = await import(script.src);
      const trackMathUrl = new URL('/src/race/trackMath.ts', location.origin).href;
      const { sampleTrackAtProgress, sampleTrackSurface } = await import(trackMathUrl);
      const race = game.scene.getScene('Race');
      const track = race.simulation.track;
      const ramp = track.jumps.find((candidate: Dynamic) => String(candidate.id) === 'furnace-ramp-04');
      if (!ramp) throw new Error('Rampa 04 ausente');
      const takeoff = Number(ramp.takeoff) * Number(track.totalLength);
      let distance = takeoff - Number(ramp.rampLength) * 0.5;
      if (scenario.place === 'second-ramp')
        distance = takeoff + Number(ramp.firstPlatformLength) + Number(ramp.gapLength)
          + Number(ramp.secondRampLength) * 0.5;
      else if (scenario.place === 'airborne')
        distance = takeoff + Number(ramp.firstPlatformLength) + Number(ramp.gapLength)
          + Number(ramp.secondRampLength) * 0.45;
      else if (scenario.place === 'landing')
        distance = takeoff + Number(ramp.firstPlatformLength) + Number(ramp.gapLength)
          + Number(ramp.secondRampLength) + Number(ramp.secondPlatformLength) * 0.4;
      if (scenario.place === 'curve') {
        const points = track.points as Dynamic[];
        const halfWindow = 4;
        let largestTurn = 0;
        for (let index = halfWindow; index < points.length - halfWindow; index += 1) {
          const before = points[index - halfWindow];
          const after = points[index + halfWindow];
          const cross = Number(before.tangentX) * Number(after.tangentZ)
            - Number(before.tangentZ) * Number(after.tangentX);
          const dot = Number(before.tangentX) * Number(after.tangentX)
            + Number(before.tangentZ) * Number(after.tangentZ);
          const turn = Math.abs(Math.atan2(cross, dot));
          if (turn > largestTurn) { largestTurn = turn; distance = Number(points[index].distance); }
        }
      }
      const point = sampleTrackAtProgress(track, distance);
      const surface = sampleTrackSurface(track, track.jumps, distance);
      const car = race.simulation.participants[0];
      car.x = point.x; car.z = point.z;
      car.y = surface.y + (scenario.airborne ? 1.6 : 0);
      car.heading = Math.atan2(point.tangentX, point.tangentZ);
      car.speed = scenario.speed;
      car.airborne = scenario.airborne;
      car.verticalVelocity = scenario.airborne ? 2.5 : 0;
      car._activeJumpId = scenario.airborne ? ramp.id : null;
      car._airborneElapsed = scenario.airborne ? 0.25 : 0;
      car._lastPathDistance = distance; car._distance = distance;
      car._renderPreviousX = car.x; car._renderPreviousY = car.y; car._renderPreviousZ = car.z;
      car._renderPreviousHeading = car.heading; car._renderPreviousSpeed = car.speed;
      car._visualAcceleration = scenario.acceleration;
      car._visualPreviousAcceleration = scenario.acceleration;

      const rig = race.garageView.cameraRig;
      rig.mode = scenario.mode;
      rig.previousMode = scenario.mode;
      rig.transitionElapsed = 2;
      rig.initialized = false;
      rig.zoomIndex = 0; rig.zoomLevel = 0;
      rig.speedFovOffset = 0; rig.accelerationLag = 0;
      race.simulationStarted = false;
      race.showCameraNotice();
      race.garageView.setCameraFrozen(true);
      const playerPose = race.simulation.getVisualTelemetry(car, race.simulation.getRenderPose(car));
      for (let frame = 0; frame < 45; frame += 1) rig.update(playerPose, 1 / 60);
      race.garageView.setParticipants(race.simulation.participants, (participant: Dynamic, output: Dynamic) => {
        const pose = race.simulation.getRenderPose(participant, undefined, output);
        return race.simulation.getVisualTelemetry(participant, pose);
      });
      race.garageView.update(16.67);
      return { mode: rig.mode, speedFov: rig.zoomFov,
        isOrthographic: race.garageView.camera.isOrthographicCamera,
        speed: car.speed, accelerationLag: rig.accelerationLag };
    }, view);
    expect(cameraState.mode).toBe(view.mode);
    expect(cameraState.speed).toBe(view.speed);
    expect(cameraState.isOrthographic).toBe(view.mode === 'isometric');
    if (view.mode === 'chase' && view.speed >= 18) expect(cameraState.speedFov).toBeGreaterThan(62);
    if (view.mode === 'chase' && view.acceleration !== 0)
      expect(Math.abs(cameraState.accelerationLag)).toBeGreaterThan(1);
    if (view.mode === 'chase') fovs.push(cameraState.speedFov);
    await page.locator('canvas.race-three-canvas').screenshot({
      path: `previews-ui/riffshot-velocidade-${view.name}.png`,
    });
  }
  expect(fovs[0]).toBeLessThan(fovs[1]!);
  expect(pageErrors).toEqual([]);
});
