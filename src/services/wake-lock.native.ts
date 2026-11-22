// Native keeps the screen on with expo-keep-awake once paired mode runs natively (native audio is
// not built yet, see phase 6). Until then this does nothing.

import type { WakeLock } from './types';

export function createWakeLock(): WakeLock {
  return { set: () => {} };
}
