// On web the DOM components render inline, so a level getter goes straight to the engine,
// which samples it every frame without any React render.

import type { Level } from '@/ui/slots/contracts';

export function useLevelProp(level: Level | undefined, _running: boolean): Level {
  return level ?? 0;
}
