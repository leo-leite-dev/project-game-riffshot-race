import { test, expect, state, waitScene, openMenu } from './helpers.ts';
import type { Page } from '@playwright/test';

test('trilha espera interação, produz sinal e o mute fica somente nas configurações', async ({ page }) => {
  await page.goto('/');
  await expect.poll(async () => (await state(page)).key).toBe('Splash');
  expect((await state(page)).musicStarted).toBe(false);
  await page.keyboard.press('Enter');
  await waitScene(page, 'MainMenu');
  await expect.poll(async () => (await state(page)).musicStarted).toBe(true);
  const signal = await page.evaluate(async () => {
    const script = document.querySelector('script[src*="/src/main.ts"]'); if (!(script instanceof HTMLScriptElement)) throw new Error('Entrada ausente'); const { game } = await import(script.src);
    const music = game.menuMusic;
    const samples = music.buffer.getChannelData(0);
    let sum = 0; let peak = 0;
    for (const sample of samples) { sum += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
    return { rms: Math.sqrt(sum / samples.length), peak, loop: music.source.loop,
      context: music.context.state, volume: music.volume, duration: music.buffer.duration };
  });
  expect(signal.context).toBe('running');
  expect(signal.loop).toBe(true);
  expect(signal.rms).toBeGreaterThan(0.02);
  expect(signal.peak).toBeLessThanOrEqual(0.901);
  expect(signal.volume).toBeLessThanOrEqual(0.2);
  expect(signal.duration).toBeGreaterThan(14);
  await expect(page.locator('#music-toggle')).toHaveCount(0);
  await page.keyboard.press('m');
  expect((await state(page)).musicMuted).toBe(false);
  expect((await state(page)).key).toBe('MainMenu');
  const source = await page.evaluateHandle(async () => { const script = document.querySelector('script[src*="/src/main.ts"]'); if (!(script instanceof HTMLScriptElement)) throw new Error('Entrada ausente'); return (await import(script.src)).game.menuMusic.source; });
  await page.locator('canvas').focus();
  await page.keyboard.press('Enter');
  await waitScene(page, 'DifficultySelection');
  await page.keyboard.press('Enter');
  await waitScene(page, 'CharacterSelection');
  await page.keyboard.press('Enter');
  await waitScene(page, 'VehicleSelection');
  expect(await page.evaluate(async source => { const script = document.querySelector('script[src*="/src/main.ts"]'); if (!(script instanceof HTMLScriptElement)) throw new Error('Entrada ausente'); return (await import(script.src)).game.menuMusic.source === source; }, source)).toBe(true);
  await source.dispose();
});

test('indisponibilidade de síntese offline mantém controle global e não bloqueia o fluxo', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext = undefined;
    window.webkitOfflineAudioContext = undefined;
  });
  await openMenu(page);
  await expect(page.locator('#music-toggle')).toHaveCount(0);
  await page.keyboard.press('m');
  expect((await state(page)).musicMuted).toBe(false);
  await page.keyboard.press('Enter');
  await waitScene(page, 'DifficultySelection');
  await page.keyboard.press('Enter');
  await waitScene(page, 'CharacterSelection');
  await page.keyboard.press('Enter');
  await waitScene(page, 'VehicleSelection');
  expect((await state(page)).musicStarted).toBe(false);
});

test('falha ao gerar a trilha mantém navegação e controle global de som', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.OfflineAudioContext;
    window.OfflineAudioContext = class extends Original {
      startRendering() { return Promise.reject(new Error('Falha de áudio simulada pelo teste')); }
    };
  });
  await openMenu(page);
  await expect(page.locator('#music-toggle')).toHaveCount(0);
  expect((await state(page)).musicStarted).toBe(true);
  await page.keyboard.press('Enter');
  await waitScene(page, 'DifficultySelection');
  await page.keyboard.press('Enter');
  await waitScene(page, 'CharacterSelection');
  expect((await state(page)).musicStarted).toBe(false);
});
