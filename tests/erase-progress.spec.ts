import { test, expect } from '@playwright/test';
import { createChampionshipState, setSelections, ensureAssignedTrack, beginChampionshipRace } from '../src/championship/championshipState.ts';
import { CHAMPIONSHIP_SAVE_KEY, CHAMPIONSHIP_BACKUP_KEY } from '../src/championship/championshipStorage.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { waitScene } from './helpers.ts';
import type { Page } from '@playwright/test';

const preservedStorage = {
  'outro-projeto:save': 'preservar',
  'riffshot-racing:championship:v1:export': 'não é um save gerenciado',
  'riffshot-racing:championship:v2:backup:export': 'fora do namespace de exclusão',
};

const current = (page: Page) => page.evaluate(async ({ key, backup, preservedKeys }: { key: string; backup: string; preservedKeys: string[] }) => {
  const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]'); if (!script) throw new Error('Entrada ausente'); const { game } = await import(script.src);
  return { state: game.championship.state, raw: localStorage.getItem(key),
    backup: localStorage.getItem(backup),
    preserved: Object.fromEntries(preservedKeys.map(name => [name, localStorage.getItem(name)])) };
}, { key: CHAMPIONSHIP_SAVE_KEY, backup: CHAMPIONSHIP_BACKUP_KEY, preservedKeys: Object.keys(preservedStorage) });

async function openSettings(page: Page) {
  const gear = page.getByRole('button', { name: 'Configurações', exact: true });
  await gear.click();
  const settings = page.getByRole('dialog', { name: 'CONFIGURAÇÕES', exact: true });
  await expect(settings).toBeVisible();
  await expect(settings).toHaveJSProperty('open', true);
  await expect(gear).toHaveAttribute('aria-expanded', 'true');
  await expect(settings.getByRole('button', { name: /^SOM/ })).toBeVisible();
  await expect(settings.getByRole('button', { name: 'APAGAR PROGRESSO', exact: true })).toBeEnabled();
  await expect(settings.getByRole('button', { name: 'FECHAR', exact: true })).toBeFocused();
  return settings;
}

async function openTeam(page: Page) {
  const selected = setSelections({ ...createChampionshipState({ id: 'erase-career', attemptId: 'erase-attempt' }),
    ownedVehicleIds: ['rift-blaze'] }, {
    pilotId: CHARACTERS[0].id, vehicleId: 'rift-blaze', paintId: 'inferno', difficultyId: 'normal',
  });
  const seed = beginChampionshipRace(ensureAssignedTrack({ ...selected, money: 8200, score: 510,
    upgrades: { engine: 2 } }, () => 0), 'unfinished-race');
  await page.addInitScript(({ seed, key, backup, preserved }) => {
    if (sessionStorage.getItem('erase-test-seeded')) return;
    sessionStorage.setItem('erase-test-seeded', '1');
    localStorage.setItem(key, JSON.stringify(seed));
    localStorage.setItem(backup, 'backup anterior');
    for (const [name, value] of Object.entries(preserved)) localStorage.setItem(name, value);
  }, { seed, key: CHAMPIONSHIP_SAVE_KEY, backup: CHAMPIONSHIP_BACKUP_KEY, preserved: preservedStorage });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.keyboard.press('Enter'); await waitScene(page, 'MainMenu');
  await page.keyboard.press('Enter'); await waitScene(page, 'RacePreparation');
}

test('Equipe: cancelar preserva; confirmar apaga save/backups e volta à abertura, inclusive após reload', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await openTeam(page);
  const before = await current(page);
  expect(before.state).toMatchObject({ money: 8200, score: 510, ownedVehicleIds: ['rift-blaze'], upgrades: { engine: 2 } });
  expect(before.raw).not.toBeNull(); expect(before.backup).not.toBeNull();
  expect(before.preserved).toEqual(preservedStorage);
  const gear = page.getByRole('button', { name: 'Configurações', exact: true });
  await expect(gear).toHaveAttribute('id', 'station-settings-button');
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect(gear).toBeVisible();
    await expect.poll(() => gear.evaluate(button => {
      const bounds = button.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
        inside: bounds.left >= 0 && bounds.right <= window.innerWidth
          && bounds.top >= 0 && bounds.bottom <= window.innerHeight,
        text: button instanceof HTMLButtonElement ? button.innerText.trim() : '' };
    })).toEqual({ x: viewport.width - 64, y: 12, width: 48, height: 48, inside: true, text: '' });
    await expect(gear.locator('svg[aria-hidden="true"]')).toBeVisible();
    await expect(gear).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('dialog', { name: 'CONFIGURAÇÕES', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'APAGAR PROGRESSO', exact: true })).toHaveCount(0);
  }

  const settings = await openSettings(page);
  const eraseButton = settings.getByRole('button', { name: 'APAGAR PROGRESSO', exact: true });
  const closeButton = settings.getByRole('button', { name: 'FECHAR', exact: true });
  const feedback = settings.getByRole('status').filter({ hasText: 'Exclusão cancelada' });
  const mouseConfirmation = page.waitForEvent('dialog');
  page.once('dialog', dialog => dialog.dismiss());
  await eraseButton.click();
  expect((await mouseConfirmation).type()).toBe('confirm');
  await expect(settings).toBeVisible();
  await expect(feedback).toContainText('Seu progresso foi preservado');
  await expect(page.locator('#screen-status')).toContainText('Exclusão cancelada');
  await expect(closeButton).toBeFocused();
  await expect(eraseButton).toBeEnabled();
  expect(await current(page)).toEqual(before);

  // The modal owns Tab/Enter; background Phaser actions must not receive them.
  const soundButton = settings.getByRole('button', { name: /^SOM/ });
  await page.keyboard.press('Tab');
  await expect(await soundButton.isEnabled() ? soundButton : eraseButton).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(closeButton).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(eraseButton).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(closeButton).toBeFocused();
  await eraseButton.focus();
  const keyboardConfirmation = page.waitForEvent('dialog');
  page.once('dialog', dialog => dialog.dismiss());
  await page.keyboard.press('Enter');
  expect((await keyboardConfirmation).type()).toBe('confirm');
  await expect(settings).toBeVisible();
  await expect(feedback).toContainText('Seu progresso foi preservado');
  await expect(page.locator('#screen-status')).toContainText('Exclusão cancelada');
  await expect(closeButton).toBeFocused();
  await expect(eraseButton).toBeEnabled();
  await waitScene(page, 'RacePreparation');
  expect(await current(page)).toEqual(before);

  // Add old-version and corrupt payloads after loading the valid career fixture.
  await page.evaluate(() => {
    localStorage.setItem('riffshot-racing:championship:v2', 'save antigo');
    localStorage.setItem('riffshot-racing:championship:v2:backup', 'backup antigo');
    localStorage.setItem('riffshot-racing:championship:v99', '{save corrompido');
    localStorage.setItem('riffshot-racing:championship:v99:backup', '{backup corrompido');
  });
  const confirmation = page.waitForEvent('dialog');
  page.once('dialog', dialog => dialog.accept());
  await eraseButton.click();
  const confirmed = await confirmation;
  expect(confirmed.type()).toBe('confirm');
  expect(confirmed.message()).toContain('não pode ser desfeita');
  await waitScene(page, 'Splash');
  await expect(page.locator('#station-settings-button')).toHaveCount(0);
  await expect(page.locator('#station-settings-dialog')).toHaveCount(0);
  const after = await current(page);
  expect(after.raw).toBeNull(); expect(after.backup).toBeNull();
  expect(after.state).toMatchObject({ money: 2000, score: 0, racesRun: 0, upgrades: {}, activeRace: null,
    pendingResult: null, awardedRaceIds: [], selections: { pilotId: null, vehicleId: null, paintId: null, difficultyId: null } });
  expect(after.state.id).not.toBe(before.state.id);
  expect(after.preserved).toEqual(preservedStorage);
  expect(await page.evaluate(() => [
    'riffshot-racing:championship:v2', 'riffshot-racing:championship:v2:backup',
    'riffshot-racing:championship:v99', 'riffshot-racing:championship:v99:backup',
  ].map(key => localStorage.getItem(key)))).toEqual([null, null, null, null]);
  await page.reload(); await waitScene(page, 'Splash');
  const reloaded = await current(page);
  expect(reloaded.state.selections.pilotId).toBeNull();
  expect(reloaded.raw).toBeNull(); expect(reloaded.backup).toBeNull();
  expect(reloaded.preserved).toEqual(preservedStorage);
  await page.keyboard.press('Enter'); await waitScene(page, 'MainMenu');
  await page.keyboard.press('Enter'); await waitScene(page, 'DifficultySelection');
  expect(errors).toEqual([]);
});

test('Equipe: falha de armazenamento avisa e não sai da equipe nem zera memória', async ({ page }) => {
  test.setTimeout(40_000);
  await openTeam(page);
  const before = await current(page);
  const settings = await openSettings(page);
  await page.evaluate(() => { Storage.prototype.removeItem = () => { throw new DOMException('Blocked', 'SecurityError'); }; });
  const confirmation = page.waitForEvent('dialog');
  page.once('dialog', dialog => dialog.accept());
  await settings.getByRole('button', { name: 'APAGAR PROGRESSO', exact: true }).click();
  expect((await confirmation).type()).toBe('confirm');
  await expect(settings).toBeVisible();
  await expect(settings).toHaveJSProperty('open', true);
  const feedback = settings.getByRole('status').filter({ hasText: 'Não foi possível concluir a exclusão' });
  await expect(feedback).toBeVisible();
  await expect(feedback).toContainText('Progresso em memória mantido');
  await expect(settings.getByRole('button', { name: 'FECHAR', exact: true })).toBeFocused();
  await expect(settings.getByRole('button', { name: 'APAGAR PROGRESSO', exact: true })).toBeEnabled();
  await expect(page.locator('#screen-status')).toContainText('Não foi possível concluir a exclusão');
  const warning = await page.evaluate(async () => {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]'); if (!script) throw new Error('Entrada ausente'); const { game } = await import(script.src);
    return game.championship.warning;
  });
  expect(warning).toContain('Não foi possível concluir a exclusão');
  await expect(feedback).toContainText(warning);
  const after = await current(page);
  expect(after).toEqual(before);
  await waitScene(page, 'RacePreparation');
});
