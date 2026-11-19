import { test, expect, openMenu, waitScene, state, clickObject } from './helpers.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { createChampionshipState, setSelections, acknowledgeChampionshipResult,
  ensureAssignedTrack, beginChampionshipRace, applyChampionshipResult } from '../src/championship/championshipState.ts';
import { CHAMPIONSHIP_SAVE_KEY } from '../src/championship/championshipStorage.ts';
import { VEHICLE_TUNING } from '../src/data/vehicles.ts';
import { RACE_TRACKS } from '../src/data/raceTracks.ts';
import { DEV_RACE_AI_BONUS_KEY } from '../src/race/DevRaceAIBonus.ts';

function teamFixture() {
  let state = setSelections({ ...createChampionshipState({ id: 'local-dev-tuning', attemptId: 'local-dev-attempt' }),
    ownedVehicleIds: ['volt-vector'] }, { pilotId: CHARACTERS[0].id, vehicleId: 'volt-vector',
    paintId: 'inferno', difficultyId: 'normal' });
  for (let i = 0; i < 3; i += 1) {
    state = beginChampionshipRace(ensureAssignedTrack(state, () => 0.99), `local-dev-race-${i}`);
    const race = state.activeRace;
    if (!race) throw new Error('Corrida fixture não iniciada');
    const entrants = [...CHARACTERS.slice(1, 4)]; entrants.splice(0, 0, CHARACTERS[0]);
    state = applyChampionshipResult(state, { raceId: race.id, trackId: race.trackId, trackName: 'FIXTURE',
      difficultyId: 'normal', laps: 4, elapsedTime: 100, standings: entrants.map((pilot, index) => ({
        id: pilot.id, name: pilot.name, isPlayer: pilot.id === CHARACTERS[0].id,
        position: (index + 1) as 1 | 2 | 3 | 4, finishTime: 90 + index, lapsCompleted: 4, paintColor: '#E53935',
      })) });
    state = acknowledgeChampionshipResult(state, `local-dev-ack-${i}`);
  }
  return state;
}

test('Modo Dev local: senha abre editor, valida e persiste tuning na API sem tocar no save', async ({ page }) => {
  test.setTimeout(90_000);
  const seed = teamFixture();
  await page.addInitScript(({ key, seed }) => localStorage.setItem(key, JSON.stringify(seed)),
    { key: CHAMPIONSHIP_SAVE_KEY, seed });
  let saved: unknown;
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
      expect(route.request().headers().authorization).toBe('Bearer fixture-session-token');
      saved = (route.request().postDataJSON() as { vehicles: unknown }).vehicles;
      await route.fulfill({ json: { saved: true } }); return;
    }
    if (pathname.endsWith('/logout')) { await route.fulfill({ json: { loggedOut: true } }); return; }
    await route.fulfill({ status: 404, json: { error: 'not-found' } });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMenu(page); await page.keyboard.press('Enter'); await waitScene(page, 'RacePreparation');
  await expect.poll(() => page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) return false;
    const { game } = await import(script.src);
    return !!game.scene.getScene('RacePreparation').rivalPreview;
  }), { timeout: 30_000 }).toBe(true);
  const settingsButton = page.getByRole('button', { name: 'Configurações', exact: true });
  await settingsButton.click();
  const settings = page.getByRole('dialog', { name: 'CONFIGURAÇÕES', exact: true });
  await expect(settings).toBeVisible();
  const launchEditor = settings.getByRole('button', { name: 'MODO DESENVOLVEDOR / ATRIBUTOS DOS CARROS' });
  await expect(launchEditor).toBeVisible();
  await launchEditor.click();
  const editor = page.getByRole('dialog', { name: 'PAINEL DO MODO DESENVOLVEDOR' });
  await expect(editor).toBeVisible();
  await expect(editor.locator('input[type="number"]')).toHaveCount(0);
  await editor.getByLabel('Senha local').fill('fixture-only-pin');
  await editor.getByRole('button', { name: 'DESBLOQUEAR E CARREGAR ATRIBUTOS' }).click();
  await expect(editor.locator('input[type="number"]')).toHaveCount(45);
  await editor.getByRole('tab', { name: 'ÁUDIO' }).click();
  await expect(editor.getByLabel('NEON FURNACE — MÚSICA — selecionar MP3')).toBeVisible();
  await expect(editor.getByLabel('NEON FURNACE — NARRAÇÃO DE LARGADA — selecionar MP3')).toBeVisible();
  await expect(editor.locator('[data-track-audio-file]')).toHaveCount(RACE_TRACKS.length * 2);
  await editor.getByRole('tab', { name: 'VEÍCULOS' }).click();
  expect((await state(page)).key).toBe('RacePreparation');
  await expect(editor.getByRole('spinbutton', { name: 'CAMARO / Pneus' })).toHaveValue('84');
  await expect(editor.getByRole('spinbutton', { name: 'CAMARO / Quantidade de tiros' })).toHaveValue('2');
  await editor.getByRole('tab', { name: 'DIFICULDADE IA' }).click();
  const botsBonus = editor.getByLabel('Bônus dos bots na dificuldade Difícil');
  await botsBonus.evaluate((input: HTMLInputElement) => {
    input.value = '10'; input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const rivalBonus = editor.getByLabel('Bônus do rival na dificuldade Difícil');
  await rivalBonus.evaluate((input: HTMLInputElement) => {
    input.value = '20'; input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(editor.getByRole('status').filter({ hasText: 'Bots: 10% · Rival: 20%' })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), DEV_RACE_AI_BONUS_KEY))
    .toBe(JSON.stringify({ botsPercent: 10, rivalPercent: 20 }));
  await page.screenshot({ path: 'previews-ui/modo-dev-dificuldade-ia.png' });
  await editor.getByRole('tab', { name: 'VEÍCULOS' }).click();
  await editor.getByRole('button', { name: 'FECHAR' }).click();
  await expect(editor).not.toBeVisible();
  expect((await state(page)).key).toBe('RacePreparation');
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  await page.getByRole('dialog', { name: 'CONFIGURAÇÕES', exact: true })
    .getByRole('button', { name: 'MODO DESENVOLVEDOR / ATRIBUTOS DOS CARROS' }).click();
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel('Senha local')).toBeVisible();
  await editor.getByLabel('Senha local').fill('fixture-only-pin');
  await editor.getByRole('button', { name: 'DESBLOQUEAR E CARREGAR ATRIBUTOS' }).click();
  await expect(editor.locator('input[type="number"]')).toHaveCount(45);
  const rawSave = await page.evaluate(key => localStorage.getItem(key), CHAMPIONSHIP_SAVE_KEY);
  await editor.getByRole('spinbutton', { name: 'CAMARO / Pneus' }).fill('91');
  await editor.getByRole('spinbutton', { name: 'CAMARO / Suspensão' }).fill('73');
  await editor.getByRole('spinbutton', { name: 'CAMARO / Quantidade de bombas' }).fill('2');
  await editor.getByRole('button', { name: 'SALVAR ATRIBUTOS NO PROJETO' }).click();
  await expect(editor.getByRole('status').filter({ hasText: 'Salvo no arquivo versionado' })).toBeVisible();
  expect(saved).toMatchObject({ 'volt-vector': { tires: 91, suspension: 73, bombCount: 2 } });
  expect((await state(page)).key).toBe('RacePreparation');
  expect(await page.evaluate(key => localStorage.getItem(key), CHAMPIONSHIP_SAVE_KEY)).toBe(rawSave);
  // The editor remains open for review. Page teardown exercises its registered
  // shutdown cleanup without leaving fixture tuning or touching the real save.
});

test('Modo Teste protegido controla a entrada no laboratório e mantém a estação e o save isolados', async ({ page }) => {
  test.setTimeout(90_000);
  const seed = teamFixture();
  await page.addInitScript(({ key, seed }) => localStorage.setItem(key, JSON.stringify(seed)),
    { key: CHAMPIONSHIP_SAVE_KEY, seed });
  await page.route('**/__riffshot_dev/vehicle-tuning/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/auth')) {
      const body = route.request().postDataJSON() as { password?: string };
      if (body.password !== 'fixture-only-pin') {
        await route.fulfill({ status: 401, json: { error: 'invalid-password' } }); return;
      }
      await route.fulfill({ json: { token: 'fixture-session-token', vehicles: VEHICLE_TUNING } }); return;
    }
    if (pathname.endsWith('/logout')) { await route.fulfill({ json: { loggedOut: true } }); return; }
    await route.fulfill({ status: 404, json: { error: 'not-found' } });
  });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMenu(page); await page.keyboard.press('Enter'); await waitScene(page, 'RacePreparation');
  const gear = page.getByRole('button', { name: 'Configurações', exact: true });
  await gear.click();
  const settings = page.getByRole('dialog', { name: 'CONFIGURAÇÕES', exact: true });
  await settings.getByRole('button', { name: 'MODO DESENVOLVEDOR / ATRIBUTOS DOS CARROS' }).click();
  const editor = page.getByRole('dialog', { name: 'PAINEL DO MODO DESENVOLVEDOR' });
  await editor.getByLabel('Senha local').fill('fixture-only-pin');
  await editor.getByRole('button', { name: 'DESBLOQUEAR E CARREGAR ATRIBUTOS' }).click();
  const testMode = editor.getByRole('checkbox', { name: /MODO TESTE/ });
  await expect(testMode).toBeVisible();
  await expect(testMode).not.toBeChecked();
  const officialRaceLabel = await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!;
    const { game } = await import(script.src);
    return (game.scene.getScene('RacePreparation') as any).startButton.label.text as string;
  });

  await testMode.check();
  await page.screenshot({ path: 'previews-ui/modo-dev-modo-teste.png' });
  await expect.poll(() => page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!;
    const { game } = await import(script.src);
    const scene = game.scene.getScene('RacePreparation') as unknown as {
      testModeEnabled: boolean; physicsLabButton: { label: { text: string } } | null; startButton: { label: { text: string } };
    };
    return { enabled: scene.testModeEnabled, label: scene.physicsLabButton?.label.text,
      officialRace: scene.startButton.label.text };
  })).toMatchObject({ enabled: true, label: 'PISTA DE TESTE' });
  await expect.poll(() => page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!;
    const { game } = await import(script.src);
    return (game.scene.getScene('RacePreparation') as any).startButton.label.text;
  })).toBe(officialRaceLabel);

  const saveBeforeLab = await page.evaluate(key => localStorage.getItem(key), CHAMPIONSHIP_SAVE_KEY);
  const campaignBeforeLab = await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!;
    const { game } = await import(script.src);
    return JSON.stringify(game.championship.state);
  });
  await editor.getByRole('button', { name: 'FECHAR' }).click();
  await expect(editor).not.toBeVisible();
  await page.screenshot({ path: 'previews-ui/estacao-pista-teste-ativada.png' });
  const legacyLabRequests: string[] = [];
  page.on('request', request => {
    if (/\/PhysicsLabScene\.ts|RapierVehicleLab|rapier3d-compat/i.test(new URL(request.url()).pathname)) {
      legacyLabRequests.push(request.url());
    }
  });
  await clickObject(page, 'physicsLabButton');
  const lab = page.locator('[data-physics-lab-root]');
  await expect(lab).toBeVisible();
  await expect(lab).toHaveAttribute('data-lab-engine', 'arcade-race-simulation');
  await expect(lab).toHaveAttribute('data-lab-scene', 'ArcadePhysicsLab');
  await expect(lab.locator('[data-physics-lab-status]')).toContainText('RaceSimulation ativa', { timeout: 15_000 });
  await expect(lab).toContainText('física horizontal: RaceSimulation oficial');
  await expect(lab).not.toContainText(/raycasts|suspensão|Rapier/i);
  await expect.poll(() => page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!;
    const { game } = await import(script.src);
    return game.scene.getScenes(true).map((scene: { scene: { key: string } }) => scene.scene.key);
  })).toContain('ArcadePhysicsLab');
  expect(legacyLabRequests).toEqual([]);
  await page.screenshot({ path: 'previews-ui/laboratorio-arcade-entrada-oficial.png' });
  await page.locator('[data-close]').click();
  await expect(lab).toHaveCount(0);
  await expect(page.locator('body')).toHaveClass(/team-station-active/);
  expect(await page.evaluate(key => localStorage.getItem(key), CHAMPIONSHIP_SAVE_KEY)).toBe(saveBeforeLab);
  expect(await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!;
    const { game } = await import(script.src);
    return JSON.stringify(game.championship.state);
  })).toBe(campaignBeforeLab);

  await gear.click();
  await page.getByRole('dialog', { name: 'CONFIGURAÇÕES', exact: true })
    .getByRole('button', { name: 'MODO DESENVOLVEDOR / ATRIBUTOS DOS CARROS' }).click();
  await editor.getByLabel('Senha local').fill('fixture-only-pin');
  await editor.getByRole('button', { name: 'DESBLOQUEAR E CARREGAR ATRIBUTOS' }).click();
  const reopenedToggle = editor.getByRole('checkbox', { name: /MODO TESTE/ });
  await expect(reopenedToggle).toBeChecked();
  await reopenedToggle.uncheck();
  await expect.poll(() => page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!;
    const { game } = await import(script.src);
    const scene = game.scene.getScene('RacePreparation') as unknown as { testModeEnabled: boolean; physicsLabButton: unknown };
    return { enabled: scene.testModeEnabled, hasLabButton: scene.physicsLabButton !== null };
  })).toEqual({ enabled: false, hasLabButton: false });
  await editor.getByRole('button', { name: 'FECHAR' }).click();
  await expect(editor).not.toBeVisible();
  await page.screenshot({ path: 'previews-ui/estacao-pista-teste-desativada.png' });

  await openMenu(page); await page.keyboard.press('Enter'); await waitScene(page, 'RacePreparation');
  await expect.poll(() => page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!;
    const { game } = await import(script.src);
    const scene = game.scene.getScene('RacePreparation') as unknown as { testModeEnabled: boolean; physicsLabButton: unknown };
    return { enabled: scene.testModeEnabled, hasLabButton: scene.physicsLabButton !== null };
  })).toEqual({ enabled: false, hasLabButton: false });
  expect(await page.evaluate(key => localStorage.getItem(key), CHAMPIONSHIP_SAVE_KEY)).toBe(saveBeforeLab);
});

test('produção: a engrenagem não oferece editor nem credencial dev', async ({ page }) => {
  const seed = teamFixture();
  await page.addInitScript(({ key, seed }) => localStorage.setItem(key, JSON.stringify(seed)),
    { key: CHAMPIONSHIP_SAVE_KEY, seed });
  await page.goto('http://127.0.0.1:4183');
  await expect(page.locator('#screen-status')).toContainText('Sinta a batida');
  await page.keyboard.press('Enter'); await expect(page.locator('#screen-status')).toContainText('Menu principal');
  await page.keyboard.press('Enter'); await expect(page.locator('#screen-status')).toContainText('Estação de Equipe');
  const gear = page.getByRole('button', { name: 'Configurações', exact: true });
  await gear.click();
  const settings = page.getByRole('dialog', { name: 'CONFIGURAÇÕES', exact: true });
  await expect(settings).toBeVisible();
  await expect(settings.locator('[data-action="vehicle-tuning"]')).toHaveCount(0);
  const bundle = await page.locator('script[src*="/assets/index-"]').getAttribute('src');
  expect(bundle).toBeTruthy();
  expect(await page.evaluate(async source => (await (await fetch(source!)).text()).includes('RIFFSHOT_DEV_MODE_PASSWORD'), bundle)).toBe(false);
});
