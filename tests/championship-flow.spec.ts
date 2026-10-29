import { test, expect, openMenu, openCharacters, clickObject, waitScene } from './helpers.ts';
import type { Page, TestInfo } from '@playwright/test';

type Dynamic = { [key: string]: Dynamic; [key: number]: Dynamic; (...args: unknown[]): Dynamic };
import { CHARACTERS } from '../src/data/characters.ts';
import { VEHICLE } from '../src/data/vehicles.ts';
import { CHAMPIONSHIP_RULES } from '../src/data/championshipRules.ts';
import { CHAMPIONSHIP_SAVE_KEY } from '../src/championship/championshipStorage.ts';
import { createChampionshipState, setSelections, ensureAssignedTrack, beginChampionshipRace,
  applyChampionshipResult, acknowledgeChampionshipResult } from '../src/championship/championshipState.ts';

const selections = { pilotId: CHARACTERS[0].id, vehicleId: VEHICLE.id, paintId: 'inferno', difficultyId: 'normal' };
const getState = (page: Page) => page.evaluate(async () => {
  const script = document.querySelector('script[src*="/src/main.ts"]'); if (!(script instanceof HTMLScriptElement)) throw new Error('Entrada ausente'); const { game } = await import(script.src);
  return game.championship.state;
});
const waitPreview = (page: Page, key: string) => expect.poll(() => page.evaluate(async (key: string) => {
  const script = document.querySelector('script[src*="/src/main.ts"]'); if (!(script instanceof HTMLScriptElement)) throw new Error('Entrada ausente'); const { game } = await import(script.src);
  return !!game.scene.getScene(key).garageView;
}, key), { timeout: 15_000 }).toBe(true);

async function finishRealSimulation(page: Page) {
  await waitScene(page, 'Race');
  await waitPreview(page, 'Race');
  // Simulated test driver, using real physics and gates. Does not claim a
  // human drove four laps; the RaceScene itself still records the result.
  const result = await page.evaluate(async () => {
    const script = document.querySelector('script[src*="/src/main.ts"]'); if (!(script instanceof HTMLScriptElement)) throw new Error('Entrada ausente'); const { game } = await import(script.src);
    const scene = game.scene.getScene('Race');
    const race = scene.simulation.start();
    for (let frame = 0; frame < 180 * 60 && race.status !== 'finished'; frame += 1) {
      race.advance(1000 / 60, race.getBotControls(race.participants[0], 1 / 60));
    }
    scene.simulationStarted = true;
     const player = race.getStandings().find((row: { isPlayer: boolean; rank: number }) => row.isPlayer);
    if (!player) throw new Error('Jogador ausente na classificação');
    return { status: race.status, position: player.rank };
  });
   expect(result.status).toBe('finished');
  await waitScene(page, 'RaceResults');
  return result;
}

test('campeonato: chegada premia uma vez, reload reabre o recibo e MONEY/SCORE reais chegam ao painel', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const seed = { ...createChampionshipState({ id: 'receipt-career', attemptId: 'receipt-attempt' }),
    ownedVehicleIds: [VEHICLE.id] };
  await page.addInitScript(({ key, seed }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(seed));
  }, { key: CHAMPIONSHIP_SAVE_KEY, seed });
  await openCharacters(page);
  await clickObject(page, 'cards', 1);
  await clickObject(page, 'confirmButton');
  await waitScene(page, 'VehicleSelection');
  await waitPreview(page, 'VehicleSelection');
  await clickObject(page, 'confirmButton');
  await clickObject(page, 'confirmButton');
  await expect(page.locator('#screen-status')).toContainText('Estação de Equipe', { timeout: 20_000 });
  await waitScene(page, 'RacePreparation');
  await clickObject(page, 'startButton');
  await waitScene(page, 'RaceTrackSelection');
  await clickObject(page, 'startButton');
  const finished = await finishRealSimulation(page);
  expect(finished.position).toBe(1);
   const reward = CHAMPIONSHIP_RULES.rewardsByPosition[finished.position as 1 | 2 | 3 | 4];
  const awarded = await getState(page);
  expect(awarded).toMatchObject({ score: reward.score, money: 2000 + reward.money, racesRun: 1 });
  expect(awarded.pendingResult.reward).toEqual(reward);
  expect(awarded.awardedRaceIds).toHaveLength(1);
  const raw = await page.evaluate(key => localStorage.getItem(key), CHAMPIONSHIP_SAVE_KEY);

  await page.reload();
  await expect(page.locator('#screen-status')).toContainText('Sinta a batida');
  await page.keyboard.press('Enter');
  await waitScene(page, 'MainMenu');
  await page.keyboard.press('Enter');
  await waitScene(page, 'RaceResults');
  expect(await getState(page)).toEqual(awarded);
  expect(await page.evaluate(key => localStorage.getItem(key), CHAMPIONSHIP_SAVE_KEY)).toBe(raw);
  const labels = await page.evaluate(async () => {
    const script = document.querySelector('script[src*="/src/main.ts"]'); if (!(script instanceof HTMLScriptElement)) throw new Error('Entrada ausente'); const { game } = await import(script.src);
    const scene = game.scene.getScene('RaceResults');
    return { reward: scene.rewardLabel.text, summary: scene.summary.text };
  });
  expect(labels.reward).toContain(String(reward.score));
  expect(labels.reward).toContain(reward.money.toLocaleString('pt-BR'));
  await clickObject(page, 'backButton');
  await waitScene(page, 'RacePreparation');
  const fields = await page.evaluate(async () => {
    const script = document.querySelector('script[src*="/src/main.ts"]'); if (!(script instanceof HTMLScriptElement)) throw new Error('Entrada ausente'); const { game } = await import(script.src);
     return game.scene.getScene('RacePreparation').campaignFields.map((field: Dynamic) => [field.label.text, field.value.text]);
  });
  expect(fields).toEqual([['MONEY', `$ ${(2000 + reward.money).toLocaleString('pt-BR')}`], ['DIVISÃO', 'B'],
    ['CORRIDAS', '1 DE 8'], ['PONTUAÇÃO NECESSÁRIA', '1.400'], ['PONTUAÇÃO ATUAL', reward.score.toLocaleString('pt-BR')]]);
  await waitPreview(page, 'RacePreparation');
  await page.screenshot({ path: testInfo.outputPath('championship-panel.png') });
  await page.reload();
  await page.keyboard.press('Enter');
  await waitScene(page, 'MainMenu');
  await page.keyboard.press('Enter');
  await waitScene(page, 'RacePreparation');
  expect((await getState(page)).racesRun).toBe(1);
  expect((await getState(page)).pendingResult).toBeNull();
});

function attemptReceipt(positions: number[] = Array(8).fill(4)) {
  let state = setSelections({ ...createChampionshipState({ id: 'fixture-career', attemptId: 'fixture-attempt' }),
    ownedVehicleIds: [selections.vehicleId] }, selections);
  state = { ...state, upgrades: { futureEngine: 2 } }; // Isolated existing-career fixture, not a purchase.
  for (let race = 1; race <= positions.length; race += 1) {
    state = ensureAssignedTrack(state, () => 0.99);
    state = beginChampionshipRace(state, `fixture-race-${race}`);
    let rival = 1;
    const activeRace = state.activeRace;
    if (!activeRace) throw new Error('Corrida fixture não iniciada');
    state = applyChampionshipResult(state, { raceId: activeRace.id, trackId: activeRace.trackId,
      trackName: 'CIRCUITO DE TESTE', difficultyId: 'normal', laps: 4, elapsedTime: 100,
       standings: [1, 2, 3, 4].map(position => {
        const player = position === positions[race - 1];
        const pilot = CHARACTERS[player ? 0 : rival++];
         return { id: pilot.id, name: pilot.name, isPlayer: player, position: position as 1 | 2 | 3 | 4,
          finishTime: 80 + position, lapsCompleted: 4, paintColor: '#E53935' };
      }) });
    if (race < positions.length) state = acknowledgeChampionshipResult(state, `fixture-attempt-${race}`);
  }
  return state;
}

test('campeonato: oitava corrida preservada até confirmação, reinício e escolha especial persistente', async ({ page }, testInfo) => {
  test.setTimeout(75_000);
  const seed = attemptReceipt();
  expect(seed.attempt.status).toBe('failed');
  await page.addInitScript(({ key, state }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(state));
  }, { key: CHAMPIONSHIP_SAVE_KEY, state: seed });
  await openMenu(page);
  await page.keyboard.press('Enter');
  await waitScene(page, 'RaceResults');
  const before = await getState(page);
  expect(before).toMatchObject({ racesRun: 8, score: 0, money: 2000, upgrades: { futureEngine: 2 } });
  await page.keyboard.press('Escape');
  await waitScene(page, 'MainMenu');
  expect(await getState(page)).toEqual(before);
  await page.reload();
  await page.keyboard.press('Enter');
  await waitScene(page, 'MainMenu');
  await page.keyboard.press('Enter');
  await waitScene(page, 'RaceResults');
  expect(await getState(page)).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('eighth-race-result.png') });
  for (const [index, viewport] of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1440, height: 900 }].entries()) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(async () => {
      const script = document.querySelector('script[src*="/src/main.ts"]'); if (!(script instanceof HTMLScriptElement)) throw new Error('Entrada ausente'); const { game } = await import(script.src);
      const scene = game.scene.getScene('RaceResults');
      return [scene.title, scene.details, scene.rewardLabel, scene.challengeStatus, ...scene.buttons].every(object => {
        const b = object.getBounds();
        return b.left >= 0 && b.right <= game.scale.width && b.top >= 54 && b.bottom <= game.scale.height - 48;
      });
    })).toBe(true);
    if (index === 0) await page.screenshot({ path: testInfo.outputPath('championship-result-320x568.png') });
  }
  await clickObject(page, 'replayButton');
  await waitScene(page, 'RacePreparation');
  let restarted = await getState(page);
  expect(restarted).toMatchObject({ money: 0, score: 0, racesRun: 0, upgrades: {}, selections,
    attempt: { number: 2, status: 'active' }, tracks: { freeChoiceAvailable: true, history: [] } });
  expect(restarted.previousAttempts[0].tracks).toHaveLength(8);
  await waitPreview(page, 'RacePreparation');
  await page.reload();
  await page.keyboard.press('Enter');
  await waitScene(page, 'MainMenu');
  await page.keyboard.press('Enter');
  await waitScene(page, 'RacePreparation');
  await clickObject(page, 'startButton');
  await waitScene(page, 'RaceTrackSelection');
  await expect(page.locator('#screen-status')).toContainText('Escolha especial');
  await page.screenshot({ path: testInfo.outputPath('special-track-choice.png') });
  await clickObject(page, 'trackCards', 1);
  await clickObject(page, 'startButton');
  await finishRealSimulation(page);
  expect((await getState(page)).tracks).toMatchObject({ freeChoiceAvailable: false, history: ['voltage-run'] });
  await clickObject(page, 'backButton');
  await waitScene(page, 'RacePreparation');
  await clickObject(page, 'startButton');
  await waitScene(page, 'RaceTrackSelection');
  await expect(page.locator('#screen-status')).toContainText('Pista atribuída: NEON FURNACE');
  const pending = (await getState(page)).tracks.pendingTrackId;
  await page.keyboard.press('Escape');
  await waitScene(page, 'RacePreparation');
  await clickObject(page, 'startButton');
  await waitScene(page, 'RaceTrackSelection');
  expect((await getState(page)).tracks.pendingTrackId).toBe(pending);
});

test('campeonato: vitória por SCORE preserva MONEY/upgrades e não inventa outra divisão', async ({ page }, testInfo) => {
  test.setTimeout(30_000);
  const seed = attemptReceipt([1, 1, 1, 1, 1]);
  await page.addInitScript(({ key, state }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(state));
  }, { key: CHAMPIONSHIP_SAVE_KEY, state: seed });
  await openMenu(page);
  await page.keyboard.press('Enter');
  await waitScene(page, 'RaceResults');
  const message = await page.evaluate(async () => {
    const script = document.querySelector('script[src*="/src/main.ts"]'); if (!(script instanceof HTMLScriptElement)) throw new Error('Entrada ausente'); const { game } = await import(script.src);
    return game.scene.getScene('RaceResults').challengeStatus.text;
  });
  expect(message).toContain('META ATINGIDA / PRÊMIO DISPONÍVEL');
  expect(message).toContain('Farme mais 3 corrida(s)');
  await clickObject(page, 'replayButton');
  await waitScene(page, 'RaceTrackSelection');
  expect((await getState(page)).pendingResult).toBeNull();
  await page.keyboard.press('Escape');
  await waitScene(page, 'RacePreparation');
  expect(await getState(page)).toMatchObject({ score: 1500, money: 9500, racesRun: 5, division: 'B',
    upgrades: { futureEngine: 2 }, attempt: { status: 'qualified' } });
  await waitPreview(page, 'RacePreparation');
  await page.screenshot({ path: testInfo.outputPath('championship-qualified.png') });
  await clickObject(page, 'startButton');
  await waitScene(page, 'RaceTrackSelection');
  expect((await getState(page)).activeRace).toBeNull(); // Track selection has not started the next race.
});

test('campeonato: save desconhecido avisa no canvas e no status acessível sem sobrescrever dados', async ({ page }) => {
  const raw = '{"schemaVersion":99,"progresso":"não apagar"}';
  await page.addInitScript(({ key, raw }) => {
    localStorage.setItem(key, raw);
    localStorage.setItem(`${key}:backup`, 'backup preservado');
  }, { key: CHAMPIONSHIP_SAVE_KEY, raw });
  await openMenu(page);
  await expect(page.locator('#screen-status')).toContainText('não salvo');
  const visible = await page.evaluate(async () => {
    const script = document.querySelector('script[src*="/src/main.ts"]'); if (!(script instanceof HTMLScriptElement)) throw new Error('Entrada ausente'); const { game } = await import(script.src);
    const scene = game.scene.getScene('MainMenu');
    return scene.saveNotice.visible && scene.saveNotice.text.includes('NÃO SALVO');
  });
  expect(visible).toBe(true);
  await page.keyboard.press('Enter');
  await waitScene(page, 'DifficultySelection');
  await page.keyboard.press('Enter');
  await waitScene(page, 'CharacterSelection');
  expect(await page.evaluate(key => localStorage.getItem(key), CHAMPIONSHIP_SAVE_KEY)).toBe(raw);
  expect(await page.evaluate(key => localStorage.getItem(`${key}:backup`), CHAMPIONSHIP_SAVE_KEY)).toBe('backup preservado');
});
