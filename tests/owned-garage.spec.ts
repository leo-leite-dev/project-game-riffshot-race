import { test, expect, openMenu, waitScene, clickObject } from './helpers.ts';
import type { Page } from '@playwright/test';

type InspectArgument = { tab?: 'shop' | 'garage'; empty?: boolean };
type InspectScene = {
  scene: { key: string; start(key: string): void }; activeTab: string; options: Array<{ id: string }>;
  garageView?: { vehicles: Array<{ userData: { vehicleId: string } }>; cameraFocus: number; focusX: number };
  presentationCopies: number; selectedVehicle: { id: string }; cards: Array<{ soldBadge: { visible: boolean }; input?: { enabled: boolean } }>;
  select(index: number): void; loadingLabel: { text: string }; feedback: { text: string }; isGarage: boolean;
  switchTab(tab: 'shop' | 'garage'): void;
};
type InspectGame = {
  championship: { state: unknown; startRace(): void };
  scene: { getScenes(active: boolean): InspectScene[]; getScene(key: string): InspectScene };
  scale: { width: number }; textures: { getTextureKeys(): string[] };
};
type CurrentState = { money: number; selections: { vehicleId: string | null } };
import { CHARACTERS } from '../src/data/characters.ts';
import { createChampionshipState, setSelections } from '../src/championship/championshipState.ts';
import { CHAMPIONSHIP_SAVE_KEY } from '../src/championship/championshipStorage.ts';

test.setTimeout(120_000);
const inspect = (page: Page, fn: (game: InspectGame, argument: InspectArgument) => unknown, argument: InspectArgument = {}) => page.evaluate(async ({ source, argument }: { source: string; argument: InspectArgument }) => {
  const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]'); if (!script) throw new Error('Entrada ausente'); const { game } = await import(script.src);
  const evaluator = new Function('game', 'argument', `return (${source})(game, argument)`) as (game: InspectGame, argument: InspectArgument) => unknown;
  return evaluator(game, argument);
}, { source: fn.toString(), argument });
const currentState = (page: Page) => inspect(page, game => game.championship.state) as Promise<CurrentState>;
async function seed(page: Page, owned: string[], selected: string | null = null) {
  const fresh = createChampionshipState({ id: 'owned-garage-fixture', attemptId: 'owned-garage-attempt' });
  const value = setSelections({ ...fresh, money: 50000, ownedVehicleIds: owned }, {
    pilotId: CHARACTERS[0].id, difficultyId: 'normal', vehicleId: selected, paintId: selected ? 'inferno' : null,
  });
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
  }, { key: CHAMPIONSHIP_SAVE_KEY, value });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMenu(page);
}
async function tabReady(page: Page, tab: 'shop' | 'garage', empty = false) {
  await expect.poll(() => inspect(page, (game, argument) => {
    const { tab, empty } = argument as unknown as { tab: 'shop' | 'garage'; empty: boolean };
    const scene = game.scene.getScenes(true)[0];
    return (String(scene?.scene.key) === 'VehicleSelection' && String(scene.activeTab) === tab
       && (empty ? Number(scene.options.length) === 0 && !scene.garageView : !!scene.garageView && Number(scene.presentationCopies) > 0));
  }, { tab, empty }), { timeout: 30_000 }).toBe(true);
  await waitScene(page, 'VehicleSelection');
}
async function capture(page: Page, path: string) {
  await expect.poll(() => inspect(page, game => {
    const view = game.scene.getScenes(true)[0].garageView;
    return !view || Math.abs(Number(view.cameraFocus) - Number(view.focusX)) < 0.05;
  }), { timeout: 15_000 }).toBe(true);
  await page.screenshot({ path });
}

test('garagem adquiridos: loja sela vendidos, ignora mouse/teclado e garagem equipa prêmio sem novo débito', async ({ page }) => {
  await seed(page, ['rift-blaze', 'volt-vector', 'widowmaker'], 'volt-vector');
  await page.keyboard.press('Enter'); await waitScene(page, 'RacePreparation');
  await clickObject(page, 'modules', 3); await tabReady(page, 'shop');
  expect(await inspect(page, game => {
    const scene = game.scene.getScene('VehicleSelection');
    return { selected: scene.selectedVehicle.id,
       sold: scene.cards.map((card: InspectScene['cards'][number]) => card.soldBadge.visible), disabled: scene.cards.map((card: InspectScene['cards'][number]) => !card.input?.enabled) };
  })).toEqual({ selected: 'iron-bastion', sold: [true, true, false, false, true], disabled: [true, true, false, false, true] });
  const before = await currentState(page);
  await clickObject(page, 'cards', 0);
  await inspect(page, game => game.scene.getScene('VehicleSelection').select(1));
  expect(await inspect(page, game => game.scene.getScene('VehicleSelection').selectedVehicle.id)).toBe('iron-bastion');
  await page.keyboard.press('ArrowRight');
  expect(await inspect(page, game => game.scene.getScene('VehicleSelection').selectedVehicle.id)).toBe('race-car-2');
  await page.keyboard.press('ArrowRight');
  expect(await inspect(page, game => game.scene.getScene('VehicleSelection').selectedVehicle.id)).toBe('iron-bastion');
  await page.keyboard.press('ArrowLeft');
  expect(await inspect(page, game => game.scene.getScene('VehicleSelection').selectedVehicle.id)).toBe('race-car-2');
  expect(await currentState(page)).toEqual(before);
  await capture(page, 'previews-ui/loja-ja-vendido-desktop.png');
  await clickObject(page, 'garageTab'); await tabReady(page, 'garage');
  expect(await inspect(page, game => {
    const scene = game.scene.getScene('VehicleSelection');
    return { options: scene.options.map((vehicle: { id: string }) => vehicle.id),
      models: scene.garageView?.vehicles.map((vehicle: { userData: { vehicleId: string } }) => vehicle.userData.vehicleId) ?? [], selected: scene.selectedVehicle.id };
  })).toEqual({ options: ['rift-blaze', 'volt-vector', 'widowmaker'], models: ['rift-blaze', 'volt-vector', 'widowmaker'], selected: 'volt-vector' });
  await clickObject(page, 'cards', 2);
  await capture(page, 'previews-ui/minha-garagem-desktop.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => inspect(page, game => game.scale.width)).toBe(390);
  await capture(page, 'previews-ui/minha-garagem-mobile.png');
  await clickObject(page, 'shopTab'); await tabReady(page, 'shop');
  await capture(page, 'previews-ui/loja-ja-vendido-mobile.png');
  // Switching tabs never writes, spends or changes the equipped vehicle.
  expect(await currentState(page)).toEqual(before);
  await clickObject(page, 'garageTab'); await tabReady(page, 'garage');
  await clickObject(page, 'cards', 2);
  await clickObject(page, 'confirmButton');
  await clickObject(page, 'confirmButton');
  await expect.poll(() => inspect(page, game => game.scene.getScenes(true)[0].scene.key), { timeout: 30_000 }).toBe('RacePreparation');
  expect(await currentState(page)).toMatchObject({ money: before.money, selections: { vehicleId: 'widowmaker' } });
  await page.reload();
  await page.keyboard.press('Enter'); await waitScene(page, 'MainMenu');
  await page.keyboard.press('Enter'); await waitScene(page, 'RacePreparation');
  expect(await currentState(page)).toMatchObject({ money: before.money, selections: { vehicleId: 'widowmaker' } });
});

test('garagem vazia: aba informa ausência sem veículo fictício e permite voltar à primeira compra', async ({ page }) => {
  await seed(page, []);
  await inspect(page, game => game.scene.getScenes(true)[0].scene.start('VehicleSelection'));
  await tabReady(page, 'shop');
  const before = await currentState(page);
  await clickObject(page, 'garageTab'); await tabReady(page, 'garage', true);
  expect(await inspect(page, game => game.scene.getScene('VehicleSelection').loadingLabel.text)).toContain('NENHUM CARRO ADQUIRIDO');
  await clickObject(page, 'confirmButton');
  expect(await currentState(page)).toEqual(before);
  await capture(page, 'previews-ui/minha-garagem-vazia.png');
  // Keyboard Tab and Shift+Tab reach both tabs even without vehicle cards.
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  await tabReady(page, 'shop');
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Enter');
  await tabReady(page, 'garage', true);
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Enter');
  await tabReady(page, 'shop');
  expect(await inspect(page, game => game.scene.getScene('VehicleSelection').options.length)).toBe(3);
  expect(await currentState(page)).toEqual(before);
});

test('garagem bloqueada: corrida ativa impede equipamento e alternância rápida não duplica preview', async ({ page }) => {
  await seed(page, ['rift-blaze', 'volt-vector'], 'volt-vector');
  await page.keyboard.press('Enter'); await waitScene(page, 'RacePreparation');
  await inspect(page, game => game.championship.startRace());
  const before = await currentState(page);
  await clickObject(page, 'modules', 3); await tabReady(page, 'shop');
  for (const tab of ['garage', 'shop', 'garage'] as const) {
    await inspect(page, game => {
      const scene = game.scene.getScene('VehicleSelection');
      scene.switchTab(scene.isGarage ? 'shop' : 'garage');
      scene.switchTab(scene.isGarage ? 'shop' : 'garage');
    });
    await tabReady(page, tab);
  }
  await clickObject(page, 'cards', 0);
  await clickObject(page, 'confirmButton');
  expect(await inspect(page, game => game.scene.getScene('VehicleSelection').feedback.text)).toContain('Conclua a corrida');
  expect(await currentState(page)).toEqual(before);
  expect(await inspect(page, game => game.textures.getTextureKeys().filter((key: string) => key === 'VehicleSelection-garage-preview').length)).toBe(1);
});
