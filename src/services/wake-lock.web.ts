// The Screen Wake Lock API keeps a paired phone's screen on. The browser drops the lock whenever
// the page is hidden, so it is asked for again when the page comes back. Where the API is missing
// (older iPhones) nothing happens; the room's rejoin covers a phone that locks anyway.

import type { WakeLock } from './types';

type Sentinel = { release: () => Promise<void> };
type WakeLockApi = { request: (type: 'screen') => Promise<Sentinel> };

export function createWakeLock(): WakeLock {
  const api = (typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock) ?? undefined;
  let wanted = false;
  let acquiring = false;
  let listening = false;
  let held: Sentinel | null = null;

  function acquire() {
    if (!api || !wanted || held || acquiring || document.visibilityState !== 'visible') return;
    acquiring = true;
    api.request('screen').then(
      (sentinel) => {
        acquiring = false;
        if (wanted && document.visibilityState === 'visible') held = sentinel;
        else void sentinel.release().catch(() => {});
      },
      () => {
        acquiring = false;
      },
    );
  }

  function onVisibility() {
    // A hidden page loses its lock; it is a new one when the page is visible again.
    if (document.visibilityState !== 'visible') held = null;
    else acquire();
  }

  return {
    set(on) {
      wanted = on;
      if (on) {
        if (api && !listening) {
          document.addEventListener('visibilitychange', onVisibility);
          listening = true;
        }
        return acquire();
      }
      if (api && listening) {
        document.removeEventListener('visibilitychange', onVisibility);
        listening = false;
      }
      const old = held;
      held = null;
      void old?.release().catch(() => {});
    },
  };
}
