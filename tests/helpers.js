import { test as base, expect } from '@playwright/test';

export { expect };
export const test = base.extend({
  consoleErrors: [async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => errors.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`));
    page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
    await use(errors);
    expect(errors, 'Erros JavaScript, de console ou de carregamento').toEqual([]);
    await expect(page.locator('canvas:not(.race-three-canvas)')).toHaveCount(1);
    const direct = await page.locator('#game.race-layered').count();
    await expect(page.locator('canvas.race-three-canvas')).toHaveCount(direct ? 1 : 0);
    await expect(page.locator('canvas')).toHaveCount(direct ? 2 : 1);
  }, { auto: true }],
});

// Inspect the real game through its Vite export; no alternate navigation path.
export async function state(page) {
  return page.evaluate(async () => {
    const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
    const scene = game.scene.getScenes(true)[0];
    return {
      key: scene?.scene.key,
      selected: scene?.selectedIndex,
      focus: scene?.focusIndex,
      transitioning: scene?.transitioning,
      toast: scene?.toast?.text,
      toastAlpha: scene?.toast?.alpha,
      keyboardListeners: scene?.input.keyboard.listenerCount('keydown'),
      textures: game.textures.getTextureKeys().length,
      characterId: game.registry.get('selectedCharacterId') ?? null,
      vehicleId: game.registry.get('selectedVehicleId') ?? null,
      paintId: game.registry.get('selectedPaintId') ?? null,
      difficultyId: game.registry.get('selectedDifficultyId') ?? null,
      trackId: game.registry.get('selectedTrackId') ?? null,
      musicStarted: !!game.menuMusic?.source,
      musicMuted: game.menuMusic?.muted,
    };
  });
}

export async function waitScene(page, key) {
  await expect.poll(async () => (await state(page)).key).toBe(key);
  await expect.poll(async () => page.evaluate(async () => {
    const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
    return game.scene.getScenes(true)[0]?.cameras.main.fadeEffect.isRunning;
  })).toBe(false);
}

export async function openMenu(page) {
  await page.goto('/');
  await expect.poll(async () => (await state(page)).key).toBe('Splash');
  await page.keyboard.press('Enter');
  await waitScene(page, 'MainMenu');
}

export async function openCharacters(page) {
  await openMenu(page);
  await page.keyboard.press('Enter');
  await waitScene(page, 'DifficultySelection');
  await page.keyboard.press('Enter');
  await waitScene(page, 'CharacterSelection');
}

export async function objectPosition(page, property, index = null) {
  // A screenshot or a click can arrive between a viewport event and Phaser's
  // resize step. Wait for real layout, instead of clicking stale coordinates.
  await expect.poll(async () => page.evaluate(async () => {
    const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
    const parent = game.scale.parent.getBoundingClientRect();
    return game.scale.width === parent.width && game.scale.height === parent.height;
  })).toBe(true);
  return page.evaluate(async ({ property, index }) => {
    const { game } = await import(document.querySelector('script[src*="/src/main.js"]').src);
    const scene = game.scene.getScenes(true)[0];
    const object = index === null ? scene[property] : scene[property][index];
    const bounds = object.getBounds();
    const canvas = game.canvas.getBoundingClientRect();
    return {
      x: canvas.x + bounds.centerX * canvas.width / game.scale.width,
      y: canvas.y + bounds.centerY * canvas.height / game.scale.height,
    };
  }, { property, index });
}

export function buttonPosition(page, index = 0, back = false) {
  return objectPosition(page, back ? 'backButton' : 'buttons', back ? null : index);
}

export async function clickObject(page, property, index = null) {
  const { x, y } = await objectPosition(page, property, index);
  await page.mouse.click(x, y);
}
