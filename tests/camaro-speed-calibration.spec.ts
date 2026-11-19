import { test, expect, openMenu, waitScene } from './helpers.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { VEHICLE_TUNING } from '../src/data/vehicles.ts';
import { RACE_TRACKS } from '../src/data/raceTracks.ts';
import { createChampionshipState, setSelections, acknowledgeChampionshipResult,
  ensureAssignedTrack, beginChampionshipRace, applyChampionshipResult } from '../src/championship/championshipState.ts';
import { CHAMPIONSHIP_SAVE_KEY } from '../src/championship/championshipStorage.ts';
import type { ChampionshipState } from '../src/championship/championshipState.ts';

type Dynamic = { [key: string]: Dynamic; [key: number]: Dynamic; (...args: unknown[]): Dynamic };
type CalibrationMeasurement = {
  speedPoints: number; accelerationPoints: number; physicalCapKmh: number;
  accelerationUnitsPerSecondSquared: number; poweredDragPerSecond: number;
  timeToLimitSeconds: number; speedAtTenSecondsKmh: number; reachedLimit: boolean;
};

function devFixture(): ChampionshipState {
  let state = setSelections({ ...createChampionshipState({ id: 'camaro-speed-calibration', attemptId: 'camaro-calibration' }),
    ownedVehicleIds: ['volt-vector'] }, { pilotId: CHARACTERS[0]!.id, vehicleId: 'volt-vector',
    paintId: 'inferno', difficultyId: 'normal' });
  for (let index = 0; index < 3; index += 1) {
    state = beginChampionshipRace(ensureAssignedTrack(state, () => 0.99), `camaro-calibration-race-${index}`);
    const race = state.activeRace;
    if (!race) throw new Error('Corrida de preparação do Modo DEV não iniciada');
    const pilots = [CHARACTERS[0]!, ...CHARACTERS.slice(1, 4)];
    state = applyChampionshipResult(state, { raceId: race.id, trackId: race.trackId, trackName: 'FIXTURE',
      difficultyId: 'normal', laps: 4, elapsedTime: 100, standings: pilots.map((pilot, pilotIndex) => ({
        id: pilot.id, name: pilot.name, isPlayer: pilot.id === CHARACTERS[0]!.id,
        position: (pilotIndex + 1) as 1 | 2 | 3 | 4, finishTime: 90 + pilotIndex,
        lapsCompleted: 4, paintColor: '#E53935',
      })) });
    state = acknowledgeChampionshipResult(state, `camaro-calibration-ack-${index}`);
  }
  return state;
}

test('Modo DEV mede as nove combinações do Camaro sem salvar tuning', async ({ page }) => {
  test.setTimeout(150_000);
  const state = devFixture();
  await page.addInitScript(({ key, value }: { key: string; value: ChampionshipState }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: CHAMPIONSHIP_SAVE_KEY, value: state });

  const saveRequests: string[] = [];
  await page.route('**/__riffshot_dev/vehicle-tuning/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/auth')) {
      const body = route.request().postDataJSON() as { password?: string };
      if (body.password !== 'fixture-only-pin') {
        await route.fulfill({ status: 401, json: { error: 'invalid-password' } }); return;
      }
      await route.fulfill({ json: { token: 'fixture-session-token', vehicles: VEHICLE_TUNING } }); return;
    }
    if (pathname.endsWith('/save')) {
      saveRequests.push(pathname);
      await route.fulfill({ json: { saved: true } }); return;
    }
    if (pathname.endsWith('/logout')) { await route.fulfill({ json: { loggedOut: true } }); return; }
    await route.fulfill({ status: 404, json: { error: 'not-found' } });
  });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMenu(page);
  await page.keyboard.press('Enter');
  await waitScene(page, 'RacePreparation');
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'CONFIGURAÇÕES', exact: true });
  await settings.getByRole('button', { name: 'MODO DESENVOLVEDOR / ATRIBUTOS DOS CARROS' }).click();
  const editor = page.getByRole('dialog', { name: 'PAINEL DO MODO DESENVOLVEDOR' });
  await editor.getByLabel('Senha local').fill('fixture-only-pin');
  await editor.getByRole('button', { name: 'DESBLOQUEAR E CARREGAR ATRIBUTOS' }).click();
  await expect(editor.getByRole('spinbutton', { name: 'CAMARO / Velocidade' })).toBeVisible();
  const championshipSaveBefore = await page.evaluate(key => localStorage.getItem(key), CHAMPIONSHIP_SAVE_KEY);
  const measurements: CalibrationMeasurement[] = [];

  for (const speedPoints of [0, 50, 100]) for (const accelerationPoints of [0, 50, 100]) {
    await editor.getByRole('spinbutton', { name: 'CAMARO / Velocidade' }).fill(String(speedPoints));
    await editor.getByRole('spinbutton', { name: 'CAMARO / Aceleração' }).fill(String(accelerationPoints));
    const measured = await page.evaluate(async ({ speedPoints, accelerationPoints }) => {
      const raceUrl = new URL('/src/race/RaceSimulation.ts', location.origin).href;
      const tracksUrl = new URL('/src/data/raceTracks.ts', location.origin).href;
      const vehiclesUrl = new URL('/src/data/vehicles.ts', location.origin).href;
      const [{ RaceSimulation }, { RACE_TRACKS }, { VEHICLE_TUNING, getVehicleById }] = await Promise.all([
        import(raceUrl), import(tracksUrl), import(vehiclesUrl),
      ]);
      const source = RACE_TRACKS[0];
      const testTrack = { ...source, width: 10_000, laps: 1_000,
        waypoints: source.waypoints.map((point: Dynamic) => ({ ...point, y: 0 })),
        jumps: [], rampRegions: [], rampCount: 0 };
      const vehicle = getVehicleById('volt-vector');
      const tuning = { ...VEHICLE_TUNING['volt-vector'], speed: speedPoints, acceleration: accelerationPoints };
      const bots = [0, 1, 2].map(index => ({ id: `dev-bot-${index}`, name: `Bot ${index}` }));
      const race = new RaceSimulation({ track: testTrack, laps: 1_000,
        player: { id: 'dev-camaro', name: 'Camaro' }, playerVehicle: vehicle,
        vehicleStats: tuning, botPilots: bots }).start();
      race.setVehicleContactsEnabled(false);
      const car = race.participants[0];
      let frames = 0;
      let speedAtTenSeconds = 0;
      while (car.speed < car.vehicle.maxSpeed - 1e-5 && frames < 60 * 90) {
        race.advance(1000 / 60, { throttle: 1 });
        frames += 1;
        if (frames === 600) speedAtTenSeconds = car.speed * 4;
      }
      return { speedPoints, accelerationPoints, physicalCapKmh: car.vehicle.maxSpeed * 4,
        accelerationUnitsPerSecondSquared: car.vehicle.acceleration,
        poweredDragPerSecond: car.vehicle.poweredDrag,
        timeToLimitSeconds: frames / 60, speedAtTenSecondsKmh: speedAtTenSeconds,
        reachedLimit: car.speed >= car.vehicle.maxSpeed - 1e-5 };
    }, { speedPoints, accelerationPoints });
    expect(measured.reachedLimit).toBe(true);
    expect(measured.physicalCapKmh).toBeCloseTo(110 + speedPoints * 1.1, 8);
    measurements.push(measured);
  }

  const maximumSpeedTargets = [0, 50, 100].map(accelerationPoints =>
    measurements.find(item => item.speedPoints === 100 && item.accelerationPoints === accelerationPoints)!.timeToLimitSeconds);
  expect(maximumSpeedTargets[0]).toBeCloseTo(7, 1);
  expect(maximumSpeedTargets[1]).toBeCloseTo(5.5, 1);
  expect(maximumSpeedTargets[2]).toBeCloseTo(4, 1);
  expect(await page.evaluate(key => localStorage.getItem(key), CHAMPIONSHIP_SAVE_KEY)).toBe(championshipSaveBefore);
  expect(saveRequests).toEqual([]);
});
