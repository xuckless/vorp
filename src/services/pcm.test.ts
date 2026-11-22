/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { base64ToBytes, base64ToPcm, bytesToBase64, joinPcm, pcmToBase64, pcmToFloat, resample, voicedSamples } from './pcm';

test('base64 matches the platform encoder for every padding case', () => {
  for (const text of ['', 'a', 'ab', 'abc', 'abcd', 'hello world!']) {
    const bytes = new TextEncoder().encode(text);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    expect(Array.from(base64ToBytes(Buffer.from(bytes).toString('base64')))).toEqual(Array.from(bytes));
  }
});

test('PCM round-trips as little-endian 16-bit', () => {
  const pcm = new Int16Array([0, 1, -1, 32767, -32768, 1234]);
  const encoded = pcmToBase64(pcm);
  expect(Buffer.from(encoded, 'base64')[2]).toBe(1); // sample 1, low byte first
  expect(Array.from(base64ToPcm(encoded))).toEqual(Array.from(pcm));
});

test('resampling keeps the duration and interpolates between samples', () => {
  const pcm = new Int16Array([0, 300, 600, 900, 1200, 1500]);
  expect(Array.from(resample(pcm, 24000, 16000))).toEqual([0, 450, 900, 1350]);
  expect(resample(new Int16Array(24000), 24000, 16000)).toHaveLength(16000);
  expect(Array.from(resample(pcm, 16000, 16000))).toEqual(Array.from(pcm));
});

test('voiced samples keep loud frames and drop the pauses between them', () => {
  const frame = 4;
  const loud = [8000, -8000, 8000, -8000];
  const quiet = [1, -1, 1, -1];
  const pcm = new Int16Array([...loud, ...quiet, ...quiet, ...loud, 5]);
  const voiced = voicedSamples(pcm, { frame, relative: 0.1, floor: 0.001 });
  expect(Array.from(voiced)).toEqual([...loud, ...loud]);
  expect(voicedSamples(new Int16Array(16), { frame, relative: 0.1, floor: 0.001 })).toHaveLength(0);
});

test('PCM to floats in -1..1, and chunks joined in order', () => {
  expect(Array.from(pcmToFloat(new Int16Array([0, -32768, 16384])))).toEqual([0, -1, 0.5]);
  expect(Array.from(joinPcm([new Int16Array([1, 2]), new Int16Array([]), new Int16Array([3])]))).toEqual([1, 2, 3]);
});
