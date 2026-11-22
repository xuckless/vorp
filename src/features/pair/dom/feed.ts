// Feeding the light (`@/ui/dom` light.ts) from a paired view: its phase and side from the model,
// its level every frame from the voice in the air. Shared by the host's app and the guest's page.

import { useEffect, useRef } from 'react';

import { loop, tune, type Light } from '@/ui/dom/light';

import { pairLight, type PairTalkModel } from '../model';

/** A gentle working, for connecting and reconnecting. */
export const busyLevel = () => 0.18 + 0.08 * Math.sin(performance.now() / 300);

/** Where the level comes from: the voice getter, the busy wave, or nothing. */
export function levelSource(kind: 'voice' | 'busy' | 'rest', read: () => number): () => number {
  return kind === 'voice' ? read : kind === 'busy' ? busyLevel : () => 0;
}

/** Keeps the light in step with a paired view, when there is one; `active` false leaves it alone. */
export function usePairFeed(light: Light, talk: PairTalkModel | undefined, level: number | (() => number), active: boolean) {
  const source = useRef<() => number>(() => 0);
  useEffect(() => {
    if (!active) return;
    const read = typeof level === 'function' ? level : () => level;
    if (!talk) {
      tune(light, { phase: 'listening' });
      source.current = () => 0;
      return;
    }
    const lit = pairLight(talk);
    tune(light, { phase: lit.phase, who: lit.who });
    source.current = levelSource(lit.level, read);
  }, [light, talk, level, active]);
  useEffect(() => {
    if (!active) return;
    return loop(60, () => tune(light, { level: Math.max(0, Math.min(1, source.current())) }));
  }, [light, active]);
}
