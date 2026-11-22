/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { SCRIPT, scriptAt, speech } from './fake';

describe('gallery fake data', () => {
  test('speech stays within 0..1 and pauses between phrases', () => {
    for (let t = 0; t < 30; t += 0.037) {
      const v = speech(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(speech(6)).toBe(0);
  });

  test('the script walks its steps in order and repeats', () => {
    expect(scriptAt(0).voice).toBe(SCRIPT[0].voice);
    expect(scriptAt(SCRIPT[0].seconds + 0.1).voice).toBe(SCRIPT[1].voice);
    const length = SCRIPT.reduce((s, x) => s + x.seconds, 0);
    expect(scriptAt(length + 0.1).index).toBe(0);
  });
});
