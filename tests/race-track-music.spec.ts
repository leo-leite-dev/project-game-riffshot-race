import { test, expect, openMenu, waitScene, state, clickObject } from './helpers.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { createChampionshipState, setSelections } from '../src/championship/championshipState.ts';
import { CHAMPIONSHIP_SAVE_KEY } from '../src/championship/championshipStorage.ts';
import { createTrackAssignmentState } from '../src/race/trackAssignment.ts';
import { fileURLToPath } from 'node:url';
import { VEHICLE_TUNING } from '../src/data/vehicles.ts';

test('Neon Furnace inicia faixa da pista, silencia trilha procedural e encerra a faixa ao sair da corrida', async ({ page }) => {
  test.setTimeout(90_000);
  let championship = setSelections({ ...createChampionshipState({ id: 'neon-track-music', attemptId: 'neon-track-attempt' }),
    ownedVehicleIds: ['rift-blaze'] }, {
    pilotId: CHARACTERS[0].id, vehicleId: 'rift-blaze', paintId: 'inferno', difficultyId: 'normal',
  });
  const localTrackCycle = createTrackAssignmentState();
  championship = { ...championship, tracks: { ...localTrackCycle,
    completedRaceIds: [],
    remainingTrackIds: ['neon-furnace', 'voltage-run'],
    pendingTrackId: 'neon-furnace', history: [] } };
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: CHAMPIONSHIP_SAVE_KEY, value: championship });
  await page.route('**/__riffshot_dev/vehicle-tuning/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/auth')) {
      await route.fulfill({ json: { token: 'fixture-session-token', vehicles: VEHICLE_TUNING } }); return;
    }
    if (pathname.endsWith('/logout')) { await route.fulfill({ json: { loggedOut: true } }); return; }
    await route.fulfill({ status: 404, json: { error: 'not-found' } });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMenu(page); // Enter is a real user gesture; native track audio waits until CONFIRMAR.
  await page.keyboard.press('Enter');
  await waitScene(page, 'RacePreparation');
  await expect.poll(async () => page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) return false;
    return !!(await import(script.src)).game.menuMusic.source;
  }), { timeout: 10_000 }).toBe(true);
  const gear = page.getByRole('button', { name: 'Configurações', exact: true });
  await gear.click();
  const settings = page.getByRole('dialog', { name: 'CONFIGURAÇÕES', exact: true });
  await settings.getByRole('button', { name: 'MODO DESENVOLVEDOR / ATRIBUTOS DOS CARROS' }).click();
  const editor = page.getByRole('dialog', { name: 'PAINEL DO MODO DESENVOLVEDOR' });
  await editor.getByLabel('Senha local').fill('fixture-only-pin');
  await editor.getByRole('button', { name: 'DESBLOQUEAR E CARREGAR ATRIBUTOS' }).click();
  await editor.getByRole('tab', { name: 'ÁUDIO' }).click();
  const musicInput = editor.getByLabel('NEON FURNACE — MÚSICA — selecionar MP3');
  await musicInput.setInputFiles(fileURLToPath(new URL('../public/assets/audio/neon-furnace-theme.mp3', import.meta.url)));
  await editor.getByRole('button', { name: 'Salvar música de NEON FURNACE' }).click();
  await expect(editor.locator('[data-track-audio-status="neon-furnace:music"]')).toContainText('MP3 local salvo');
  const announcerInput = editor.getByLabel('NEON FURNACE — NARRAÇÃO DE LARGADA — selecionar MP3');
  await announcerInput.setInputFiles(fileURLToPath(new URL('../public/assets/audio/neon-furnace-theme.mp3', import.meta.url)));
  await editor.getByRole('button', { name: 'Salvar narração de largada de NEON FURNACE' }).click();
  await expect(editor.locator('[data-track-audio-status="neon-furnace:announcer"]')).toContainText('MP3 local salvo');
  await page.screenshot({ path: 'previews-ui/neon-furnace-musica-dev.png' });
  await editor.getByRole('button', { name: 'FECHAR', exact: true }).click();
  await page.reload();
  await openMenu(page);
  await page.keyboard.press('Enter');
  await waitScene(page, 'RacePreparation');
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  const restoredSettings = page.getByRole('dialog', { name: 'CONFIGURAÇÕES', exact: true });
  await restoredSettings.getByRole('button', { name: 'MODO DESENVOLVEDOR / ATRIBUTOS DOS CARROS' }).click();
  const restoredEditor = page.getByRole('dialog', { name: 'PAINEL DO MODO DESENVOLVEDOR' });
  await restoredEditor.getByLabel('Senha local').fill('fixture-only-pin');
  await restoredEditor.getByRole('button', { name: 'DESBLOQUEAR E CARREGAR ATRIBUTOS' }).click();
  await restoredEditor.getByRole('tab', { name: 'ÁUDIO' }).click();
  await expect.poll(() => restoredEditor.locator('[data-track-audio-status="neon-furnace:music"]').textContent())
    .toContain('neon-furnace-theme.mp3');
  await restoredEditor.getByRole('button', { name: 'FECHAR', exact: true }).click();
  await clickObject(page, 'startButton');
  await waitScene(page, 'RaceTrackSelection');
  await expect(page.locator('#screen-status')).toContainText('NEON FURNACE');
  await clickObject(page, 'startButton'); // Music starts immediately; narration has a two-second delay.
  expect(await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!;
    const { game } = await import(script.src);
    return game.menuMusic.announcerAudio;
  })).toBeNull();
  await waitScene(page, 'Race');
  await expect.poll(async () => page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) return false;
    return (await import(script.src)).game.scene.getScene('Race').ready;
  }), { timeout: 60_000 }).toBe(true);
  await expect.poll(() => page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) return false;
    const { game } = await import(script.src);
    return !!game.menuMusic.announcerAudio;
  }), { timeout: 60_000 }).toBe(true);
  expect(await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!;
    const { game } = await import(script.src);
    return { started: game.scene.getScene('Race').simulationStarted, loop: game.menuMusic.announcerAudio.loop };
  })).toEqual({ started: false, loop: false });
  await page.screenshot({ path: 'previews-ui/neon-furnace-largada-alinhada.png' });
  await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!;
    const { game } = await import(script.src);
    game.menuMusic.announcerAudio.dispatchEvent(new Event('ended'));
  });
  await expect.poll(() => page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!;
    const { game } = await import(script.src);
    return game.scene.getScene('Race').simulationStarted;
  })).toBe(true);
  await expect(page.locator('#screen-status')).toContainText('Largada!', { timeout: 10_000 });
  const activeTrackMusic = await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada ausente');
    const { game } = await import(script.src);
    const music = game.menuMusic;
    return { trackId: music.currentRaceTrackMusicId, src: music.trackAudio?.currentSrc,
      paused: music.trackAudio?.paused, loop: music.trackAudio?.loop,
      proceduralBufferSourceExists: !!music.source, proceduralGain: music.output?.gain.value,
      effectsVolume: game.menuMusic.currentEffectsVolume };
  });
  expect(activeTrackMusic).toMatchObject({ trackId: 'neon-furnace',
    src: expect.stringMatching(/^blob:/), paused: false, loop: true,
    proceduralBufferSourceExists: true, effectsVolume: 1 });
  expect(Number(activeTrackMusic.proceduralGain)).toBeLessThan(0.001);
  await expect(page.locator('#screen-status')).toContainText('Largada!');

  await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!;
    const { game } = await import(script.src);
    game.scene.getScene('Race').scene.start('RacePreparation');
  });
  await waitScene(page, 'RacePreparation');
  const restored = await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada ausente');
    const music = (await import(script.src)).game.menuMusic;
    return { trackId: music.currentRaceTrackMusicId, trackPaused: music.trackAudio === null,
      gameMusicSourceExists: !!music.source, gameMusicMode: music.musicMode };
  });
  expect(restored).toEqual({ trackId: null, trackPaused: true, gameMusicSourceExists: true, gameMusicMode: 'game' });
  expect((await state(page)).key).toBe('RacePreparation');
});
