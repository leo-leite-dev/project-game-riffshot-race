import { test, expect } from '@playwright/test';
import { createChampionshipState, setSelections, ensureAssignedTrack, beginChampionshipRace } from '../src/championship/championshipState.js';
import { CHAMPIONSHIP_SAVE_KEY, CHAMPIONSHIP_BACKUP_KEY } from '../src/championship/championshipStorage.js';
import { CHARACTERS } from '../src/data/characters.js';
import { clickObject, waitScene } from './helpers.js';

const current = page => page.evaluate(async () => {
  const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
  return { state: game.championship.state, raw: localStorage.getItem('riffshot-racing:championship:v1'),
    backup: localStorage.getItem('riffshot-racing:championship:v1:backup') };
});

async function openTeam(page) {
  const selected = setSelections({ ...createChampionshipState({ id: 'erase-career', attemptId: 'erase-attempt' }),
    ownedVehicleIds: ['rift-blaze'] }, {
    pilotId: CHARACTERS[0].id, vehicleId: 'rift-blaze', paintId: 'inferno', difficultyId: 'normal',
  });
  const seed = beginChampionshipRace(ensureAssignedTrack({ ...selected, money: 8200, score: 510,
    upgrades: { engine: 2 } }, () => 0), 'unfinished-race');
  await page.addInitScript(({ seed, key, backup }) => {
    if (sessionStorage.getItem('erase-test-seeded')) return;
    sessionStorage.setItem('erase-test-seeded', '1');
    localStorage.setItem(key, JSON.stringify(seed));
    localStorage.setItem(backup, 'backup anterior');
    localStorage.setItem('outro-projeto:save', 'preservar');
  }, { seed, key: CHAMPIONSHIP_SAVE_KEY, backup: CHAMPIONSHIP_BACKUP_KEY });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.keyboard.press('Enter'); await waitScene(page, 'MainMenu');
  await page.keyboard.press('Enter'); await waitScene(page, 'RacePreparation');
}

test('Equipe: cancelar preserva; confirmar apaga save/backups e volta à abertura, inclusive após reload', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await openTeam(page);
  const before = await current(page);
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(async () => {
      const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
      const scene = game.scene.getScene('RacePreparation');
      const button = scene.eraseButton;
      const bounds = button.getBounds(), label = button.label.getBounds();
      const start = scene.startButton.getBounds();
      return bounds.left >= 0 && bounds.right <= game.scale.width && bounds.top >= 53
        && bounds.bottom <= game.scale.height - 48 && label.left >= bounds.left && label.right <= bounds.right
        && (bounds.right <= start.left || bounds.left >= start.right);
    })).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('team-erase-button.png') });
  page.once('dialog', dialog => dialog.dismiss());
  await clickObject(page, 'eraseButton');
  await expect(page.locator('#screen-status')).toContainText('Exclusão cancelada');
  expect(await current(page)).toEqual(before);
  // Erase is the seventh action; keyboard navigation reaches it without erasing.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const keyboardConfirmation = page.waitForEvent('dialog');
  page.once('dialog', dialog => dialog.dismiss());
  await page.keyboard.press('Enter');
  expect((await keyboardConfirmation).type()).toBe('confirm');
  await expect(page.locator('#screen-status')).toContainText('Exclusão cancelada');
  expect(await current(page)).toEqual(before);
  await page.evaluate(() => {
    localStorage.setItem('riffshot-racing:championship:v2', 'save antigo');
    localStorage.setItem('riffshot-racing:championship:v2:backup', 'backup antigo');
  });
  page.once('dialog', async dialog => {
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toContain('não pode ser desfeita');
    await dialog.accept();
  });
  await clickObject(page, 'eraseButton');
  await waitScene(page, 'Splash');
  const after = await current(page);
  expect(after.raw).toBeNull(); expect(after.backup).toBeNull();
  expect(after.state).toMatchObject({ money: 2000, score: 0, racesRun: 0, upgrades: {}, activeRace: null,
    pendingResult: null, awardedRaceIds: [], selections: { pilotId: null, vehicleId: null, paintId: null, difficultyId: null } });
  expect(after.state.id).not.toBe(before.state.id);
  expect(await page.evaluate(() => localStorage.getItem('outro-projeto:save'))).toBe('preservar');
  expect(await page.evaluate(() => localStorage.getItem('riffshot-racing:championship:v2'))).toBeNull();
  await page.reload(); await waitScene(page, 'Splash');
  expect((await current(page)).state.selections.pilotId).toBeNull();
  await page.keyboard.press('Enter'); await waitScene(page, 'MainMenu');
  await page.keyboard.press('Enter'); await waitScene(page, 'DifficultySelection');
  expect(errors).toEqual([]);
});

test('Equipe: falha de armazenamento avisa e não sai da equipe nem zera memória', async ({ page }) => {
  test.setTimeout(40_000);
  await openTeam(page);
  const before = await current(page);
  await page.evaluate(() => { Storage.prototype.removeItem = () => { throw new DOMException('Blocked', 'SecurityError'); }; });
  page.once('dialog', dialog => dialog.accept());
  await clickObject(page, 'eraseButton');
  await expect(page.locator('#screen-status')).toContainText('Não foi possível concluir a exclusão');
  const after = await current(page);
  expect(after).toEqual(before);
  await waitScene(page, 'RacePreparation');
});
