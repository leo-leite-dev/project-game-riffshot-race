import { test, expect, openMenu, waitScene } from './helpers.ts';
import { test as plainPlaywrightTest } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { CHARACTERS } from '../src/data/characters.ts';
import { createChampionshipState, setSelections, ensureAssignedTrack, beginChampionshipRace } from '../src/championship/championshipState.ts';
import { CHAMPIONSHIP_SAVE_KEY } from '../src/championship/championshipStorage.ts';
import type { ChampionshipState } from '../src/championship/championshipState.ts';

type Dynamic = { [key: string]: Dynamic; [key: number]: Dynamic; (...args: unknown[]): Dynamic };
const inspect = <T>(page: Page, fn: (game: Dynamic) => T) => page.evaluate(async source => {
  const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
  if (!script) throw new Error('Entrada do jogo não encontrada');
  const { game } = await import(script.src);
  return new Function('game', `return (${source})(game)`)(game) as T;
}, fn.toString());

function radioFixture(): ChampionshipState {
  let state = setSelections({ ...createChampionshipState({ id: 'radio-local', attemptId: 'radio-attempt' }),
    ownedVehicleIds: ['rift-blaze'] }, {
    pilotId: CHARACTERS[0].id, vehicleId: 'rift-blaze', paintId: 'inferno', difficultyId: 'normal',
  });
  return beginChampionshipRace(ensureAssignedTrack(state, () => 0.99), 'radio-active-race');
}

function wavFixture(): Buffer {
  const sampleRate = 8_000, sampleCount = 960_000, dataLength = sampleCount * 2;
  const wav = Buffer.alloc(44 + dataLength);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + dataLength, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(dataLength, 40);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    wav.writeInt16LE(Math.round(Math.sin(sample * 2 * Math.PI * 440 / sampleRate) * 1200), 44 + sample * 2);
  }
  return wav;
}

const RADIO_STATIONS = [
  { stationuuid: '11111111-1111-4111-8111-111111111111', name: 'RIFFSHOT Hard Rock Test',
    url: 'https://stream.fixture.test/hard-rock.wav', url_resolved: 'https://stream.fixture.test/hard-rock.wav',
    homepage: 'https://radio.example/hard-rock', tags: 'hard rock,rock', codec: 'MP3', bitrate: 128,
    hls: 0, lastcheckok: 1, clickcount: 20 },
  { stationuuid: '22222222-2222-4222-8222-222222222222', name: 'RIFFSHOT Heavy Metal Test',
    url: 'https://stream.fixture.test/heavy-metal.wav', url_resolved: 'https://stream.fixture.test/heavy-metal.wav',
    homepage: 'https://radio.example/heavy-metal', tags: 'heavy metal,metal', codec: 'MP3', bitrate: 192,
    hls: 0, lastcheckok: 1, clickcount: 12 },
];

test('RIFFSHOT RADIO: busca estações, toca após clique, controles/volume, continuidade entre cenas e minimização', async ({ page }) => {
  test.setTimeout(120_000);
  const state = radioFixture();
  await page.addInitScript(({ key, value }: { key: string; value: ChampionshipState }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: CHAMPIONSHIP_SAVE_KEY, value: state });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('https://all.api.radio-browser.info/json/servers', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify([{ name: 'de1.api.radio-browser.info' }]),
  }));
  await page.route('**/stations/search*', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(RADIO_STATIONS),
  }));
  await page.route('**/json/url/**', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ ok: true, stationuuid: 'fixture' }),
  }));
  await page.route('https://stream.fixture.test/**', route => route.fulfill({
    status: 200, contentType: 'audio/wav', body: wavFixture(),
  }));

  await openMenu(page);
  await page.keyboard.press('Enter');
  await waitScene(page, 'RacePreparation');
  const campaignBeforeAudioSettings = await inspect(page, game => JSON.stringify(game.championship.state));
  const gear = page.getByRole('button', { name: 'Configurações' });
  await gear.click();
  const dialog = page.getByRole('dialog', { name: 'CONFIGURAÇÕES', exact: true });
  await expect(dialog).toBeVisible();
  const closeSettings = dialog.getByRole('button', { name: 'FECHAR', exact: true });
  await expect(closeSettings).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: /SOM:/ })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(closeSettings).toBeFocused();
  const musicSource = dialog.locator('[data-action="music-source"]');
  expect(await musicSource.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value)))
    .toEqual(['game', 'radio', 'none']);
  await musicSource.selectOption('radio');
  await expect(dialog.getByRole('heading', { name: 'RIFFSHOT RADIO' })).toBeVisible();
  await dialog.getByLabel('Gênero da rádio').selectOption('Heavy Metal');
  await dialog.getByRole('button', { name: 'BUSCAR' }).click();
  const stationList = dialog.getByLabel('Estação de rádio');
  await expect.poll(async () => stationList.locator('option').count()).toBe(3);
  await stationList.selectOption(RADIO_STATIONS[1]!.stationuuid);
  await expect(dialog.locator('[data-action="radio-name"]')).toHaveText('RIFFSHOT Heavy Metal Test');
  await expect(dialog.getByRole('link', { name: 'Site da emissora' })).toHaveAttribute('href', 'https://radio.example/heavy-metal');
  await page.screenshot({ path: 'previews-ui/riffshot-radio-settings.png' });

  const radioVolume = dialog.getByLabel('Volume da rádio');
  await radioVolume.evaluate((element: HTMLInputElement) => {
    element.value = '0.42'; element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await dialog.locator('[data-action="radio-play"]').click();
  await expect(dialog.locator('[data-action="radio-status"]')).toHaveText('REPRODUZINDO');
  expect(await inspect(page, game => ({ mode: game.menuMusic.musicMode, radioVolume: game.riffshotRadio.audio.volume,
    stored: game.audioPreferences.value, requests: game.riffshotRadio.audio.currentSrc }))).toMatchObject({
    mode: 'radio', radioVolume: 0.42, stored: { musicSource: 'radio', radioVolume: 0.42,
      lastStationUuid: RADIO_STATIONS[1]!.stationuuid, radioWasPlaying: true },
  });
  await expect(dialog.locator('[data-action="radio-play"]')).toHaveText('Ⅱ PAUSAR');
  await dialog.locator('[data-action="radio-play"]').click();
  await expect(dialog.locator('[data-action="radio-status"]')).toHaveText('PAUSADA');
  await dialog.locator('[data-action="radio-play"]').click();
  await expect(dialog.locator('[data-action="radio-status"]')).toHaveText('REPRODUZINDO');
  await dialog.locator('[data-action="radio-next"]').click();
  await expect(dialog.locator('[data-action="radio-name"]')).toHaveText('RIFFSHOT Hard Rock Test');
  await expect(dialog.locator('[data-action="radio-status"]')).toHaveText('REPRODUZINDO');
  await dialog.locator('[data-action="radio-previous"]').click();
  await expect(dialog.locator('[data-action="radio-name"]')).toHaveText('RIFFSHOT Heavy Metal Test');
  await expect(dialog.locator('[data-action="radio-status"]')).toHaveText('REPRODUZINDO');

  await dialog.getByLabel('Volume dos efeitos sonoros').evaluate((element: HTMLInputElement) => {
    element.value = '0.25'; element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(await inspect(page, game => ({ effects: game.menuMusic.currentEffectsVolume,
    radio: game.riffshotRadio.audio.volume }))).toEqual({ effects: 0.25, radio: 0.42 });
  await closeSettings.click();
  expect(await inspect(page, game => JSON.stringify(game.championship.state))).toBe(campaignBeforeAudioSettings);

  const radioAudioHandle = await page.evaluateHandle(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada ausente');
    const { game } = await import(script.src);
    (window as unknown as { __riffshotRadioAudio: HTMLAudioElement }).__riffshotRadioAudio = game.riffshotRadio.audio;
    return game.riffshotRadio.audio;
  });
  await inspect(page, game => game.scene.getScene('RacePreparation').scene.start('Race'));
  await waitScene(page, 'Race');
  await expect.poll(() => inspect(page, game => game.scene.getScene('Race').ready), { timeout: 60_000 }).toBe(true);
  await expect.poll(() => inspect(page, game => game.scene.getScene('Race').simulationStarted), { timeout: 10_000 }).toBe(true);
  const continuity = await inspect(page, async game => {
    const scene = game.scene.getScene('Race');
    const radio = game.riffshotRadio;
    const radioLabel = String(radio.state.station?.name ?? '');
    const radioTexts: Array<{ text: string; x: number; y: number; isWidgetStation: boolean;
      parentName: string; bounds: unknown }> = [];
    const visit = (item: Dynamic) => {
      if (radioLabel && String(item.text ?? '').includes(radioLabel)) radioTexts.push({ text: String(item.text),
        x: Number(item.x), y: Number(item.y), isWidgetStation: item === scene.radioWidget.station,
        parentName: String(item.parentContainer?.name ?? item.parentContainer?.type ?? ''),
        bounds: item.getBounds?.().toJSON?.() });
      if (Array.isArray(item.list)) item.list.forEach(visit);
    };
    scene.children.list.forEach(visit);
    return { samePlayer: Object.is(radio.audio, (window as unknown as { __riffshotRadioAudio: HTMLAudioElement }).__riffshotRadioAudio),
      status: radio.state.status, paused: radio.audio.paused, source: game.menuMusic.musicMode,
      engineSilent: scene.engineAudio.diagnostics.silent, effectsSilent: scene.effectsAudio.diagnostics.silent,
      widgetVisible: scene.radioWidget.container.visible, radioTexts };
  });
  expect(continuity).toMatchObject({ status: 'playing', paused: false, source: 'radio',
    engineSilent: false, effectsSilent: false, widgetVisible: true });
  expect(continuity.radioTexts).toHaveLength(1);
  const mixed = await inspect(page, async game => {
    const scene = game.scene.getScene('Race');
    const sim = scene.simulation, player = sim.participants[0], rival = sim.participants[1];
    const eventTime = Math.max(Number(sim.elapsedTime), Number(scene.effectsAudio.lastElapsed ?? 0)) + 1;
    scene.effectsAudio.update(sim.participants, 'racing', eventTime, []);
    const shotTime = eventTime + 1 / 60;
    scene.effectsAudio.update(sim.participants, 'racing', shotTime, [{ id: 1_000_000, projectileId: 1_000_000, kind: 'shot',
      ownerId: rival.id, dirX: 0, dirZ: 1, x: Number(player.x), y: Number(player.y) + 1,
      z: Number(player.z), time: shotTime }]);
    return { radioPlaying: !game.riffshotRadio.audio.paused,
      startedShot: scene.effectsAudio.diagnostics.shots, engineSilent: scene.engineAudio.diagnostics.silent };
  });
  expect(mixed).toEqual({ radioPlaying: true, startedShot: 1, engineSilent: false });
  await inspect(page, game => { game.scene.getScene('Race').cameraNotice.setAlpha(0); });
  await page.screenshot({ path: 'previews-ui/riffshot-radio-corrida.png' });
  await inspect(page, game => { game.scene.getScene('Race').radioWidget.collapse.emit('pointerdown'); });
  await expect.poll(() => inspect(page, game => game.scene.getScene('Race').radioWidget.collapsed)).toBe(true);
  await page.screenshot({ path: 'previews-ui/riffshot-radio-corrida-minimizada.png' });

  await inspect(page, game => game.menuMusic.toggle());
  const separated = await inspect(page, game => ({ mode: game.menuMusic.musicMode,
    radioPlaying: !game.riffshotRadio.audio.paused, effectsMuted: game.menuMusic.muted,
    engineSilent: game.scene.getScene('Race').engineAudio.diagnostics.silent }));
  expect(separated).toEqual({ mode: 'radio', radioPlaying: true, effectsMuted: true, engineSilent: true });
  await inspect(page, game => game.menuMusic.toggle());
  expect(await inspect(page, game => ({ radio: game.riffshotRadio.state.status,
    effectsMuted: game.menuMusic.muted }))).toEqual({ radio: 'playing', effectsMuted: false });

  await page.reload();
  await expect.poll(() => page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) return null;
    const { game } = await import(script.src);
    return game.riffshotRadio ? { mode: game.menuMusic.musicMode, status: game.riffshotRadio.state.status,
      paused: game.riffshotRadio.audio.paused, station: game.audioPreferences.value.lastStationUuid,
      wantsResume: game.audioPreferences.value.radioWasPlaying } : null;
  })).toMatchObject({ mode: 'radio', status: 'paused', paused: true,
    station: RADIO_STATIONS[1]!.stationuuid, wantsResume: true });
  await radioAudioHandle.dispose();
});

plainPlaywrightTest('RIFFSHOT RADIO smoke externo: confirma até três streams HTTPS reais sem proxy', async ({ page }, testInfo: TestInfo) => {
  test.setTimeout(90_000);
  if (process.env.RIFFSHOT_RADIO_LIVE_SMOKE !== '1') {
    await openMenu(page);
    test.skip(true, 'Smoke externo opt-in; API e emissoras podem variar/disponibilidade não é garantida.');
  }
  const state = radioFixture();
  await page.addInitScript(({ key, value }: { key: string; value: ChampionshipState }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: CHAMPIONSHIP_SAVE_KEY, value: state });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMenu(page);
  await page.keyboard.press('Enter');
  await waitScene(page, 'RacePreparation');
  await page.getByRole('button', { name: 'Configurações' }).click();
  const dialog = page.getByRole('dialog', { name: 'CONFIGURAÇÕES', exact: true });
  await dialog.locator('[data-action="music-source"]').selectOption('radio');
  await dialog.getByLabel('Gênero da rádio').selectOption('Heavy Metal');
  await dialog.getByRole('button', { name: 'BUSCAR' }).click();
  const stationList = dialog.getByLabel('Estação de rádio');
  await expect.poll(async () => stationList.locator('option').count(), { timeout: 25_000 }).toBeGreaterThan(1);
  const stations = await stationList.locator('option').evaluateAll(options => options.slice(1, 4).map(option => ({
    uuid: (option as HTMLOptionElement).value, name: (option as HTMLOptionElement).textContent ?? '',
  })));
  let played: { name: string; status: string; codec: string; host: string } | null = null;
  for (const station of stations) {
    await stationList.selectOption(station.uuid);
    await dialog.locator('[data-action="radio-play"]').click();
    for (let poll = 0; poll < 36; poll += 1) {
      const result = await inspect(page, game => ({ status: game.riffshotRadio.state.status,
        codec: game.riffshotRadio.state.station?.codec ?? '', url: game.riffshotRadio.audio.currentSrc }));
      const status = String(result.status);
      if (status === 'playing') {
        const streamUrl = String(result.url);
        played = { name: station.name, status, codec: String(result.codec), host: new URL(streamUrl).host };
        break;
      }
      if (status === 'unavailable') break;
      await page.waitForTimeout(250);
    }
    if (played) break;
    await inspect(page, game => game.riffshotRadio.pause());
  }
  await testInfo.attach('radio-browser-live', { body: JSON.stringify({ tried: stations.map(item => item.name), played }, null, 2),
    contentType: 'application/json' });
  expect(played, `nenhuma das ${stations.length} primeiras estações HTTPS de Heavy Metal tocou sem proxy`).not.toBeNull();
  console.info(`RIFFSHOT RADIO stream ao vivo confirmado: ${played?.name} (${played?.codec}) em ${played?.host}`);
  await page.screenshot({ path: 'previews-ui/riffshot-radio-live-stream.png' });
});
