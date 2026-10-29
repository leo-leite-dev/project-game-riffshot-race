import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';

const PRODUCTION_URL = 'http://127.0.0.1:4183';
const CREDIT_NAME = 'Créditos e licenças (abre em nova aba)';

async function openProduction(page) {
  await page.goto(PRODUCTION_URL);
  await expect(page.locator('#screen-status')).toContainText('Sinta a batida');
}

async function expectPublicNotice(popup) {
  await popup.waitForLoadState('domcontentloaded');
  await expect(popup).toHaveURL(`${PRODUCTION_URL}/credits.html`);
  await expect(popup.getByRole('heading', { name: 'Modelos de veículos GLB atuais', exact: true })).toBeVisible();
  await expect(popup.locator('main')).toContainText('Chenchanchong');
  await expect(popup.locator('main')).toContainText('Brian Trepanier');
}

test('produção entrega a atribuição completa e preserva os avisos MIT', async ({ request }) => {
  const response = await request.get(`${PRODUCTION_URL}/THIRD_PARTY_NOTICES.txt`);
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('text/plain');
  const notice = await response.text();
  expect(notice).toBe(await readFile(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8'));
  for (const credit of [
    'THUNDER BUG', 'Chenchanchong', '97768c0e69744cd5922ddc5a9fd59266',
    'RACE CAR 2', 'Tasneem', '517dfa8823394b178c9c313d7e68fb7f',
    'CAMARO', 'Primus03', '1eee5b31a3dd46ef9b91a95b9261e7f8',
    'ARMORED CAR', 'jaack', 'ea76bac506f04676b8514951b67994f8',
    'WIDOWMAKER', 'Brian Trepanier', '15b6eb31787446879f063bb9b25cbc5c',
    'CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/',
    'sem perdas', 'PNG', 'índices', 'UV', 'pivôs', 'escala', 'animação própria',
    'não implica endosso', 'não assegura direitos de terceiros',
    'não é dono do modelo', 'Jagex', 'Neon Ignition', 'RaceEngineAudio.js',
    'Richard Davey, Phaser Studio Inc.', '2010-2026 three.js authors', '2014 Arnout Kazemier',
  ]) expect(notice).toContain(credit);
  expect(notice.match(/Permission is hereby granted/g)).toHaveLength(3);
  expect(notice.match(/THE SOFTWARE IS PROVIDED "AS IS"/g)).toHaveLength(3);
  const html = await request.get(`${PRODUCTION_URL}/credits.html`);
  expect(html.headers()['content-type']).toContain('text/html');
  expect(await html.text()).toContain('Avisos completos em texto');
  // The same source is available in dev, without a fake SPA fallback page.
  const dev = await request.get('http://127.0.0.1:5183/THIRD_PARTY_NOTICES.txt');
  expect(await dev.text()).toBe(notice);
});

test('link público pode ser clicado ou tocado sem cobrir o som ou bloquear o canvas', async ({ page, isMobile }) => {
  await openProduction(page);
  const credits = page.getByRole('link', { name: CREDIT_NAME, exact: true });
  await expect(credits).toBeVisible();
  await expect(credits).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(credits).toHaveAttribute('href', './credits.html');
  // Include the minimum width supported by the existing page shell.
  for (const viewport of [page.viewportSize(), { width: 280, height: 568 }]) {
    await page.setViewportSize(viewport);
    const link = await credits.boundingBox();
    const sound = await page.locator('#music-toggle').boundingBox();
    expect(link.width).toBeGreaterThanOrEqual(44);
    expect(link.height).toBeGreaterThanOrEqual(44);
    expect(link.x).toBeGreaterThanOrEqual(0);
    expect(link.y).toBeGreaterThanOrEqual(0);
    expect(link.x + link.width).toBeLessThanOrEqual(viewport.width);
    expect(link.y + link.height).toBeLessThanOrEqual(viewport.height);
    expect(link.x).toBeGreaterThanOrEqual(sound.x + sound.width + 4);
    expect(await page.locator('#game').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return document.elementFromPoint(rect.width / 2, rect.height / 2)?.tagName;
    })).toBe('CANVAS');
  }
  const status = await page.locator('#screen-status').textContent();
  const popup = page.waitForEvent('popup');
  if (isMobile) await credits.tap();
  else await credits.click();
  const opened = await popup;
  await expectPublicNotice(opened);
  await opened.setViewportSize({ width: 1280, height: 800 });
  await opened.screenshot({ path: 'previews-ui/creditos-desktop.png' });
  await opened.setViewportSize({ width: 390, height: 844 });
  await expect(opened.getByRole('link', { name: 'Avisos completos em texto' })).toBeVisible();
  expect(await opened.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await opened.screenshot({ path: 'previews-ui/creditos-mobile.png' });
  await page.screenshot({ path: 'previews-ui/creditos-botao-jogo.png' });
  await opened.close();
  await expect(page.locator('#screen-status')).toHaveText(status);
});

test('teclado alcança o link por Tab e Alt+L mesmo com o menu capturando Tab', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Navegação por teclado físico verificada no projeto desktop.');
  await openProduction(page);
  const credits = page.getByRole('link', { name: CREDIT_NAME, exact: true });
  await expect(page.locator('#game canvas')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#music-toggle')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(credits).toBeFocused();
  expect(await credits.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
  const intro = await page.locator('#screen-status').textContent();
  const popup = page.waitForEvent('popup');
  await page.keyboard.press('Enter');
  const firstPopup = await popup;
  await expectPublicNotice(firstPopup);
  await firstPopup.close();
  await expect(page.locator('#screen-status')).toHaveText(intro);
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#music-toggle')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#game canvas')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-status')).toContainText('Menu principal');
  const menu = await page.locator('#screen-status').textContent();
  await expect(credits).toHaveAttribute('aria-keyshortcuts', 'Alt+L');
  await page.keyboard.press('Alt+l');
  await expect(credits).toBeFocused();
  const shortcutPopup = page.waitForEvent('popup');
  await page.keyboard.press('Enter');
  const secondPopup = await shortcutPopup;
  await expectPublicNotice(secondPopup);
  await secondPopup.close();
  await expect(page.locator('#screen-status')).toHaveText(menu);
});

test('distribuição pública entrega só os cinco payloads do manifesto com integridade e limite Pages', async ({ request }) => {
  const manifest = JSON.parse(await readFile(new URL('../assets/vehicles/manifest.json', import.meta.url), 'utf8'));
  expect(manifest.assets).toHaveLength(5);
  for (const asset of manifest.assets) {
    const response = await request.get(`${PRODUCTION_URL}${asset.url}`);
    expect(response.ok(), asset.fileName).toBe(true);
    const data = await response.body();
    expect(data.length).toBe(asset.bytes);
    expect(data.length).toBeLessThan(25 * 1024 * 1024);
    expect(createHash('sha256').update(data).digest('hex')).toBe(asset.sha256);
  }
  for (const path of ['/models/vehicles/race_car2.glb', '/models/vehicles/sci_-_fi_buggy.glb', '/models/vehicles/../secret.glb']) {
    const response = await request.get(`${PRODUCTION_URL}${path}`);
    const data = await response.body();
    expect(data.subarray(0, 4).toString()).not.toBe('glTF');
  }
});
