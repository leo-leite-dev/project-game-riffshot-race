const button = document.querySelector<HTMLButtonElement>('#orientation-action');
const dismiss = document.querySelector<HTMLButtonElement>('#orientation-dismiss');
const orientationPrompt = document.querySelector<HTMLElement>('#orientation-prompt');
const message = document.querySelector<HTMLElement>('.orientation-message');

dismiss?.addEventListener('click', () => orientationPrompt?.classList.add('is-dismissed'));

button?.addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
    const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: 'landscape') => Promise<void> };
    if (orientation?.lock) {
      await orientation.lock('landscape');
      return;
    }
  } catch {
    // Browsers may require an installed app or deny orientation locking.
  }
  if (message) message.textContent = 'Este navegador não permite girar automaticamente. Gire o celular para a horizontal.';
});
