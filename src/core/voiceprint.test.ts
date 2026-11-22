/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { average, cosine, judgeVoice, normalise, type VoiceThresholds } from './voiceprint';

const t: VoiceThresholds = { owner: 0.5, other: 0.2, echo: 0.5 };
const close = (x: number, y: number) => expect(Math.abs(x - y)).toBeLessThan(1e-9);

test('cosine is direction only, and 0 for empty, zero or mismatched vectors', () => {
  close(cosine([1, 0], [3, 0]), 1);
  close(cosine([1, 0], [0, 2]), 0);
  close(cosine([1, 1], [-1, -1]), -1);
  expect(cosine([], [])).toBe(0);
  expect(cosine([0, 0], [1, 0])).toBe(0);
  expect(cosine([1, 0], [1, 0, 0])).toBe(0);
});

test('normalise gives unit length and leaves a zero vector alone', () => {
  expect(normalise([3, 4])).toEqual([0.6, 0.8]);
  expect(normalise([0, 0])).toEqual([0, 0]);
});

test('average weighs every embedding the same, whatever its length, and is unit length', () => {
  const print = average([
    [10, 0],
    [0, 1],
  ])!;
  close(print[0], Math.SQRT1_2);
  close(print[1], Math.SQRT1_2);
  expect(average([])).toBeUndefined();
  expect(average([[1, 0], [1]])).toBeUndefined();
});

test('the owner, the other person and the unsure band between them', () => {
  const owner = [1, 0, 0];
  expect(judgeVoice([1, 0.1, 0], { owner }, t).kind).toBe('owner');
  expect(judgeVoice([0, 1, 0], { owner }, t).kind).toBe('other');
  expect(judgeVoice([0.35, 1, 0], { owner }, t).kind).toBe('unsure'); // cosine about 0.33
});

test('without an enrolled owner only an echo can be named', () => {
  expect(judgeVoice([0, 1, 0], {}, t).kind).toBe('unsure');
  expect(judgeVoice([0, 0, 1], { interpreter: [0, 0, 1] }, t)).toEqual({ kind: 'echo', owner: undefined, interpreter: 1 });
  expect(judgeVoice([0, 1, 0], { interpreter: [0, 0, 1] }, t).kind).toBe('unsure');
});

test("an echo must sound more like Vorp than like the owner, and above the threshold", () => {
  const prints = { owner: [1, 0, 0], interpreter: [0, 0, 1] };
  expect(judgeVoice([0, 0.2, 1], prints, t).kind).toBe('echo');
  // As close to the owner as to Vorp: the owner, not an echo.
  expect(judgeVoice([1, 0, 1], prints, t).kind).toBe('owner');
  // Closer to Vorp but under the echo threshold: judged against the owner only.
  expect(judgeVoice([0, 1, 0.3], prints, t).kind).toBe('other');
});
