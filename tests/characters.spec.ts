import { CHARACTERS, ATTRIBUTES, ATTRIBUTE_SCALE } from '../src/data/characters.ts';
import type { PilotAttribute } from '../src/data/characters.ts';
import { createChampionshipState } from '../src/championship/championshipState.ts';
import { CHAMPIONSHIP_SAVE_KEY } from '../src/championship/championshipStorage.ts';
import { test, expect, state, waitScene, openCharacters, clickObject } from './helpers.ts';
import type { Page, TestInfo } from '@playwright/test';

test('seis pilotos distintos mostram retratos, descrição e atributos centralizados', async ({ page }, testInfo) => {
  expect(CHARACTERS).toHaveLength(6);
  expect(new Set(CHARACTERS.map(character => character.id)).size).toBe(6);
  expect(new Set(CHARACTERS.map(character => JSON.stringify(character.stats))).size).toBe(6);
  await openCharacters(page);
  for (const [index, character] of CHARACTERS.entries()) {
    const specialties = character.specialties as readonly PilotAttribute[];
    expect(Object.values(character.stats).reduce((sum, value) => sum + value, 0)).toBe(30);
    for (const { key } of ATTRIBUTES as Array<{ key: keyof typeof character.stats }>) expect(character.stats[key]).toBeGreaterThanOrEqual(1);
    for (const { key } of ATTRIBUTES as Array<{ key: keyof typeof character.stats }>) expect(character.stats[key]).toBeLessThanOrEqual(ATTRIBUTE_SCALE);
    expect(character.specialties).toHaveLength(2);
    await clickObject(page, 'cards', index);
    expect((await state(page)).selected).toBe(index);
    expect((await state(page)).characterId).toBeNull();
    const displayed = await page.evaluate(async () => {
      const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]'); if (!script) throw new Error('Entrada ausente'); const { game } = await import(script.src);
        const { details } = game.scene.getScene('CharacterSelection') as { details: { name: { text: string }; description: { text: string }; specialtyNote: { text: string }; statValues: Array<{ text: string }>; portrait: { texture: { key: string } } } };
       return {
         name: details.name.text, description: details.description.text,
          specialtyNote: details.specialtyNote.text,
          values: details.statValues.map((value: { text: string }) => value.text),
         portrait: details.portrait.texture.key,
       };
    }) as { name: string; description: string; specialtyNote: string; values: string[]; portrait: string };
    expect(displayed.name).toBe(character.name);
    expect(displayed.description).toBe(character.description);
    expect(displayed.values).toEqual((ATTRIBUTES as Array<{ key: keyof typeof character.stats }>).map(({ key }) =>
      specialties.includes(key) ? String(character.stats[key]).padStart(2, '0') : '—'));
    const activeLabels = (ATTRIBUTES as unknown as Array<{ key: PilotAttribute; label: string }>)
      .filter(({ key }) => specialties.includes(key)).map(attribute => attribute.label);
    expect(displayed.specialtyNote).toBe(`TALENTOS ATIVOS / ${activeLabels.join(' + ')} / MÁX. ±1 PONTO CADA`);
    expect(displayed.portrait).toBe(`pilot-${character.id}`);
    if (index === 0) await page.screenshot({ path: `previews-ui/piloto-especialidades-${testInfo.project.name}.png` });
  }
});

test('Dax Voltage mantém os atributos ofensivos e uma identidade original de técnico de áudio', async ({ page }) => {
  const dax = CHARACTERS.find(character => character.id === 'dax-voltage');
  if (!dax) throw new Error('DAX VOLTAGE não encontrado');
  expect(dax).toMatchObject({
    name: 'DAX VOLTAGE', profile: 'ENGENHARIA DE SOM',
    stats: { speed: 6, acceleration: 5, handling: 4, endurance: 6, aggression: 9 },
    portrait: { accent: '#ffb454', style: 'resonance' },
  });
  expect(dax.description).toContain('Técnico de ressonância');
  await openCharacters(page);
  await clickObject(page, 'cards', CHARACTERS.indexOf(dax));
  await expect(page.locator('#screen-status')).toContainText('DAX VOLTAGE');
  const portrait = await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]'); if (!script) throw new Error('Entrada ausente'); const { game } = await import(script.src);
     const scene = game.scene.getScene('CharacterSelection') as { details: { name: { text: string }; portrait: { texture: { key: string } } } };
    return { name: scene.details.name.text, key: scene.details.portrait.texture.key };
  });
  expect(portrait).toEqual({ name: 'DAX VOLTAGE', key: 'pilot-dax-voltage' });
});

test('confirmação armazena o piloto; troca, cancelamento e recarga preservam a escolha confirmada', async ({ page }) => {
  test.setTimeout(45_000);
  const seed = { ...createChampionshipState({ id: 'characters-career', attemptId: 'characters-attempt' }),
    ownedVehicleIds: ['rift-blaze'] };
  await page.addInitScript(({ key, seed }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(seed));
  }, { key: CHAMPIONSHIP_SAVE_KEY, seed });
  await openCharacters(page);
  await page.keyboard.press('ArrowLeft');
  expect((await state(page)).selected).toBe(5);
  await clickObject(page, 'confirmButton');
  await waitScene(page, 'VehicleSelection');
  expect((await state(page)).characterId).toBe('zuri-spark');
  await expect(page.locator('#screen-status')).toContainText('ZURI SPARK');
  await clickObject(page, 'changeButton');
  await waitScene(page, 'CharacterSelection');
  expect((await state(page)).selected).toBe(5);
  await page.keyboard.press('ArrowRight');
  expect((await state(page)).selected).toBe(0);
  await page.keyboard.press('Escape');
  await waitScene(page, 'MainMenu');
  expect((await state(page)).characterId).toBe('zuri-spark');
  await page.keyboard.press('Enter');
  await waitScene(page, 'DifficultySelection');
  await page.keyboard.press('Enter');
  await waitScene(page, 'CharacterSelection');
  expect((await state(page)).selected).toBe(5);
  await page.keyboard.press('ArrowUp');
  expect((await state(page)).selected).toBe(2);
  await page.keyboard.press('Space');
  await waitScene(page, 'VehicleSelection');
  expect((await state(page)).characterId).toBe('echo-7');
  await expect.poll(async () => page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]'); if (!script) throw new Error('Entrada ausente'); const { game } = await import(script.src);
    const scene = game.scene.getScene('VehicleSelection');
    return !!scene.garageView && scene.loadingLabel.text.includes('OFICINA ONLINE');
  }), { timeout: 15_000 }).toBe(true);
  await clickObject(page, 'confirmButton');
  await clickObject(page, 'confirmButton');
  await expect.poll(async () => (await state(page)).key, { timeout: 15_000 }).toBe('RacePreparation');
  await waitScene(page, 'RacePreparation');
  await page.reload();
  await expect.poll(async () => (await state(page)).key).toBe('Splash');
  expect((await state(page)).characterId).toBe('echo-7');
  expect((await state(page)).difficultyId).toBe('normal');
  await page.keyboard.press('Enter');
  await waitScene(page, 'MainMenu');
  await page.keyboard.press('Enter');
  await waitScene(page, 'RacePreparation');
  expect((await state(page)).characterId).toBe('echo-7');
});

test('Tab alcança confirmar e voltar sem criar uma seleção ao cancelar', async ({ page }) => {
  await openCharacters(page);
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('Tab');
  expect((await state(page)).focus).toBe(6);
  await page.keyboard.press('Tab');
  expect((await state(page)).focus).toBe(7);
  await page.keyboard.press('Enter');
  await waitScene(page, 'MainMenu');
  expect((await state(page)).characterId).toBeNull();
});

test('seleção permanece legível e dentro da tela ao redimensionar', async ({ page }, testInfo) => {
  await openCharacters(page);
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 },
    { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => page.evaluate(async () => {
      const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]'); if (!script) throw new Error('Entrada ausente'); const { game } = await import(script.src);
      const scene = game.scene.getScene('CharacterSelection');
      return [scene.title, ...scene.cards, scene.details, scene.confirmButton, scene.backButton].every(object => {
        const b = object.getBounds();
        return b.left >= 0 && b.right <= game.scale.width && b.top >= 54 && b.bottom < game.scale.height - 48;
      });
    })).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('characters-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'previews-ui/piloto-especialidades-mobile.png' });
  await page.screenshot({ path: testInfo.outputPath('characters-mobile.png') });
});
