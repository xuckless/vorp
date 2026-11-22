/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { duration, exitDuration, motion, rubberBand, staggerDelay, timing } from './motion';

describe('motion tokens', () => {
  test('exits are 20% shorter than entrances', () => {
    expect(exitDuration(200)).toBe(160);
    expect(timing('dropdown', 'exit', false).duration).toBe(exitDuration(duration.dropdown));
  });

  test('dropdowns stay within 150-250 ms', () => {
    expect(duration.dropdown).toBeGreaterThanOrEqual(150);
    expect(duration.dropdown).toBeLessThanOrEqual(250);
  });

  test('reduced motion makes timings instant and removes stagger', () => {
    expect(timing('slow', 'enter', true).duration).toBe(0);
    expect(staggerDelay(5, true)).toBe(0);
    expect(staggerDelay(3, false)).toBe(3 * motion.rowStagger);
  });

  test('entrances ease out, moves ease in and out', () => {
    expect(timing('base', 'enter', false).easing).toEqual([0.23, 1, 0.32, 1]);
    expect(timing('base', 'move', false).easing).toEqual([0.77, 0, 0.175, 1]);
  });

  test('rubber band follows less than the drag and keeps its sign', () => {
    expect(rubberBand(100, 300)).toBeGreaterThan(0);
    expect(rubberBand(100, 300)).toBeLessThan(100);
    expect(rubberBand(-100, 300)).toBeCloseTo(-rubberBand(100, 300));
    expect(rubberBand(10_000, 300)).toBeLessThan(300);
  });
});
