import { test as base, expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';

export { expect };
type Dynamic = {
  [key: string]: Dynamic;
  [key: number]: Dynamic;
  (...args: unknown[]): Dynamic;
};

declare global {
  interface Window {
    __garageOriginalPortrait?: unknown;
    __garageResourceIdentity: { owner: Dynamic; models: Dynamic; renderer: Dynamic };
    __garageArm: { states: string[]; seconds: number | null };
    __garageOnlinePaints: number;
    __garageTeamColor: string;
    __riffshotLogoDrawn: boolean;
    __riffshotSloganDrawn: boolean;
    __raceSpeedValues: string[];
    __raceNitroDrawn: boolean;
    __isometricCameraDrawn: boolean;
    __engineAnalyser: AnalyserNode;
    __initialAudio: Dynamic;
    __raceProjectionReady: boolean;
    webkitOfflineAudioContext?: typeof OfflineAudioContext;
  }
}

export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [async ({ page }: { page: Page }, use: (errors: string[]) => Promise<void>) => {
    const errors: string[] = [];
    page.on('pageerror', (error: Error) => errors.push(error.message));
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
export async function state(page: Page) {
  return page.evaluate(async () => {
    const script = document.querySelector('script[src*="/src/main.ts"]');
    if (!(script instanceof HTMLScriptElement)) throw new Error('Entrada do jogo não encontrada');
    const { game } = await import(script.src);
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

export async function waitScene(page: Page, key: string) {
  await expect.poll(async () => (await state(page)).key).toBe(key);
  await expect.poll(async () => page.evaluate(async () => {
    const script = document.querySelector('script[src*="/src/main.ts"]');
    if (!(script instanceof HTMLScriptElement)) throw new Error('Entrada do jogo não encontrada');
    const { game } = await import(script.src);
    return game.scene.getScenes(true)[0]?.cameras.main.fadeEffect.isRunning;
  })).toBe(false);
}

export async function openMenu(page: Page) {
  await page.goto('/');
  await expect.poll(async () => (await state(page)).key).toBe('Splash');
  await page.keyboard.press('Enter');
  await waitScene(page, 'MainMenu');
}

export async function openCharacters(page: Page) {
  await openMenu(page);
  await page.keyboard.press('Enter');
  await waitScene(page, 'DifficultySelection');
  await page.keyboard.press('Enter');
  await waitScene(page, 'CharacterSelection');
}

export async function objectPosition(page: Page, property: string, index: number | null = null) {
  // A screenshot or a click can arrive between a viewport event and Phaser's
  // resize step. Wait for real layout, instead of clicking stale coordinates.
  await expect.poll(async () => page.evaluate(async () => {
    const script = document.querySelector('script[src*="/src/main.ts"]');
    if (!(script instanceof HTMLScriptElement)) throw new Error('Entrada do jogo não encontrada');
    const { game } = await import(script.src);
    const parent = game.scale.parent.getBoundingClientRect();
    return game.scale.width === parent.width && game.scale.height === parent.height;
  })).toBe(true);
  return page.evaluate(async ({ property, index }) => {
    const script = document.querySelector('script[src*="/src/main.ts"]');
    if (!(script instanceof HTMLScriptElement)) throw new Error('Entrada do jogo não encontrada');
    const { game } = await import(script.src);
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

export function buttonPosition(page: Page, index = 0, back = false) {
  return objectPosition(page, back ? 'backButton' : 'buttons', back ? null : index);
}

export async function clickObject(page: Page, property: string, index: number | null = null) {
  const { x, y } = await objectPosition(page, property, index);
  await page.mouse.click(x, y);
}
