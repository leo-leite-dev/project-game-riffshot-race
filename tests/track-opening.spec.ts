import { test, expect, openMenu, waitScene, clickObject } from './helpers.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { createChampionshipState, setSelections, ensureAssignedTrack } from '../src/championship/championshipState.ts';
import { CHAMPIONSHIP_SAVE_KEY } from '../src/championship/championshipStorage.ts';
import { OPENING_RACE_TRACK_ID } from '../src/data/raceTracks.ts';

test('uma campanha nova inicia a primeira corrida em NEON FURNACE', async ({ page }) => {
  const trackAssetRequests: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/assets/models/') && !path.startsWith('/assets/models/vehicles/')) {
      trackAssetRequests.push(request.url());
    }
  });
  const save = ensureAssignedTrack(setSelections({
    ...createChampionshipState({ id: 'opening-track-fixture', attemptId: 'opening-track-attempt' }),
    ownedVehicleIds: ['rift-blaze'],
  }, {
    pilotId: CHARACTERS[0].id, vehicleId: 'rift-blaze', paintId: 'inferno', difficultyId: 'normal',
  }), () => 0.99);
  expect(save.tracks.pendingTrackId).toBe('neon-furnace');
  expect(OPENING_RACE_TRACK_ID).toBe('neon-furnace');
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: CHAMPIONSHIP_SAVE_KEY, value: save });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMenu(page);
  await page.keyboard.press('Enter');
  await waitScene(page, 'RacePreparation');
  await clickObject(page, 'startButton');
  await waitScene(page, 'RaceTrackSelection');
  await expect(page.locator('#screen-status')).toContainText('NEON FURNACE');
  await clickObject(page, 'startButton');
  await waitScene(page, 'Race');
  await expect.poll(() => page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) return false;
    const { game } = await import(script.src);
    const scene = game.scene.getScene('Race');
    return scene.ready && scene.track.id === 'neon-furnace';
  }), { timeout: 75_000 }).toBe(true);
  expect(trackAssetRequests).toEqual([]);
  await page.screenshot({ path: 'previews-ui/primeira-corrida-neon-furnace.png' });
});
