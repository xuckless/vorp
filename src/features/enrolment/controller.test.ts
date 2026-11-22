/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { ENROLMENT_SENTENCES } from '@/config/enrolment';
import type { AudioInput, KeyValueStorage, VoiceEmbedder } from '@/services';

import { createEnrolment } from './controller';
import { VOICEPRINT_KEY } from './saved';

const settle = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

function fakes(saved: string | null = null) {
  const data = new Map<string, string>(saved === null ? [] : [[VOICEPRINT_KEY, saved]]);
  const storage: KeyValueStorage = {
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    remove: async (k) => void data.delete(k),
  };
  let chunk: ((pcm: Int16Array) => void) | undefined;
  const calls: string[] = [];
  const input: AudioInput = {
    open: async () => void calls.push('open'),
    close: () => void calls.push('close'),
    onChunk: (l) => {
      chunk = l;
      return () => (chunk = undefined);
    },
  };
  const embedded: number[] = [];
  const voice: VoiceEmbedder = {
    available: true,
    load: async () => {},
    embed: async (pcm) => {
      embedded.push(pcm.length);
      return Array.from({ length: 256 }, (_, i) => (i === 0 ? 1 : 0));
    },
  };
  const speak = (seconds: number) => {
    for (let i = 0; i < seconds * 10; i++) chunk?.(new Int16Array(1600).fill(6000));
  };
  return { data, storage, calls, embedded, speak, services: { voice, input: () => input } };
}

test('three readings become one voiceprint on the device, and no audio is kept', async () => {
  const f = fakes();
  const e = createEnrolment(f.services, f.storage, () => 42);
  await settle();
  expect(e.store.get().status).toBe('notEnrolled');

  e.begin('fr');
  expect(e.store.get().sentences).toEqual(ENROLMENT_SENTENCES.fr);
  for (let i = 0; i < 3; i++) {
    f.speak(3);
    expect(e.level()).toBeGreaterThan(0);
    e.next();
  }
  expect(e.store.get().status).toBe('computing');
  await settle();

  expect(e.store.get().status).toBe('enrolled');
  expect(f.embedded).toEqual([48000, 48000, 48000]);
  expect(f.calls).toEqual(['open', 'close']);
  const stored = JSON.parse(f.data.get(VOICEPRINT_KEY)!);
  expect(stored).toMatchObject({ language: 'fr', createdAt: 42 });
  expect(stored.embedding).toHaveLength(256);
  expect(e.ownerPrint()).toEqual(stored.embedding);

  e.remove();
  await settle();
  expect(f.data.has(VOICEPRINT_KEY)).toBe(false);
  expect(e.ownerPrint()).toBeUndefined();
});

test('a reading with too little voice is asked for again', async () => {
  const f = fakes();
  const e = createEnrolment(f.services, f.storage);
  await settle();
  e.begin('en');
  f.speak(1);
  e.next();
  expect(e.store.get()).toMatchObject({ status: 'recording', index: 0, error: { kind: 'tooShort' } });
  f.speak(3);
  e.next();
  expect(e.store.get()).toMatchObject({ index: 1, error: undefined });
});
