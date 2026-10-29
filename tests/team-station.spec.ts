import { test, expect, openMenu, waitScene, clickObject } from './helpers.ts';
import type { Page } from '@playwright/test';

type Dynamic = { [key: string]: Dynamic; [key: number]: Dynamic; (...args: unknown[]): Dynamic };
import { CHARACTERS } from '../src/data/characters.ts';
import { createChampionshipState, setSelections, ensureAssignedTrack, beginChampionshipRace,
  applyChampionshipResult, acknowledgeChampionshipResult } from '../src/championship/championshipState.ts';
import { CHAMPIONSHIP_SAVE_KEY } from '../src/championship/championshipStorage.ts';
import type { ChampionshipState } from '../src/championship/championshipState.ts';

test.setTimeout(90_000);
const inspect = (page: Page, fn: (game: Dynamic) => unknown) => page.evaluate(async (source: string) => {
  const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]'); if (!script) throw new Error('Entrada ausente'); const { game } = await import(script.src);
  return new Function('game', `return (${source})(game)`)(game);
}, fn.toString());

function fixture(qualified = false) {
  let state = setSelections({ ...createChampionshipState({ id: 'station-fixture', attemptId: 'station-attempt' }),
    money: 53000, ownedVehicleIds: ['volt-vector'] }, {
    pilotId: CHARACTERS[0].id, vehicleId: 'volt-vector', paintId: 'inferno', difficultyId: 'normal',
  });
  const positions = qualified ? [1, 1, 1, 1, 1] : [1, 2, 3];
  for (const [index, position] of positions.entries()) {
    state = beginChampionshipRace(ensureAssignedTrack(state, () => 0.9), `station-race-${index}`);
    const pilots = CHARACTERS.slice(1, 4);
    pilots.splice(position - 1, 0, CHARACTERS[0]);
    const activeRace = state.activeRace;
    if (!activeRace) throw new Error('Corrida fixture não iniciada');
    state = applyChampionshipResult(state, { raceId: activeRace.id, trackId: activeRace.trackId,
      trackName: 'Pista isolada', difficultyId: 'normal', laps: 4, elapsedTime: 100,
       standings: pilots.map((pilot, i) => ({ id: pilot.id, name: pilot.name, position: (i + 1) as 1 | 2 | 3 | 4,
        isPlayer: pilot.id === CHARACTERS[0].id, finishTime: 90 + i, lapsCompleted: 4, paintColor: '#E53935' })) });
    state = acknowledgeChampionshipResult(state, `station-attempt-${index}`);
  }
  return state;
}
async function team(page: Page, qualified = false) {
  const seed = fixture(qualified);
  await page.addInitScript(({ key, seed }: { key: string; seed: ChampionshipState }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed));
  }, { key: CHAMPIONSHIP_SAVE_KEY, seed });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMenu(page); await page.keyboard.press('Enter'); await waitScene(page, 'RacePreparation');
  await expect.poll(() => inspect(page, game => {
    const scene = game.scene.getScene('RacePreparation');
    return !!scene.garageView && !!scene.rivalPreview && Number(scene.presentationCopies) > 0;
  }), { timeout: 30_000 }).toBe(true);
  return seed;
}

test('estação visual: molduras, retrato original e dados reais em desktop, celular e paisagem', async ({ page }) => {
  await page.setViewportSize({ width: 1664, height: 940 });
  const seed = await team(page);
  expect(await inspect(page, game => {
    const scene = game.scene.getScene('RacePreparation');
    return { portrait: scene.rivalPortrait.texture.key, name: scene.rivalName.text,
      pilot: scene.pilotPortrait.texture.key, fields: scene.campaignFields.map((item: Dynamic) => item.value.text),
      eraseOnCanvas: !!scene.eraseButton, errors: game.garageResources.modelFailures };
  })).toEqual({ portrait: 'rival-opening-ferro', name: 'RAVIK FERRO', pilot: `pilot-${CHARACTERS[0].id}`,
    fields: [`$ ${seed.money.toLocaleString('pt-BR')}`, 'B', '3 DE 8', '1.400', '540'], eraseOnCanvas: false, errors: [] });
  for (const [name, viewport] of [['desktop', { width: 1664, height: 940 }],
    ['mobile', { width: 390, height: 844 }], ['paisagem', { width: 844, height: 390 }]] as Array<[string, { width: number; height: number }]>) {
    await page.setViewportSize(viewport);
    await expect.poll(() => inspect(page, game => {
      const scene = game.scene.getScene('RacePreparation');
       const bounds = [scene.pilotPanel, scene.rivalPanel, scene.campaign, scene.preview, scene.rivalVehicle,
         ...(scene.modules as unknown as Dynamic[]), scene.startButton].map(object => object.getBounds() as unknown as { left: number; right: number; top: number; bottom: number });
       return bounds.every(box => box.left >= 0 && box.right <= Number(game.scale.width) + 1
         && box.top >= 0 && box.bottom <= Number(game.scale.height) - 40);
    })).toBe(true);
    await page.screenshot({ path: `previews-ui/estacao-equipe-${name}.png` });
  }
  await page.setViewportSize({ width: 1664, height: 940 });
  await clickObject(page, 'modules', 3);
  await waitScene(page, 'VehicleSelection');
  expect(await page.locator('#station-settings-button').count()).toBe(0);
  expect(await page.locator('#station-settings-dialog').count()).toBe(0);
});

test('configurações da equipe: engrenagem, foco, som e prêmio preservam a carreira', async ({ page }) => {
  await team(page, true);
  const before = await inspect(page, game => ({ state: game.championship.state,
    raw: localStorage.getItem('riffshot-racing:championship:v1') }));
  const gear = page.getByRole('button', { name: 'Configurações', exact: true });
  expect((await gear.textContent() ?? '').trim()).toBe('');
  await page.locator('canvas').focus();
  await page.keyboard.press('Tab');
  await expect(gear).toHaveAttribute('data-keyboard-selected', 'true');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'CONFIGURAÇÕES', exact: true });
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole('button', { name: 'FECHAR', exact: true });
  const erase = dialog.getByRole('button', { name: 'APAGAR PROGRESSO', exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: /SOM:/ })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(close).toBeFocused();
  const muted = await inspect(page, game => game.menuMusic.muted);
  await page.keyboard.press('m');
  expect(await inspect(page, game => game.menuMusic.muted)).toBe(!muted);
  await dialog.getByRole('button', { name: /SOM:/ }).click();
  expect(await inspect(page, game => game.menuMusic.muted)).toBe(muted);
  await expect(erase).toBeVisible();
  await page.screenshot({ path: 'previews-ui/estacao-configuracoes-desktop.png' });
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); await expect(gear).toBeFocused();
  // Enter on the icon opens settings, never the race or the destructive action.
  await page.keyboard.press('Enter'); await expect(dialog).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'previews-ui/estacao-configuracoes-mobile.png' });
  await close.click();
  expect(await inspect(page, game => ({ state: game.championship.state,
    raw: localStorage.getItem('riffshot-racing:championship:v1') }))).toEqual(before);
  await page.locator('canvas').focus();
  await clickObject(page, 'rewardButton'); await waitScene(page, 'RivalReward');
  expect(await page.locator('#station-settings-button').count()).toBe(0);
});
