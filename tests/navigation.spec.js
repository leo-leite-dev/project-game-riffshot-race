import { test, expect, state, waitScene, openMenu, buttonPosition } from './helpers.js';

test('abertura automática dura aproximadamente 2 a 3 segundos', async ({ page }) => {
  await page.goto('/');
  await expect.poll(async () => (await state(page)).key).toBe('Splash');
  await page.waitForTimeout(1700);
  expect((await state(page)).key).toBe('Splash');
  await waitScene(page, 'MainMenu');
  expect((await state(page)).selected).toBe(0);
});

test('Enter e cliques simultâneos pulam a abertura uma única vez', async ({ page }) => {
  await page.goto('/');
  await expect.poll(async () => (await state(page)).key).toBe('Splash');
  await page.keyboard.press('Enter');
  await page.mouse.click(30, 100, { clickCount: 3, delay: 10 });
  await waitScene(page, 'MainMenu');
  await page.waitForTimeout(2800);
  expect((await state(page)).key).toBe('MainMenu');
  expect((await state(page)).transitioning).toBe(false);
});

test('um clique também pula a abertura', async ({ page }) => {
  await page.goto('/');
  await expect.poll(async () => (await state(page)).key).toBe('Splash');
  await page.mouse.click(80, 110);
  await waitScene(page, 'MainMenu');
});

test('teclado navega, dá a volta na lista e mantém os dois modos bloqueados', async ({ page }) => {
  await openMenu(page);
  await page.keyboard.press('ArrowUp');
  expect((await state(page)).selected).toBe(2);
  await page.keyboard.press('Enter');
  expect((await state(page)).toast).toContain('Em breve');
  expect((await state(page)).key).toBe('MainMenu');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  expect((await state(page)).selected).toBe(1);
  expect((await state(page)).key).toBe('MainMenu');
  expect((await state(page)).toastAlpha).toBe(1);
  await page.keyboard.press('Tab');
  expect((await state(page)).selected).toBe(2);
  await page.keyboard.press('Shift+Tab');
  expect((await state(page)).selected).toBe(1);
  await expect.poll(async () => (await state(page)).toastAlpha).toBe(0);
});

test('mouse destaca opções e bloqueia CO-OP e ONLINE; 1 JOGADOR abre os personagens', async ({ page }) => {
  await openMenu(page);
  for (const index of [1, 2]) {
    const point = await buttonPosition(page, index);
    await page.mouse.move(point.x, point.y);
    await expect.poll(async () => (await state(page)).selected).toBe(index);
    await page.mouse.click(point.x, point.y);
    expect((await state(page)).key).toBe('MainMenu');
    expect((await state(page)).toast).toContain('Em breve');
  }
  const start = await buttonPosition(page);
  await page.mouse.click(start.x, start.y);
  await waitScene(page, 'DifficultySelection');
  await page.keyboard.press('Enter');
  await waitScene(page, 'CharacterSelection');
  await expect(page.locator('#screen-status')).toContainText('Seleção de Personagem');
  const back = await buttonPosition(page, 0, true);
  await page.mouse.click(back.x, back.y);
  await waitScene(page, 'MainMenu');
});

test('ida e volta repetidas não duplicam eventos nem acumulam texturas', async ({ page }) => {
  test.setTimeout(45_000);
  await openMenu(page);
  // Portraits are intentionally cached once for reuse in later scenes.
  await page.keyboard.press('Enter');
  await waitScene(page, 'DifficultySelection');
  await page.keyboard.press('Enter');
  await waitScene(page, 'CharacterSelection');
  await page.keyboard.press('Escape');
  await waitScene(page, 'MainMenu');
  const initialTextures = (await state(page)).textures;
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press('Enter');
    await waitScene(page, 'DifficultySelection');
    await page.keyboard.press('Enter');
    await waitScene(page, 'CharacterSelection');
    await page.keyboard.press('Enter');
    await waitScene(page, 'VehicleSelection');
    await page.keyboard.press('Escape');
    await waitScene(page, 'CharacterSelection');
    await page.keyboard.press('Escape');
    await waitScene(page, 'MainMenu');
    expect((await state(page)).keyboardListeners).toBe(1);
    expect((await state(page)).textures).toBe(initialTextures);
    await page.keyboard.press('ArrowDown');
    expect((await state(page)).selected).toBe(1);
    await page.keyboard.press('ArrowUp');
  }
});

test('botões ficam dentro da tela após redimensionamento e toque funciona', async ({ page }) => {
  await openMenu(page);
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => page.evaluate(async () => {
      const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
      const scene = game.scene.getScene('MainMenu');
      return scene.buttons.every(button => {
        const b = button.getBounds();
        return b.left >= 0 && b.right <= game.scale.width && b.top >= 54 && b.bottom <= game.scale.height - 48;
      });
    })).toBe(true);
  }
  const start = await buttonPosition(page);
  await page.mouse.click(start.x, start.y);
  await waitScene(page, 'DifficultySelection');
  await page.keyboard.press('Enter');
  await waitScene(page, 'CharacterSelection');
});

test('movimento reduzido mantém a navegação e gera registros visuais', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect.poll(async () => (await state(page)).key).toBe('Splash');
  await page.waitForTimeout(100);
  await page.screenshot({ path: testInfo.outputPath('splash.png') });
  await waitScene(page, 'MainMenu');
  await page.screenshot({ path: testInfo.outputPath('menu.png') });
  const start = await buttonPosition(page);
  if (testInfo.project.use.hasTouch) await page.touchscreen.tap(start.x, start.y);
  else await page.mouse.click(start.x, start.y);
  await waitScene(page, 'DifficultySelection');
  await page.keyboard.press('Enter');
  await waitScene(page, 'CharacterSelection');
  await page.screenshot({ path: testInfo.outputPath('characters.png') });
  await page.keyboard.press('Enter');
  await waitScene(page, 'VehicleSelection');
  await page.screenshot({ path: testInfo.outputPath('vehicle-selection.png') });
});

test('build de produção abre e permite ida e volta sem erros', async ({ page }) => {
  await page.goto('http://127.0.0.1:4183');
  const status = page.locator('#screen-status');
  await expect(status).toContainText('Sinta a batida');
  await page.keyboard.press('Enter');
  await expect(status).toContainText('Menu principal');
  // Wait for the entrance fade, as a player would before confirming.
  await page.waitForTimeout(350);
  await page.keyboard.press('Enter');
  await expect(status).toContainText('Dificuldade');
  await page.waitForTimeout(350);
  await page.keyboard.press('Enter');
  await expect(status).toContainText('Seleção de Personagem');
  await page.waitForTimeout(350);
  await page.keyboard.press('ArrowRight');
  await expect(status).toContainText('KIRA COMET');
  await page.keyboard.press('Enter');
  await expect(status).toContainText('Seleção de Veículo');
  await expect(status).toContainText('KIRA COMET');
  await page.waitForTimeout(350);
  await page.keyboard.press('Escape');
  await expect(status).toContainText('Seleção de Personagem');
  await page.waitForTimeout(350);
  await page.keyboard.press('Escape');
  await expect(status).toContainText('Menu principal');
  await page.waitForTimeout(350);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(status).toHaveText('Em breve');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(status).toHaveText('Em breve');
  await page.waitForTimeout(350);
  expect(await page.locator('canvas').count()).toBe(1);
});
