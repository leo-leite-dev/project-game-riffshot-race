import { CHARACTERS, ATTRIBUTE_SCALE } from '../src/data/characters.ts';
import { getPilotProfile } from '../src/data/pilotos/index.ts';
import type { PilotHandlingAttribute } from '../src/data/characters.ts';
import { test, expect, state, waitScene, openCharacters, clickObject } from './helpers.ts';
import type { Page, TestInfo } from '@playwright/test';

async function selectPilot(page: Page, index: number): Promise<void> {
  const selected = (await state(page)).selected ?? 0;
  const steps = (index - selected + CHARACTERS.length) % CHARACTERS.length;
  for (let step = 0; step < steps; step += 1) await page.keyboard.press('ArrowRight');
}

test('nove pilotos distintos mostram retratos, descrição e atributos centralizados', async ({ page }, testInfo) => {
  expect(CHARACTERS).toHaveLength(9);
  expect(new Set(CHARACTERS.map(character => character.id)).size).toBe(9);
  expect(new Set(CHARACTERS.map(character => JSON.stringify(character.stats))).size).toBe(9);
  await openCharacters(page);
  for (const [index, character] of CHARACTERS.entries()) {
    const specialties = character.specialties as readonly PilotHandlingAttribute[];
    expect(Object.values(character.stats).reduce((sum, value) => sum + value, 0)).toBe(30);
    for (const rating of Object.values(character.stats)) expect(rating).toBeGreaterThanOrEqual(1);
    for (const rating of Object.values(character.stats)) expect(rating).toBeLessThanOrEqual(ATTRIBUTE_SCALE);
    expect(character.specialties).toHaveLength(2);
    expect(Object.keys(character.bonusAttributes)).toHaveLength(2);
    expect(new Set(Object.keys(character.bonusAttributes)).size).toBe(2);
    await selectPilot(page, index);
    expect((await state(page)).selected).toBe(index);
    expect((await state(page)).characterId).toBeNull();
    const displayed = await page.evaluate(async () => {
      const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]'); if (!script) throw new Error('Entrada ausente'); const { game } = await import(script.src);
        const { details } = game.scene.getScene('CharacterSelection') as { details: { name: { text: string }; description: { text: string; height: number; getWrappedText(): string[] }; descriptionViewportHeight: number; bonusTitle: { text: string }; bonusCards: Array<{ texture: { key: string }; visible: boolean; x: number; y: number; displayWidth: number; displayHeight: number }>; planetName: { text: string; visible: boolean }; planetDescription: { text: string; visible: boolean }; planetArtwork: { texture: { key: string }; visible: boolean }; planetEmblem: { texture: { key: string }; visible: boolean }; trackArtwork: { texture: { key: string }; visible: boolean }; trackFrame: { texture: { key: string }; visible: boolean }; trackFlag: { texture: { key: string }; visible: boolean }; trackTitle: { text: string; visible: boolean }; portrait: { texture: { key: string } } } };
        return {
           name: details.name.text, description: details.description.text,
           descriptionLines: details.description.getWrappedText().length,
           descriptionHeight: details.description.height,
           descriptionViewportHeight: details.descriptionViewportHeight,
          bonusTitle: details.bonusTitle.text,
           bonusCards: details.bonusCards.map((card: { texture: { key: string }; visible: boolean; x: number; y: number; displayWidth: number; displayHeight: number }) => ({ key: card.texture.key, visible: card.visible, x: card.x, y: card.y, width: card.displayWidth, height: card.displayHeight })),
          planetName: details.planetName.text,
          planetDescription: details.planetDescription.text,
          planetArtwork: details.planetArtwork.texture.key,
          planetEmblem: details.planetEmblem.texture.key,
           trackArtwork: details.trackArtwork.texture.key,
           trackFrame: details.trackFrame.texture.key,
          trackVisible: details.trackArtwork.visible,
          trackFlag: details.trackFlag.texture.key,
          trackFlagVisible: details.trackFlag.visible,
          trackTitleVisible: details.trackTitle.visible,
          trackTitle: details.trackTitle.text,
          planetArtworkVisible: details.planetArtwork.visible,
          planetEmblemVisible: details.planetEmblem.visible,
          planetNameVisible: details.planetName.visible,
          planetDescriptionVisible: details.planetDescription.visible,
          portrait: details.portrait.texture.key,
        };
    }) as { name: string; description: string; descriptionLines: number; descriptionHeight: number; descriptionViewportHeight: number; bonusTitle: string; bonusCards: Array<{ key: string; visible: boolean; x: number; y: number; width: number; height: number }>; planetName: string; planetDescription: string; planetArtwork: string; planetEmblem: string; trackArtwork: string; trackFrame: string; trackVisible: boolean; trackFlag: string; trackFlagVisible: boolean; trackTitleVisible: boolean; trackTitle: string; planetArtworkVisible: boolean; planetEmblemVisible: boolean; planetNameVisible: boolean; planetDescriptionVisible: boolean; portrait: string };
    const profile = getPilotProfile(character.id);
    expect(profile).toBeDefined();
    expect(displayed.name).toBe(profile!.nome);
    expect(displayed.description).toBe(profile!.resumo);
    expect(displayed.descriptionLines).toBeGreaterThanOrEqual(2);
    expect(displayed.descriptionLines).toBeLessThanOrEqual(5);
    expect(displayed.descriptionHeight).toBeLessThanOrEqual(displayed.descriptionViewportHeight);
    expect(displayed.bonusTitle).toBe('BÔNUS DO PILOTO');
    expect(displayed.bonusCards).toHaveLength(2);
    expect(displayed.bonusCards.map(card => card.key)).toEqual(
      Object.keys(character.bonusAttributes).map(key => `pilot-bonus-card-${key}`),
    );
    expect(displayed.bonusCards.every(card => card.visible && card.width > 0 && card.height > 0)).toBe(true);
    expect(displayed.bonusCards[0]!.y).toBe(displayed.bonusCards[1]!.y);
    expect(displayed.bonusCards[0]!.x).toBeLessThan(displayed.bonusCards[1]!.x);
    expect(displayed.trackFrame).toBe('pilot-track-empty-quadrant-frame');
     const expectedPlanets: Record<string, { name: string; artwork: string; track?: string; trackVisible: boolean; detailsVisible: boolean }> = {
      'axel-ryder': { name: 'VOLTARIS', artwork: 'pilot-world-voltaris-globe', track: 'pilot-track-axel-ryder', trackVisible: true, detailsVisible: true },
      'neon-kira': { name: 'NYRA-7', artwork: 'pilot-world-neon-kira', track: 'pilot-track-neon-kira', trackVisible: true, detailsVisible: true },
      'leonard-lyon': { name: 'KAELITH', artwork: 'pilot-world-leonard-lyon', track: 'pilot-track-leonard-lyon', trackVisible: true, detailsVisible: true },
      'rox-z7': { name: 'SOLKAR', artwork: 'pilot-world-rox-z7', track: 'pilot-track-rox-z7', trackVisible: true, detailsVisible: true },
      'brok-thorn': { name: 'THORGAR', artwork: 'pilot-world-brok-thorn', track: 'pilot-track-brok-thorn-selected', trackVisible: true, detailsVisible: true },
      'vyra-noctis': { name: 'NOCTIS PRIME', artwork: 'pilot-world-vyra-noctis', track: 'pilot-track-vyra-noctis', trackVisible: true, detailsVisible: true },
      'dagger-raven': { name: 'ECLIPSIS', artwork: 'pilot-world-dagger-raven', trackVisible: false, detailsVisible: true },
      'cyber-dragon': { name: 'DRAKORYN', artwork: 'pilot-world-cyber-dragon', track: 'pilot-track-cyber-dragon', trackVisible: true, detailsVisible: true },
      'drax-mare': { name: 'TIDARIS', artwork: 'pilot-world-drax-mare', track: 'pilot-track-drax-mare', trackVisible: true, detailsVisible: true },
    };
    const expectedPlanet = expectedPlanets[character.id];
    expect(displayed.trackFlag).toBe('pilot-master-flag-color');
    expect(displayed.planetName).toBe(expectedPlanet.name);
    expect(displayed.planetDescription.length).toBeGreaterThan(20);
    if (character.id === 'neon-kira') {
      expect(displayed.planetDescription).toContain('Montanhas violeta');
    }
    if (character.id === 'brok-thorn') {
      expect(displayed.planetDescription).toContain('Picos gelados');
    }
    if (character.id === 'leonard-lyon') {
      expect(displayed.planetDescription).toContain('Florestas verdejantes');
    }
    if (character.id === 'rox-z7') {
      expect(displayed.planetDescription).toContain('Tempestades elétricas');
    }
    if (character.id === 'vyra-noctis') {
      expect(displayed.planetDescription).toContain('Noctis Prime');
      expect(displayed.trackTitle).toBe('PISTA DE NOCTIS');
    }
    if (character.id === 'cyber-dragon') {
      expect(displayed.planetDescription).toContain('montanhas violetas');
    }
    if (character.id === 'drax-mare') {
      expect(displayed.planetDescription).toContain('Oceanos azuis');
    }
    if (character.id === 'dagger-raven') {
      expect(displayed.planetDescription).toContain('Cinzas vulcânicas');
    }
    expect(displayed.planetArtwork).toBe(expectedPlanet.artwork);
    expect(displayed.planetEmblemVisible).toBe(false);
    if (expectedPlanet.track) {
      expect(displayed.trackArtwork).toBe(`track-preview-${expectedPlanet.track}`);
    }
    expect([
      displayed.planetArtworkVisible, displayed.planetNameVisible,
      displayed.planetDescriptionVisible,
    ]).toEqual([expectedPlanet.detailsVisible, expectedPlanet.detailsVisible, expectedPlanet.detailsVisible]);
    expect(displayed.planetEmblemVisible).toBe(false);
    expect(displayed.trackVisible).toBe(expectedPlanet.trackVisible);
    expect(displayed.trackFlagVisible).toBe(expectedPlanet.trackVisible);
    expect(displayed.trackTitleVisible).toBe(expectedPlanet.trackVisible);
    expect(displayed.portrait).toBe(character.id === 'neon-kira'
      ? 'pilot-fullbody-kira'
      : `pilot-card-${character.id}`);
    expect(displayed.description).toBe(profile!.resumo);
    if (index === 0) await page.screenshot({ path: `previews-ui/piloto-especialidades-${testInfo.project.name}.png` });
  }
});

test('descrição do piloto fica parada, cabe no painel e mantém rolagem do planeta', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openCharacters(page);
  const initial = await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!;
    const { game } = await import(script.src);
    const scene = game.scene.getScene('CharacterSelection');
    scene.select(0);
    const details = scene.details;
    return {
      y: details.description.y,
      text: details.description.text,
      lines: details.description.getWrappedText().length,
      height: details.description.height,
      viewportHeight: details.descriptionViewportHeight,
      planetY: details.planetDescription.y,
    };
  });
  expect(initial.lines).toBeGreaterThanOrEqual(2);
  expect(initial.lines).toBeLessThanOrEqual(5);
  expect(initial.height).toBeLessThanOrEqual(initial.viewportHeight);
  expect(initial.text).toBe(getPilotProfile('axel-ryder')!.resumo);

  const afterWait = await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!;
    const { game } = await import(script.src);
    const details = game.scene.getScene('CharacterSelection').details;
    details.updateDescriptionAnimations(1600);
    for (let frame = 0; frame < 40; frame += 1) details.updateDescriptionAnimations(50);
    return {
      characterY: details.description.y,
      planetY: details.planetDescription.y,
      scrollOffset: details.planetDescriptionScrollOffset,
      scrollLimit: details.planetDescriptionMaxScroll,
      reducedMotion: details.reducedMotionQuery.matches,
      visible: details.planetDescription.visible,
    };
  });
  expect(afterWait.characterY).toBe(initial.y);
  expect(afterWait.planetY, JSON.stringify(afterWait)).toBeLessThan(initial.planetY);
});

test('LORE só rola com overflow, pausa no hover, aceita wheel e retorna suavemente', async ({ page }) => {
  await openCharacters(page);
  const result = await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!;
    const { game } = await import(script.src);
    const scene = game.scene.getScene('CharacterSelection');
    scene.select(6);
    const details = scene.details;
    details.description.setText('LORE DE TESTE PARA ROLAGEM. '.repeat(180));
    details.descriptionMaxScroll = Math.max(0,
      details.description.height - details.descriptionViewportHeight);
    const hasOverflow = details.descriptionMaxScroll > 0;
    details.descriptionScrollOffset = 0;
    details.descriptionScrollVelocity = 0;
    details.descriptionPhase = 'start-pause';
    details.descriptionPhaseElapsed = 0;
    details.descriptionBaseY = details.description.y;
    const tick = (frames: number) => {
      for (let frame = 0; frame < frames; frame += 1) details.updateDescriptionAnimations(50);
    };

    tick(39);
    const stillAtTopBeforeTwoSeconds = details.descriptionScrollOffset === 0;
    tick(1);
    tick(2);
    const scrollStarted = details.descriptionScrollOffset > 0;
    details.loreScrollZone.emit('pointerover');
    const hoverOffset = details.descriptionScrollOffset;
    tick(20);
    const pausedOnHover = details.descriptionScrollOffset === hoverOffset;
    scene.input.emit('wheel', {}, [], 0, 80, 0);
    const movedByWheel = details.descriptionScrollOffset > hoverOffset;
    const wheelOffset = details.descriptionScrollOffset;
    details.loreScrollZone.emit('pointerout');
    tick(20);
    const resumedFromWheelPosition = details.descriptionScrollOffset > wheelOffset;

    details.descriptionMaxScroll = 3;
    details.descriptionScrollOffset = 0;
    details.descriptionScrollVelocity = 0;
    details.descriptionPhase = 'start-pause';
    details.descriptionPhaseElapsed = 0;
    tick(40);
    let frames = 0;
    while (details.descriptionPhase !== 'end-pause' && frames < 100) {
      tick(1);
      frames += 1;
    }
    const reachedBottom = details.descriptionScrollOffset === 3;
    tick(60);
    const waitedThreeSeconds = details.descriptionPhase === 'returning';
    const offsetBeforeReturn = details.descriptionScrollOffset;
    tick(1);
    const returnedWithoutSnap = details.descriptionScrollOffset < offsetBeforeReturn
      && details.descriptionScrollOffset > 0;
    while (details.descriptionScrollOffset > 0 && frames < 250) {
      tick(1);
      frames += 1;
    }
    const returnedToTop = details.descriptionScrollOffset === 0
      && details.descriptionPhase === 'start-pause';
    details.descriptionScrollOffset = 12;
    details.descriptionPhase = 'scrolling';
    details.descriptionPhaseElapsed = 0;
    scene.select(7);
    const resetOnPilotChange = details.descriptionScrollOffset === 0
      && details.descriptionPhase === 'start-pause';
    return {
      overflow: hasOverflow,
      stillAtTopBeforeTwoSeconds,
      scrollStarted,
      pausedOnHover,
      movedByWheel,
      resumedFromWheelPosition,
      reachedBottom,
      waitedThreeSeconds,
      returnedWithoutSnap,
      returnedToTop,
      resetOnPilotChange,
    };
  });
  expect(result).toEqual({
    overflow: true,
    stillAtTopBeforeTwoSeconds: true,
    scrollStarted: true,
    pausedOnHover: true,
    movedByWheel: true,
    resumedFromWheelPosition: true,
    reachedBottom: true,
    waitedThreeSeconds: true,
    returnedWithoutSnap: true,
    returnedToTop: true,
    resetOnPilotChange: true,
  });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedMotionOffset = await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!;
    const { game } = await import(script.src);
    const details = game.scene.getScene('CharacterSelection').details;
    details.descriptionMaxScroll = 100;
    details.descriptionScrollOffset = 25;
    details.descriptionScrollVelocity = 0;
    details.descriptionPhase = 'scrolling';
    for (let frame = 0; frame < 40; frame += 1) details.updateDescriptionAnimations(50);
    return { reduced: details.reducedMotionQuery.matches, offset: details.descriptionScrollOffset };
  });
  expect(reducedMotionOffset).toEqual({ reduced: true, offset: 25 });
});

test('Brok Thorn mantém os atributos ofensivos e os dados persistidos do piloto correspondente', async ({ page }) => {
  const dax = CHARACTERS.find(character => character.id === 'brok-thorn');
  if (!dax) throw new Error('DAX VOLTAGE não encontrado');
  expect(dax).toMatchObject({
    name: 'BROK THORN', profile: 'O REI DA SUCATA',
    stats: { speed: 6, acceleration: 5, handling: 4, endurance: 6, aggression: 9 },
    portrait: { accent: '#ffb454', style: 'resonance' },
  });
  expect(dax.description).toContain('Técnico de ressonância');
  await openCharacters(page);
  await selectPilot(page, CHARACTERS.indexOf(dax));
  await expect(page.locator('#screen-status')).toContainText('BROK THORN');
  const portrait = await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]'); if (!script) throw new Error('Entrada ausente'); const { game } = await import(script.src);
     const scene = game.scene.getScene('CharacterSelection') as { details: { name: { text: string }; portrait: { texture: { key: string } } } };
    return { name: scene.details.name.text, key: scene.details.portrait.texture.key };
  });
  expect(portrait).toEqual({ name: 'BROK THORN', key: 'pilot-card-brok-thorn' });
});

test('CONFIRMAR abre o mapa com o piloto escolhido e VOLTAR continua funcional', async ({ page }) => {
  await openCharacters(page);
  await page.keyboard.press('ArrowLeft');
  expect((await state(page)).selected).toBe(8);
  await clickObject(page, 'confirmButton');
  await waitScene(page, 'GalacticMap');
  expect((await state(page)).characterId).toBe('drax-mare');
  await page.keyboard.press('Escape');
  await waitScene(page, 'CharacterSelection');
  expect((await state(page)).selected).toBe(8);
  await clickObject(page, 'backButton');
  await waitScene(page, 'MainMenu');
  expect((await state(page)).characterId).toBe('drax-mare');
});

test('Tab alcança confirmar e voltar sem criar uma seleção ao cancelar', async ({ page }) => {
  await openCharacters(page);
  for (let i = 0; i < 9; i += 1) await page.keyboard.press('Tab');
  expect((await state(page)).focus).toBe(9);
  await page.keyboard.press('Tab');
  expect((await state(page)).focus).toBe(10);
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
      return [scene.title, scene.details, scene.confirmButton, scene.backButton].every(object => {
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
