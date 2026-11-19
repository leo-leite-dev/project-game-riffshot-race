import { test, expect } from '@playwright/test';
import { CHAMPIONSHIP_SAVE_KEY } from '../src/championship/championshipStorage.ts';

test('laboratório arcade usa corrida real, alterna câmera e completa salto sem tocar o save', async ({ page }) => {
  test.setTimeout(45_000);
  const saveSentinel = 'fixture-local-arcade-lab-save';
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value),
    { key: CHAMPIONSHIP_SAVE_KEY, value: saveSentinel });
  const physicsRequests: string[] = [];
  const browserErrors: string[] = [];
  page.on('request', request => {
    if (/rapier|\/PhysicsLabScene\.ts|RapierVehicleLab/i.test(new URL(request.url()).pathname)) physicsRequests.push(request.url());
  });
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  await page.goto('/?physicsLab=1');
  const lab = page.locator('[data-physics-lab-root]');
  await expect(lab).toBeVisible();
  await expect(lab).toHaveAttribute('data-lab-engine', 'arcade-race-simulation');
  await expect(lab).toHaveAttribute('data-lab-scene', 'ArcadePhysicsLab');
  await expect(page.locator('[data-physics-lab-status]')).toContainText('RaceSimulation ativa');
  await expect(lab).toHaveAttribute('data-region', 'track');
  await expect.poll(async () => Number(await lab.getAttribute('data-simulation-time-seconds')))
    .toBeGreaterThan(0.5);
  await page.screenshot({ path: 'previews-ui/arcade-lab-direcao-real.png' });

  await page.keyboard.press('c');
  await expect(lab.locator('[data-camera-toggle]')).toContainText('ISOMÉTRICA');
  await page.keyboard.press('c');
  await expect(lab.locator('[data-camera-toggle]')).toContainText('TERCEIRA PESSOA');

  await page.keyboard.down('w');
  await expect.poll(async () => Number(await lab.getAttribute('data-speed-mps')),
    { timeout: 5000, message: 'W acelera pela RaceSimulation existente' }).toBeGreaterThan(5);
  await page.waitForFunction(() => {
    const root = document.querySelector<HTMLElement>('[data-physics-lab-root]');
    return root?.dataset.airborne === 'true' && Number(root.dataset.takeoffs) > 0;
  }, null, { timeout: 12_000, polling: 'raf' });
  const takeoffPitch = Number(await lab.getAttribute('data-takeoff-pitch'));
  expect(takeoffPitch).toBeLessThan(-0.03);
  expect(takeoffPitch).toBeGreaterThan(-0.24);
  await page.screenshot({ path: 'previews-ui/arcade-lab-salto-no-ar.png' });
  const takeoffHeading = Number(await lab.getAttribute('data-heading'));
  await page.keyboard.down('a');
  await expect(lab).toHaveAttribute('data-steering', '1');
  await expect.poll(async () => Math.abs(Number(await lab.getAttribute('data-heading')) - takeoffHeading),
    { timeout: 1500, message: 'a direção responde durante o salto' }).toBeGreaterThan(0.01);
  await page.keyboard.up('a');
  await expect(lab).toHaveAttribute('data-steering', '0');
  const releasedHeading = Number(await lab.getAttribute('data-heading'));
  const releaseTime = Number(await lab.getAttribute('data-simulation-time-seconds'));
  await expect.poll(async () => Number(await lab.getAttribute('data-simulation-time-seconds')),
    { timeout: 1500, message: 'a simulação observa a direção solta durante o voo' })
    .toBeGreaterThan(releaseTime + 0.25);
  expect(Math.abs(Number(await lab.getAttribute('data-heading')) - releasedHeading)).toBeLessThan(0.02);
  expect(Math.abs(Number(await lab.getAttribute('data-pitch')))).toBeLessThan(0.24);
  await page.keyboard.up('w');
  await expect.poll(async () => Number(await lab.getAttribute('data-landings')),
    { timeout: 10_000, message: 'o carro aterrissa na zona experimental' }).toBeGreaterThan(0);
  await expect(lab).toHaveAttribute('data-airborne', 'false');
  expect(Number(await lab.getAttribute('data-maximum-descent-pitch'))).toBeGreaterThan(0.02);
  expect(Number(await lab.getAttribute('data-maximum-suspension-compression'))).toBeLessThan(-0.02);
  expect(Number(await lab.getAttribute('data-maximum-suspension-recovery'))).toBeGreaterThan(0.005);
  await page.screenshot({ path: 'previews-ui/arcade-lab-salto-e-aterrissagem.png' });
  const landingHeading = Number(await lab.getAttribute('data-heading'));
  const landingTime = Number(await lab.getAttribute('data-simulation-time-seconds'));
  await expect.poll(async () => Number(await lab.getAttribute('data-simulation-time-seconds')),
    { timeout: 1500, message: 'a simulação continua após o pouso sem entrada de direção' })
    .toBeGreaterThan(landingTime + 0.25);
  expect(Math.abs(Number(await lab.getAttribute('data-heading')) - landingHeading)).toBeLessThan(0.02);
  expect(await page.evaluate(key => localStorage.getItem(key), CHAMPIONSHIP_SAVE_KEY)).toBe(saveSentinel);
  expect(physicsRequests).toEqual([]);
  expect(browserErrors).toEqual([]);
});
