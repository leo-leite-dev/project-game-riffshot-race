import type { Page } from '@playwright/test';
import { test, expect, openMenu, waitScene, clickObject } from './helpers.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { createChampionshipState, ensureAssignedTrack, setSelections } from '../src/championship/championshipState.ts';
import { CHAMPIONSHIP_SAVE_KEY } from '../src/championship/championshipStorage.ts';

interface RaceSnapshot {
  ready: boolean;
  mode: string | null;
  transitioning: boolean;
  zoomSettled: boolean;
  modelFailures: string[];
}

async function raceSnapshot(page: Page): Promise<RaceSnapshot> {
  return page.evaluate(async () => {
    // Vite serves the development entry at this URL; keep the import in the browser.
    const entry = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!entry) throw new Error('Entrada Vite não encontrada');
    interface GameView {
      game: {
        scene: { getScene(key: string): {
          ready?: boolean;
          garageView?: { cameraRig: { mode: string; transitioning: boolean; zoomLevel: number; zoomIndex: number } };
        } };
        garageResources?: { modelFailures: string[] };
      };
    }
    const load = new Function('url', 'return import(url)') as (url: string) => Promise<GameView>;
    const { game } = await load(entry.src);
    const scene = game.scene.getScene('Race');
    const rig = scene.garageView?.cameraRig;
    return {
      ready: Boolean(scene.ready), mode: rig?.mode ?? null,
      transitioning: rig?.transitioning ?? true,
      zoomSettled: rig ? Math.abs(rig.zoomLevel - rig.zoomIndex) < 0.002 : false,
      modelFailures: game.garageResources?.modelFailures ?? [],
    };
  });
}

async function selectionReady(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const entry = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!entry) throw new Error('Entrada Vite não encontrada');
    const load = new Function('url', 'return import(url)') as (url: string) => Promise<{
      game: { scene: { getScene(key: string): { garageView?: object; loadingLabel?: { text: string } } } };
    }>;
    const { game } = await load(entry.src);
    const scene = game.scene.getScene('VehicleSelection');
    return Boolean(scene.garageView && scene.loadingLabel?.text.includes('OFICINA ONLINE'));
  });
}

test('capturas da migração: menu, seleção e duas câmeras', async ({ page }) => {
  const seed = ensureAssignedTrack(setSelections({
    ...createChampionshipState({ id: 'migration-isolated', attemptId: 'migration-attempt' }),
    ownedVehicleIds: ['rift-blaze'],
  }, {
    pilotId: CHARACTERS[0].id, vehicleId: 'rift-blaze', paintId: 'inferno', difficultyId: 'normal',
  }), () => 0.99);
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: CHAMPIONSHIP_SAVE_KEY, value: seed,
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMenu(page);
  await page.screenshot({ path: 'previews-ui/migration-menu.png' });

  await page.keyboard.press('Enter');
  await waitScene(page, 'RacePreparation');
  await clickObject(page, 'modules', 3);
  await waitScene(page, 'VehicleSelection');
  await expect.poll(() => selectionReady(page), { timeout: 90_000 }).toBe(true);
  await page.screenshot({ path: 'previews-ui/migration-selecao.png' });

  await page.keyboard.press('Escape');
  await waitScene(page, 'RacePreparation');
  await clickObject(page, 'startButton');
  await waitScene(page, 'RaceTrackSelection');
  await clickObject(page, 'startButton');
  await waitScene(page, 'Race');
  await expect.poll(async () => (await raceSnapshot(page)).ready, { timeout: 90_000 }).toBe(true);
  await expect.poll(async () => {
    const race = await raceSnapshot(page);
    return race.mode === 'chase' && !race.transitioning && race.zoomSettled;
  }, { timeout: 30_000 }).toBe(true);
  expect((await raceSnapshot(page)).modelFailures).toEqual([]);
  await page.screenshot({ path: 'previews-ui/migration-terceira-pessoa.png' });

  await page.keyboard.press('c');
  await expect.poll(async () => {
    const race = await raceSnapshot(page);
    return race.mode === 'isometric' && !race.transitioning;
  }, { timeout: 30_000 }).toBe(true);
  await page.screenshot({ path: 'previews-ui/migration-isometrica.png' });
});
