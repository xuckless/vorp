// Native cues (a recorded sound and expo-haptics) come with native paired mode. Silent until then.

import type { Cues } from './types';

export function createCues(): Cues {
  return { prime: () => {}, play: () => {} };
}
