import { test, expect, openCharacters, openMenu, clickObject, waitScene } from './helpers.js';
import { CHARACTERS } from '../src/data/characters.js';
import { createChampionshipState, setSelections, ensureAssignedTrack, beginChampionshipRace,
  applyChampionshipResult, acknowledgeChampionshipResult } from '../src/championship/championshipState.js';
import { CHAMPIONSHIP_SAVE_KEY } from '../src/championship/championshipStorage.js';

test.setTimeout(120_000);
const inspect = (page, fn) => page.evaluate(async source => {
  const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
  return new Function('game', `return (${source})(game)`)(game);
}, fn.toString());
const state = page => inspect(page, game => game.championship.state);
async function ready(page, scene = 'VehicleSelection') {
  // The real mechanical transfer takes ~7 seconds; it is not an input timeout.
  await expect.poll(() => inspect(page, game => game.scene.getScenes(true)[0]?.scene.key), { timeout: 25_000 }).toBe(scene);
  await waitScene(page, scene);
  await expect.poll(() => inspect(page, game => {
    const scene = game.scene.getScenes(true)[0];
    return !!scene.garageView && (scene.presentationCopies > 0 || (scene.ready && scene.presentationMode === 'direct'));
  }), { timeout: 90_000 }).toBe(true);
  expect(await inspect(page, game => game.garageResources.modelFailures)).toEqual([]);
  if (scene === 'RacePreparation') {
    await expect.poll(() => inspect(page, game => {
      const view = game.scene.getScene('RacePreparation').garageView;
      const canvas = view.resources.renderer.domElement;
      return canvas.width === view.width && canvas.height === view.height;
    })).toBe(true);
  }
}
async function capture(page, path) {
  // Wait for the real turntable camera, not just the card's immediate text.
  await expect.poll(() => inspect(page, game => {
    const view = game.scene.getScenes(true)[0]?.garageView;
    return !view || view.mode !== 'selection' || Math.abs(view.cameraFocus - view.focusX) < 0.05;
  }), { timeout: 20_000 }).toBe(true);
  await page.screenshot({ path });
}
function fixture({ money = 2000, wins = 0, receipt = false } = {}) {
  let value = createChampionshipState({ id: 'isolated-shop', attemptId: 'isolated-attempt' });
  value = setSelections({ ...value, money, ownedVehicleIds: ['volt-vector'] },
    { pilotId: CHARACTERS[0].id, vehicleId: 'volt-vector', paintId: 'inferno', difficultyId: 'normal' });
  for (let i = 0; i < wins; i++) {
    value = ensureAssignedTrack(value, () => 0.99);
    value = beginChampionshipRace(value, `isolated-race-${i}`);
    const race = value.activeRace;
    value = applyChampionshipResult(value, { raceId: race.id, attemptId: race.attemptId,
      trackId: race.trackId, trackName: 'DESAFIO ISOLADO', difficultyId: 'normal', laps: 4, elapsedTime: 100,
      standings: CHARACTERS.slice(0, 4).map((pilot, index) => ({ id: pilot.id, name: pilot.name,
        position: index + 1, isPlayer: index === 0, finishTime: 90 + index, lapsCompleted: 4, paintColor: '#E53935' })) });
    if (!receipt || i < wins - 1) value = acknowledgeChampionshipResult(value);
  }
  return value;
}
async function seed(page, value) {
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
  }, { key: CHAMPIONSHIP_SAVE_KEY, value });
}
async function enterTeam(page, value) {
  await seed(page, value);
  await openMenu(page);
  await page.keyboard.press('Enter');
  await ready(page, 'RacePreparation');
}
async function firstSelection(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openCharacters(page);
  await clickObject(page, 'confirmButton');
  await ready(page);
}
async function confirmPurchase(page, accept) {
  page.once('dialog', dialog => accept ? dialog.accept() : dialog.dismiss());
  await clickObject(page, 'confirmButton');
}

test('loja visual: seleção inicial tem três GLBs; Thunder Bug custa o saldo exato e compra cancelada preserva créditos', async ({ page }) => {
  await firstSelection(page);
  await expect(page.locator('#screen-status')).toContainText('THUNDER BUG');
  expect(await inspect(page, game => {
    const scene = game.scene.getScene('VehicleSelection');
    return { ids: scene.options.map(v => v.id), sources: scene.garageView.vehicles.map(v => v.userData.source),
      prices: scene.options.map(v => v.price) };
  })).toEqual({ ids: ['rift-blaze', 'volt-vector', 'iron-bastion'],
    sources: ['vehicle-glb', 'vehicle-glb', 'vehicle-glb'], prices: [2000, 800, 7500] });
  await capture(page, 'previews-ui/compra-inicial-desktop.png');
  await clickObject(page, 'cards', 2);
  await clickObject(page, 'confirmButton');
  expect(await inspect(page, game => game.scene.getScene('VehicleSelection').feedback.text)).toContain('5.500');
  expect((await state(page)).ownedVehicleIds).toEqual([]);
  await clickObject(page, 'cards', 0);
  await clickObject(page, 'confirmButton');
  await confirmPurchase(page, false);
  expect((await state(page)).money).toBe(2000);
  expect((await state(page)).ownedVehicleIds).toEqual([]);
  await confirmPurchase(page, true);
  await ready(page, 'RacePreparation');
  expect((await state(page))).toMatchObject({ money: 0, ownedVehicleIds: ['rift-blaze'] });
  await page.reload();
  await page.keyboard.press('Enter'); await waitScene(page, 'MainMenu');
  await page.keyboard.press('Enter'); await ready(page, 'RacePreparation');
  expect((await state(page))).toMatchObject({ money: 0, ownedVehicleIds: ['rift-blaze'] });
});

test('loja visual: Camaro custa 800 e mantém 1200; compra e equipe adaptam ao celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await firstSelection(page);
  await clickObject(page, 'cards', 1);
  await capture(page, 'previews-ui/compra-inicial-mobile.png');
  await clickObject(page, 'confirmButton');
  await confirmPurchase(page, true);
  await ready(page, 'RacePreparation');
  expect((await state(page))).toMatchObject({ money: 1200, ownedVehicleIds: ['volt-vector'] });
  await expect.poll(() => inspect(page, game => !!game.scene.getScene('RacePreparation').rivalPreview)).toBe(true);
  await capture(page, 'previews-ui/equipe-camaro-mobile.png');
});

test('loja visual: cinco opções, cadeado de fase 2 mesmo com dinheiro e equipamento sem cobrança repetida', async ({ page }) => {
  await enterTeam(page, fixture({ money: 50000 }));
  await clickObject(page, 'modules', 3);
  await ready(page);
  expect(await inspect(page, game => game.scene.getScene('VehicleSelection').options.length)).toBe(5);
  await clickObject(page, 'cards', 3);
  await expect(page.locator('#screen-status')).toContainText('AINDA NÃO LIBERADO');
  expect(await inspect(page, game => game.scene.getScene('VehicleSelection').confirmButton.locked)).toBe(true);
  await clickObject(page, 'confirmButton');
  expect((await state(page)).money).toBe(50000);
  await capture(page, 'previews-ui/loja-fase2-bloqueada-desktop.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => inspect(page, game => game.scale.width)).toBe(390);
  await capture(page, 'previews-ui/loja-fase2-bloqueada-mobile.png');
  await page.setViewportSize({ width: 1440, height: 900 });
  await clickObject(page, 'cards', 2);
  await clickObject(page, 'confirmButton');
  await confirmPurchase(page, true);
  await ready(page, 'RacePreparation');
  expect((await state(page))).toMatchObject({ money: 42500, ownedVehicleIds: ['volt-vector', 'iron-bastion'] });
  await clickObject(page, 'modules', 3); await ready(page);
  await clickObject(page, 'confirmButton'); await clickObject(page, 'confirmButton');
  await ready(page, 'RacePreparation');
  expect((await state(page)).money).toBe(42500);
});

test('rival visual: meta antes de oito oferece farming ou prêmio; cancelamento preserva e créditos são únicos após reload', async ({ page }) => {
  await seed(page, fixture({ money: 0, wins: 5, receipt: true }));
  await openMenu(page); await page.keyboard.press('Enter'); await waitScene(page, 'RaceResults');
  expect(await inspect(page, game => game.scene.getScene('RaceResults').canFarm)).toBe(true);
  await capture(page, 'previews-ui/resultado-meta-farming-desktop.png');
  await clickObject(page, 'replayButton'); await waitScene(page, 'RaceTrackSelection');
  expect((await state(page)).racesRun).toBe(5);
  expect((await state(page)).pendingResult).toBeNull();
  await page.keyboard.press('Escape'); await ready(page, 'RacePreparation');
  await capture(page, 'previews-ui/equipe-meta-premio-desktop.png');
  await clickObject(page, 'rewardButton'); await waitScene(page, 'RivalReward');
  await capture(page, 'previews-ui/premio-rival-desktop.png');
  page.once('dialog', dialog => dialog.dismiss());
  await clickObject(page, 'creditsButton');
  expect((await state(page)).rivalRewardChoice).toBeNull();
  expect((await state(page)).money).toBe(7500);
  await page.keyboard.press('Escape'); await ready(page, 'RacePreparation');
  expect(await inspect(page, game => game.championship.canRace)).toBe(true);
  await clickObject(page, 'rewardButton'); await waitScene(page, 'RivalReward');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => inspect(page, game => game.scale.width)).toBe(390);
  await capture(page, 'previews-ui/premio-rival-mobile.png');
  page.once('dialog', dialog => dialog.accept());
  await clickObject(page, 'creditsButton'); await ready(page, 'RacePreparation');
  expect((await state(page))).toMatchObject({ money: 19500, rivalRewardChoice: 'credits', racesRun: 5 });
  expect(await inspect(page, game => game.championship.canRace)).toBe(false);
  await page.reload();
  await page.keyboard.press('Enter'); await waitScene(page, 'MainMenu');
  await page.keyboard.press('Enter'); await ready(page, 'RacePreparation');
  expect((await state(page))).toMatchObject({ money: 19500, rivalRewardChoice: 'credits' });
  expect(await inspect(page, game => game.championship.claimRivalReward('vehicle'))).toBe(false);
});

test('rival visual: oitava corrida oferece Widowmaker e não permite farming adicional', async ({ page }) => {
  await seed(page, fixture({ wins: 8, receipt: true }));
  await openMenu(page); await page.keyboard.press('Enter'); await waitScene(page, 'RaceResults');
  expect(await inspect(page, game => game.scene.getScene('RaceResults').canFarm)).toBe(false);
  await clickObject(page, 'replayButton'); await waitScene(page, 'RivalReward');
  const before = (await state(page)).money;
  page.once('dialog', dialog => dialog.accept());
  await clickObject(page, 'vehicleButton'); await ready(page, 'RacePreparation');
  expect((await state(page))).toMatchObject({ money: before, rivalRewardChoice: 'vehicle',
    ownedVehicleIds: ['volt-vector', 'widowmaker'] });
  await clickObject(page, 'modules', 3); await ready(page);
  await clickObject(page, 'cards', 4);
  expect(await inspect(page, game => game.scene.getScene('VehicleSelection').subtitle.text)).toContain('SEM CUSTO');
  await capture(page, 'previews-ui/loja-widowmaker-adquirido.png');
});

test('modelos na corrida: jogador e rival usam GLBs oficiais sem liberar o chefão da fase 2', async ({ page }) => {
  await enterTeam(page, fixture());
  await clickObject(page, 'startButton'); await waitScene(page, 'RaceTrackSelection');
  await clickObject(page, 'startButton'); await ready(page, 'Race');
  expect(await inspect(page, game => game.scene.getScene('Race').garageView.vehicles.map(v => ({ id: v.userData.vehicleId, source: v.userData.source })))).toEqual([
    { id: 'volt-vector', source: 'vehicle-glb' }, { id: 'widowmaker', source: 'vehicle-glb' },
    { id: 'volt-vector', source: 'vehicle-glb' }, { id: 'iron-bastion', source: 'vehicle-glb' },
  ]);
  await page.screenshot({ path: 'previews-ui/corrida-modelos-rival.png' });
});

test('produção da loja: GLBs aprovados carregam e bloqueio de fase 2 aparece no build', async ({ page }) => {
  await seed(page, fixture({ money: 50000 }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const models = new Set();
  page.on('response', response => {
    if (response.ok() && response.url().includes('/models/vehicles/') && response.url().endsWith('.glb')) models.add(response.url());
  });
  await page.goto('http://127.0.0.1:4183');
  const status = page.locator('#screen-status');
  await expect(status).toContainText('Sinta a batida');
  await page.keyboard.press('Enter'); await expect(status).toContainText('Menu principal');
  await page.keyboard.press('Enter'); await expect(status).toContainText('Estação de Equipe');
  await expect.poll(() => models.size, { timeout: 45_000 }).toBe(2); // Selected Camaro + rival thumbnail.
  await page.keyboard.press('Escape');
  await expect(status).toContainText('Loja. CAMARO', { timeout: 45_000 });
  await expect.poll(() => models.size, { timeout: 45_000 }).toBe(5); // The full shop extends the cached subset.
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  await expect(status).toContainText('AINDA NÃO LIBERADO');
  await page.keyboard.press('Enter');
  await expect(status).toContainText('AINDA NÃO LIBERADO');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).money, CHAMPIONSHIP_SAVE_KEY)).toBe(50000);
  await page.screenshot({ path: 'previews-ui/loja-producao-bloqueio.png' });
});

test('economia entre abas: só a aba proprietária pode comprar, receber prêmio ou apagar progresso', async ({ page }) => {
  await enterTeam(page, fixture({ money: 50000, wins: 5 }));
  const before = await state(page);
  const other = await page.context().newPage();
  try {
    await openMenu(other);
    // The writer lease belongs to the service, not the renderer. Keep this tab
    // in the menu to avoid running two heavy SwiftShader garages unnecessarily.
    await expect(other.locator('#screen-status')).toContainText('Outra aba');
    expect(await inspect(other, game => ({ purchase: game.championship.purchaseVehicle('iron-bastion', 'inferno'),
      reward: game.championship.claimRivalReward('credits'), erase: game.championship.eraseProgress() })))
      .toEqual({ purchase: false, reward: false, erase: false });
    expect(await state(page)).toEqual(before);
    expect(await inspect(page, game => game.championship.purchaseVehicle('iron-bastion', 'inferno'))).toBe(true);
    expect((await state(page)).money).toBe(before.money - 7500);
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), CHAMPIONSHIP_SAVE_KEY);
    expect(saved).toEqual(await state(page));
  } finally { await other.close(); }
});
