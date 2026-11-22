// Motion tokens and helpers for the motion rules in AGENTS.md. Pure data and functions, no
// React, so they can be tested and used by any animation API (Animated, Reanimated, CSS).
//
// The curves are the signed-off design's (22 November 2026); durations stay provisional. The ratios fixed by
// the rules (press 0.97, popover 0.95, exits 20% shorter, 30 ms row stagger, 12% knob stretch)
// are not provisional.

export type Bezier = readonly [number, number, number, number];

/** Entrance durations in ms. Exits derive from these (rule 15); never write an exit time. */
export const duration = {
  /** Press feedback and icon crossfades. */
  press: 100,
  /** Small state changes: a chip, a toggle. */
  fast: 150,
  /** Dropdowns and popovers (rule 2: 150–250 ms). */
  dropdown: 200,
  /** Cards and sheets moving into place. */
  base: 260,
  /** Large moves across the stage. */
  slow: 400,
} as const;

export type DurationName = keyof typeof duration;

export const easing = {
  /** Rule 1: entrances ease out. */
  enter: [0.16, 1, 0.3, 1],
  /** Rule 9: moves ease in and out. */
  move: [0.65, 0, 0.35, 1],
  /** Exits accelerate away toward their trigger (rule 12). */
  exit: [0.4, 0, 1, 1],
} as const satisfies Record<string, Bezier>;

export type EasingName = keyof typeof easing;

export const motion = {
  /** Small entrance / exit travel, points: a caption or row sliding into place. */
  shift: 6,
  /** Rule 4. */
  pressScale: 0.97,
  /** Rule 10. */
  popoverFromScale: 0.95,
  /** Rule 15: exits take this share of the entrance. */
  exitRatio: 0.8,
  /** Rule 3: list rows, ms apart. */
  rowStagger: 30,
  /** Rule 6: details settle this long after their container, ms. */
  settleStagger: 60,
  /** Rule 5: a moving knob stretches by this share along its motion. */
  knobStretch: 0.12,
  /** Rule 8: the confirming pulse grows to this scale and back. */
  pulseScale: 1.04,
  /** Rule 18: icons crossfade through this much blur, px. */
  iconBlur: 4,
  /** Rule 19: rubber-band resistance past bounds (the iOS constant). */
  rubberBand: 0.55,
} as const;

/** Rule 15: an exit is 20% shorter than its entrance. */
export function exitDuration(entrance: number): number {
  return Math.round(entrance * motion.exitRatio);
}

export type Phase = 'enter' | 'exit' | 'move';

export type Timing = { duration: number; easing: Bezier };

/** Duration and curve for one phase of a named motion. Reduced motion makes it instant. */
export function timing(name: DurationName, phase: Phase, reduced: boolean): Timing {
  const ms = phase === 'exit' ? exitDuration(duration[name]) : duration[name];
  return { duration: reduced ? 0 : ms, easing: easing[phase] };
}

/** Rule 3 / 6: the delay of the item at `index`. Reduced motion shows everything at once. */
export function staggerDelay(index: number, reduced: boolean, step: number = motion.rowStagger): number {
  return reduced ? 0 : Math.max(0, index) * step;
}

/** Rule 19: how far content follows a drag of `overshoot` past its bound in a `size` box. */
export function rubberBand(overshoot: number, size: number, c: number = motion.rubberBand): number {
  if (size <= 0) return 0;
  const sign = Math.sign(overshoot);
  const x = Math.abs(overshoot);
  return sign * (1 - 1 / ((x * c) / size + 1)) * size;
}

/** A curve as CSS, for web-only styles and DOM components. */
export function cssEasing([a, b, c, d]: Bezier): string {
  return `cubic-bezier(${a}, ${b}, ${c}, ${d})`;
}
