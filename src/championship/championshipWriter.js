// Hold one browser-managed lease for this game's save, not a second save or a
// localStorage spinlock. Browser teardown releases it even after a crashed tab.
export const CHAMPIONSHIP_WRITER_LOCK = 'riffshot-racing:championship:writer';

export function acquireChampionshipWriter(locks, onAcquired, onUnavailable) {
  let disposed = false;
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const unavailable = () => { if (!disposed) onUnavailable(); };
  if (!locks?.request) {
    unavailable();
    return () => { disposed = true; release(); };
  }
  try {
    Promise.resolve(locks.request(CHAMPIONSHIP_WRITER_LOCK, { mode: 'exclusive', ifAvailable: true }, lock => {
      if (disposed) return;
      if (!lock) { unavailable(); return; }
      onAcquired();
      return held;
    })).catch(unavailable);
  } catch {
    unavailable();
  }
  return () => { disposed = true; release(); };
}
