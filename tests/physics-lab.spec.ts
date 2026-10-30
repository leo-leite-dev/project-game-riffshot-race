import { test, expect } from '@playwright/test';
import { CHAMPIONSHIP_SAVE_KEY } from '../src/championship/championshipStorage.ts';

test('lab Rapier 3D dirige, salta, pousa e não lê nem grava o save do jogo', async ({ page }) => {
  test.setTimeout(60_000);
  const saveSentinel = 'fixture-only-save-must-remain-identical';
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value),
    { key: CHAMPIONSHIP_SAVE_KEY, value: saveSentinel });
  const modelRequests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/assets/models/')) modelRequests.push(request.url());
  });
  await page.goto('/?physicsLab=1');
  const lab = page.locator('[data-physics-lab-root]');
  await expect(lab).toBeVisible();
  await expect(page.locator('[data-physics-lab-status]')).toContainText('0.21.0', { timeout: 15_000 });
  await expect(lab).toHaveAttribute('data-region', 'flat');
  await lab.locator('[data-pause-events-toggle]').click();
  await expect(lab.locator('[data-pause-events-toggle]')).toContainText('LIGADA');

  try {
    await page.keyboard.down('w');
    await expect.poll(async () => Number(await lab.getAttribute('data-speed-mps')),
      { timeout: 5000, message: 'W acelera o chassi Rapier' }).toBeGreaterThan(1);
    await expect.poll(async () => Number(await lab.getAttribute('data-takeoffs')),
      { timeout: 15_000, message: 'a superfície da rampa gera decolagem por perda de contato' })
      .toBeGreaterThan(0);
    await expect(lab).toHaveAttribute('data-paused', 'true');
    // Remove drive torque after the automatic takeoff; the chassis keeps its
    // horizontal momentum and can land on the isolated plateau without reaching
    // the later banked turn during this focused browser assertion.
    await page.keyboard.up('w');
    await page.screenshot({ path: 'previews-ui/physics-lab-decolagem.png' });
    await expect(lab).toHaveAttribute('data-airborne', 'true');
    await page.screenshot({ path: 'previews-ui/physics-lab-voo.png' });
    await page.screenshot({ path: 'previews-ui/physics-lab-debug-fisico.png' });
    await lab.locator('[data-pause-toggle]').click();
    await expect(lab).toHaveAttribute('data-paused', 'false');
    await expect.poll(async () => Number(await lab.getAttribute('data-landings')),
      { timeout: 10_000, message: 'as rodas retomam contato com a plataforma física' })
      .toBeGreaterThan(0);
    await expect(lab).toHaveAttribute('data-paused', 'true');
    await expect(lab).toHaveAttribute('data-airborne', 'false');
    await page.screenshot({ path: 'previews-ui/physics-lab-aterrissagem.png' });
  } finally {
    await page.keyboard.up('w');
  }

  expect(modelRequests).toEqual([]);
  expect(await page.evaluate(key => localStorage.getItem(key), CHAMPIONSHIP_SAVE_KEY)).toBe(saveSentinel);
});

test('build público não expõe nem carrega o laboratório local Rapier', async ({ page }) => {
  const experimentalRequests: string[] = [];
  page.on('request', request => {
    if (/PhysicsLab|rapier/i.test(new URL(request.url()).pathname)) experimentalRequests.push(request.url());
  });
  await page.goto('http://127.0.0.1:4183/?physicsLab=1');
  await expect(page.locator('#game canvas')).toHaveAttribute('aria-label', /RIFFSHOT RACING/, { timeout: 15_000 });
  await expect(page.locator('[data-physics-lab-root]')).toHaveCount(0);
  expect(experimentalRequests).toEqual([]);
});
