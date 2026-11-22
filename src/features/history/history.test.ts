/// <reference types="bun" />
import { expect, test } from 'bun:test';

import type { Utterance } from '@/core/session';

import { added, asText, HISTORY_LIMIT, loadHistory, recapped, toConversation } from './history';

const people = { owner: 'en', other: 'fr' };
const said = (source: string, translation: string): Utterance => ({ id: source, speaker: 'owner', routedBy: 'language', status: 'done', source, translation });

test('a conversation keeps what was heard, as text', () => {
  const c = toConversation('c1', 1, people, [said('Hello', 'Bonjour'), said('', '')]);
  expect(c.lines).toHaveLength(1);
  expect(asText(c)).toEqual(['Hello / Bonjour']);
});

test('a damaged entry is dropped and the rest of the history is kept', async () => {
  const good = toConversation('c1', 1, people, [said('Hello', 'Bonjour')]);
  const { recap: _, ...noRecap } = toConversation('c2', 2, people, [said('Hi', 'Salut')]);
  const kept = new Map([['vorp.history.v1', JSON.stringify([noRecap, null, good])]]);
  const storage = { get: async (k: string) => kept.get(k) ?? null, set: async (k: string, v: string) => void kept.set(k, v) };
  const history = await loadHistory(storage);
  expect(history.store.get().map((c) => c.id)).toEqual(['c1']);
});

test('Vorp hearing itself is not kept', () => {
  const echo: Utterance = { ...said('bonjour a tous', ''), status: 'failed', error: 'echo' };
  expect(asText(toConversation('c1', 1, people, [said('Hello', 'Bonjour'), echo]))).toEqual(['Hello / Bonjour']);
});

test('history is newest first and bounded', () => {
  let list = [toConversation('old', 1, people, [said('a', 'b')])];
  for (let i = 0; i < HISTORY_LIMIT; i++) list = added(list, toConversation(`c${i}`, i, people, [said('a', 'b')]));
  expect(list).toHaveLength(HISTORY_LIMIT);
  expect(list[0].id).toBe(`c${HISTORY_LIMIT - 1}`);
  expect(list.some((c) => c.id === 'old')).toBe(false);
});

test('history survives a reload, and an unfinished recap is marked failed', async () => {
  const kept = new Map<string, string>();
  const storage = { get: async (k: string) => kept.get(k) ?? null, set: async (k: string, v: string) => void kept.set(k, v) };
  const first = await loadHistory(storage);
  first.add(toConversation('c1', 1, people, [said('Hello', 'Bonjour')]));
  first.setRecap('c1', { status: 'writing' });
  const second = await loadHistory(storage);
  expect(second.store.get()[0].recap).toEqual({ status: 'failed' });
  expect(recapped(second.store.get(), 'c1', { status: 'ready', text: { English: 'Hi' } })[0].recap.status).toBe('ready');
});

test('an answer that is only a stage direction is not kept', () => {
  const c = toConversation('c1', 1, people, [said('die', '<no speech>{pause}'), said('Hello', 'Bonjour')]);
  expect(asText(c)).toEqual(['Hello / Bonjour']);
});

test('a conversation saved before the owner model is read with the first seat as the owner', async () => {
  const old = {
    id: 'c0',
    endedAt: 1,
    participants: [
      { id: 'p1', language: 'en' },
      { id: 'p2', language: 'fr' },
    ],
    lines: [
      { speakerId: 'p2', source: 'Bonjour', translation: 'Hello' },
      { speakerId: 'p1', source: 'die', translation: '<no speech>{pause}' },
      { speakerId: 'p1', source: 'Thanks', translation: 'Merci' },
    ],
    recap: { status: 'none' },
  };
  const kept = new Map([['vorp.history.v1', JSON.stringify([old])]]);
  const storage = { get: async (k: string) => kept.get(k) ?? null, set: async (k: string, v: string) => void kept.set(k, v) };
  const [c] = (await loadHistory(storage)).store.get();
  expect(c.languages).toEqual({ owner: 'en', other: 'fr' });
  expect(c.lines).toEqual([
    { speaker: 'other', source: 'Bonjour', translation: 'Hello' },
    { speaker: 'owner', source: 'Thanks', translation: 'Merci' },
  ]);
  expect(c).not.toHaveProperty('participants');
});
