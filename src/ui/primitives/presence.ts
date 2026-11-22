// Presence for things that animate in and out: stays mounted through the exit, and is `shown`
// one frame after mounting so the entrance has a state to move from. Visual-only local state.

import { useEffect, useState } from 'react';

export function usePresence(open: boolean, exitMs: number): { mounted: boolean; shown: boolean } {
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(() => setArrived(true));
      return () => cancelAnimationFrame(frame);
    }
    const timer = setTimeout(() => setArrived(false), exitMs);
    return () => clearTimeout(timer);
  }, [open, exitMs]);
  return { mounted: open || arrived, shown: open && arrived };
}
