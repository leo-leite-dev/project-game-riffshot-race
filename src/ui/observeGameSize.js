// Mobile orientation and dynamic viewport events can arrive before the parent
// element's layout has settled. Observe the actual game area, not a stale window
// size, and keep Phaser's canvas and pointer coordinates in sync.
export function observeGameSize(game) {
  const parent = game.scale.parent;
  if (!parent || typeof ResizeObserver === 'undefined') return;
  const observer = new ResizeObserver(() => {
    const { width, height } = parent.getBoundingClientRect();
    if (width <= 0 || height <= 0 || (game.scale.width === width && game.scale.height === height)) return;
    game.scale.getParentBounds();
    game.scale.refresh();
  });
  observer.observe(parent);
  game.events.once('destroy', () => observer.disconnect());
}
