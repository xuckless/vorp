/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { base64ToBytes, base64ToPcm, bytesToBase64, pcmToBase64 } from './pcm';

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
