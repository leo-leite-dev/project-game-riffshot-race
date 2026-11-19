import { CHARACTERS } from '../src/data/characters.ts';
import { getOriginPlanet } from '../src/data/originPlanets.ts';
import { test, expect, openCharacters, waitScene, clickObject, state } from './helpers.ts';

test('mapa apresenta origem e piloto selecionados sem declarar acesso não confirmado', async ({ page }) => {
  await openCharacters(page);
  await page.keyboard.press('ArrowRight');
  const selectedPilot = CHARACTERS[1]!;
  await clickObject(page, 'confirmButton');
  await waitScene(page, 'GalacticMap');
  const mapState = await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada do jogo não encontrada');
    const { game } = await import(script.src);
    const scene = game.scene.getScene('GalacticMap');
    return {
      selectedPilotId: game.registry.get('selectedCharacterId'),
      textureKeys: scene.children.list
        .filter((child: { visible: boolean; texture?: { key: string } }) => child.visible && child.texture)
        .map((child: { texture: { key: string } }) => child.texture.key),
      labels: scene.children.list
        .filter((child: { visible: boolean; type: string; text?: string }) => child.visible && child.type === 'Text')
        .map((child: { text: string }) => child.text),
    };
  });
  expect(mapState.selectedPilotId).toBe(selectedPilot.id);
  expect(mapState.textureKeys).toEqual(expect.arrayContaining([
    'galactic-map-artwork', 'pilot-world-neon-kira',
    'pilot-card-portrait-neon-kira', 'pilot-symbol-neon-kira',
  ]));
  expect(mapState.textureKeys.some((key: string) => key.startsWith('pilot-ui-icon-'))).toBe(false);
  expect(mapState.textureKeys.filter((key: string) => key === 'pilot-world-neon-kira')).toHaveLength(1);
  expect(mapState.labels).toEqual(expect.arrayContaining([
    'NYRA-7', 'PLANETA DE ORIGEM', 'PILOTO:', selectedPilot.name,
  ]));
  expect(mapState.labels).not.toContain('DISPONÍVEL');
  await page.screenshot({ path: 'previews-ui/mapa-galactico-painel-dinamico.png' });
  await page.keyboard.press('Escape');
  await waitScene(page, 'CharacterSelection');
  expect((await state(page)).characterId).toBe(selectedPilot.id);
  expect((await state(page)).selected).toBe(1);
  await page.keyboard.press('ArrowRight');
  await clickObject(page, 'confirmButton');
  await waitScene(page, 'GalacticMap');
  const nextPilotPanel = await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada do jogo não encontrada');
    const { game } = await import(script.src);
    const scene = game.scene.getScene('GalacticMap');
    return {
      textures: scene.children.list
        .filter((child: { texture?: { key: string } }) => child.texture?.key?.startsWith('pilot-world-')
          || child.texture?.key?.startsWith('pilot-card-portrait-')
          || child.texture?.key?.startsWith('pilot-symbol-'))
        .map((child: { texture: { key: string } }) => child.texture.key),
      labels: scene.children.list
        .filter((child: { type: string; text?: string }) => child.type === 'Text')
        .map((child: { text: string }) => child.text),
    };
  });
  expect(nextPilotPanel.textures).toEqual(expect.arrayContaining([
    'pilot-world-brok-thorn', 'pilot-card-portrait-brok-thorn',
    'pilot-symbol-brok-thorn',
  ]));
  expect(nextPilotPanel.labels).toEqual(expect.arrayContaining(['THORGAR', 'BROK THORN']));
});

test('Mapa Galáctico resolve o planeta e o ícone oficial de cada um dos nove IDs canônicos', async ({ page }) => {
  await openCharacters(page);
  for (const [index, pilot] of CHARACTERS.entries()) {
    if (index > 0) await page.keyboard.press('ArrowRight');
    await clickObject(page, 'confirmButton');
    await waitScene(page, 'GalacticMap');
    const mapState = await page.evaluate(async () => {
      const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
      if (!script) throw new Error('Entrada do jogo não encontrada');
      const { game } = await import(script.src);
      const scene = game.scene.getScene('GalacticMap');
      return {
        pilotId: game.registry.get('selectedCharacterId'),
        planetName: scene.originName?.text,
        planetArtwork: scene.planetArtwork?.texture.key,
        identityIcon: scene.pilotIcon?.texture.key,
      };
    });
    const planet = getOriginPlanet(pilot.originPlanetId);
    expect(planet).toBeDefined();
    expect(mapState).toEqual({
      pilotId: pilot.id,
      planetName: planet!.name,
      planetArtwork: planet!.artworkKey,
      identityIcon: pilot.identityIconKey,
    });
    await page.keyboard.press('Escape');
    await waitScene(page, 'CharacterSelection');
  }
});

test('CONFIRMAR abre o mapa galáctico com o piloto selecionado', async ({ page }) => {
  await openCharacters(page);
  await page.keyboard.press('ArrowRight');
  const selectedPilot = CHARACTERS[1]!;
  await page.keyboard.press('Enter');
  await waitScene(page, 'GalacticMap');
  expect(await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]');
    if (!script) throw new Error('Entrada do jogo não encontrada');
    const { game } = await import(script.src);
    return game.registry.get('selectedCharacterId');
  })).toBe(selectedPilot.id);
});
