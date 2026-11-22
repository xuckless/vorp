// On native the engine runs inside a web view and props cross an asynchronous bridge, so a
// level getter is sampled here at a modest rate and sent over as numbers.

import { useEffect, useState } from 'react';

import type { Level } from '@/ui/slots/contracts';

const SAMPLE_MS = 50;

export function useLevelProp(level: Level | undefined, running: boolean): number {
  const [sampled, setSampled] = useState(0);
  useEffect(() => {
    if (typeof level !== 'function' || !running) return;
    const id = setInterval(() => setSampled(Math.round(level() * 100) / 100), SAMPLE_MS);
    return () => clearInterval(id);
  }, [level, running]);
  return typeof level === 'function' ? sampled : (level ?? 0);
}
