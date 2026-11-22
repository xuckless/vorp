// The light: one mutable object the canvases read every frame, so voice levels never re-render
// React. Ported from the owner's Vorp design (the-wallpaper-project src/vorp/light.ts).
// `level` is fed once per frame from `source` (the app's mic or output level); see `feed`.

import { SPECTRUM } from '@/ui/tokens';

/** What the light is doing, named as the design names the stage's phases. */
export type Phase = 'listening' | 'hearing' | 'translating' | 'speaking';
/** Whose side the light comes from: you (the owner, at the bottom) or them (at the top). */
export type Who = 'you' | 'them';

export type Light = {
  phase: Phase;
  who: Who;
  level: number;
  /** Smoothed energy per side, 0–1, eased by the aurora and read by the ring. */
  you: number;
  them: number;
  dark: boolean;
  reduced: boolean;
};

export const createLight = (): Light => ({ phase: 'listening', who: 'you', level: 0, you: 0, them: 0, dark: true, reduced: false });

/** Set what the light is doing. The light is imperative by design (read per frame, never rendered),
 *  so components tune it from effects through this, not by assignment. */
export function tune(light: Light, patch: Partial<Light>) {
  Object.assign(light, patch);
}

export { SPECTRUM };
/** Your end of the spectrum and theirs. */
export const SIDE = { you: SPECTRUM.blue, them: SPECTRUM.orange } as const;

/** rAF loop capped at `fps`, paused while the tab is hidden. Returns stop. */
export function loop(fps: number, frame: (t: number, dt: number) => void): () => void {
  let id = 0;
  let last = 0;
  let prev = performance.now();
  const step = 1000 / fps;
  const tick = (now: number) => {
    id = requestAnimationFrame(tick);
    if (document.hidden || now - last < step - 1) return;
    last = now;
    frame(now, Math.min(100, now - prev));
    prev = now;
  };
  id = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(id);
}

/** Ease `light.you` and `light.them` toward who is speaking. Call once per frame from one place. */
export function settle(light: Light, dt: number) {
  const active = light.phase === 'hearing' || light.phase === 'speaking';
  const k = 1 - Math.exp(-dt / 380);
  const target = (side: Who) => (active && light.who === side ? 0.35 + 0.65 * light.level : 0);
  light.you += (target('you') - light.you) * k;
  light.them += (target('them') - light.them) * k;
}
