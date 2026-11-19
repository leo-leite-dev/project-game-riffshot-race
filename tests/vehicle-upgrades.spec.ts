import { test, expect, openMenu, waitScene, clickObject } from './helpers.ts';
import type { Page } from '@playwright/test';
import { CHARACTERS } from '../src/data/characters.ts';
import { createChampionshipState, setSelections } from '../src/championship/championshipState.ts';
import { CHAMPIONSHIP_SAVE_KEY } from '../src/championship/championshipStorage.ts';
import type { ChampionshipState } from '../src/championship/championshipState.ts';

type Dynamic = { [key: string]: Dynamic; [key: number]: Dynamic; (...args: unknown[]): Dynamic };
const inspect = (page: Page, fn: (game: Dynamic) => unknown) => page.evaluate(async (source: string) => {
  const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
  if (!script) throw new Error('Entrada do jogo ausente');
  const { game } = await import(script.src);
  return new Function('game', `return (${source})(game)`)(game);
}, fn.toString());

function careerFixture(): ChampionshipState {
  const start = { ...createChampionshipState({ id: 'upgrade-ui-career', attemptId: 'upgrade-ui-attempt' }),
    money: 2100, ownedVehicleIds: ['volt-vector'] };
  return setSelections(start, { pilotId: CHARACTERS[0].id, vehicleId: 'volt-vector',
    paintId: 'inferno', difficultyId: 'normal' });
}

async function openUpgrades(page: Page) {
  await page.addInitScript(({ key, seed }: { key: string; seed: ChampionshipState }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed));
  }, { key: CHAMPIONSHIP_SAVE_KEY, seed: careerFixture() });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMenu(page);
  await page.keyboard.press('Enter');
  await waitScene(page, 'RacePreparation');
  await clickObject(page, 'modules', 1);
  await waitScene(page, 'VehicleUpgrades');
}

test('MELHORIAS: captura real, compra, bloqueio por saldo e persistência após reload', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openUpgrades(page);

  const firstView = await inspect(page, game => {
    const scene = game.scene.getScene('VehicleUpgrades');
    return { vehicle: scene.vehicle.text, balance: scene.balance.text, price: scene.price.text,
      rows: scene.rows.map((row: Dynamic) => ({ attribute: row.attribute, label: row.label.text,
        value: row.value.text, indicatorCount: row.indicatorCount })) };
  });
  expect(firstView).toMatchObject({ vehicle: 'VEÍCULO ATUAL / CAMARO', balance: 'MONEY DISPONÍVEL  /  $ 2.100',
    price: 'PRÓXIMA: $ 500  /  110 km/h → 123,75 km/h',
    rows: [
      { attribute: 'speed', label: 'VELOCIDADE  0/8', value: '110 km/h  →  123,75 km/h', indicatorCount: 8 },
      { attribute: 'acceleration', label: 'ACELERAÇÃO  0/8', value: '36 PTS  →  44 PTS', indicatorCount: 8 },
      { attribute: 'armor', label: 'RESISTÊNCIA  0/8', value: '68 PTS  →  69 PTS', indicatorCount: 8 },
      { attribute: 'control', label: 'CONTROLE  0/8', value: '68 PTS  →  72 PTS', indicatorCount: 8 },
      { attribute: 'tires', label: 'PNEUS  0/8', value: '68 PTS  →  72 PTS', indicatorCount: 8 },
      { attribute: 'suspension', label: 'SUSPENSÃO  0/8', value: '68 PTS  →  72 PTS', indicatorCount: 8 },
      { attribute: 'shotCount', label: 'TIROS  0/8', value: '2  →  3', indicatorCount: 8 },
      { attribute: 'bombCount', label: 'BOMBAS  0/8', value: '2  →  3', indicatorCount: 8 },
      { attribute: 'oilSlickCount', label: 'ÓLEO  0/8', value: '2  →  3', indicatorCount: 8 },
    ] });
  await page.screenshot({ path: 'previews-ui/melhorias-camaro.png' });

  await page.keyboard.press('Enter');
  await expect.poll(() => inspect(page, game => {
    const state = game.championship.state;
    return { money: state.money, score: state.score, level: state.permanentUpgrades['volt-vector'].speed };
  })).toEqual({ money: 1600, score: 0, level: 1 });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect.poll(() => inspect(page, game => ({
    money: game.championship.state.money,
    level: game.championship.state.permanentUpgrades['volt-vector'].speed,
    message: game.scene.getScene('VehicleUpgrades').feedback.text,
  }))).toMatchObject({ money: 800, level: 2 });
  await expect.poll(() => inspect(page, game => ({
    price: game.scene.getScene('VehicleUpgrades').price.text,
    selected: game.scene.getScene('VehicleUpgrades').rows[0].label.text,
  }))).toEqual({ price: 'PRÓXIMA: $ 1.100  /  137,5 km/h → 151,25 km/h', selected: 'VELOCIDADE  2/8' });
  await page.screenshot({ path: 'previews-ui/melhorias-camaro-nivel-2.png' });
  await page.keyboard.press('Enter');
  await expect.poll(() => inspect(page, game => ({
    money: game.championship.state.money,
    level: game.championship.state.permanentUpgrades['volt-vector'].speed,
    message: game.scene.getScene('VehicleUpgrades').feedback.text,
  }))).toMatchObject({ money: 800, level: 2, message: 'MONEY insuficiente. Nenhuma compra foi realizada.' });

  for (let index = 0; index < 6; index += 1) await page.keyboard.press('ArrowDown');
  await expect.poll(() => inspect(page, game => game.scene.getScene('VehicleUpgrades').price.text))
    .toBe('PRÓXIMA: $ 500  /  2 → 3');
  await page.keyboard.press('Enter');
  await expect.poll(() => inspect(page, game => ({
    money: game.championship.state.money,
    speed: game.championship.state.permanentUpgrades['volt-vector'].speed,
    shots: game.championship.state.permanentUpgrades['volt-vector'].shotCount,
    value: game.scene.getScene('VehicleUpgrades').rows[6].value.text,
  }))).toEqual({ money: 300, speed: 2, shots: 1, value: '3  →  4' });
  await page.screenshot({ path: 'previews-ui/melhorias-camaro-tiros-nivel-1.png' });

  await page.reload();
  await openUpgrades(page);
  await expect.poll(() => inspect(page, game => ({
    money: game.championship.state.money,
    level: game.championship.state.permanentUpgrades['volt-vector'].speed,
    shots: game.championship.state.permanentUpgrades['volt-vector'].shotCount,
    value: game.scene.getScene('VehicleUpgrades').rows[6].value.text,
  }))).toEqual({ money: 300, level: 2, shots: 1, value: '3  →  4' });
});
