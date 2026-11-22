/// <reference types="bun" />
import { expect, test } from 'bun:test';

import type { Utterance } from '@/core/session';

import { added, asText, HISTORY_LIMIT, loadHistory, recapped, toConversation } from './history';

const people = [
  { id: 'a', name: 'A', language: 'en', voice: 'Charon' },
  { id: 'b', name: 'B', language: 'fr', voice: 'Charon' },
];
const said = (source: string, translation: string): Utterance => ({ id: source, speakerId: 'a', routedBy: 'language', status: 'done', source, translation });

test('a conversation keeps what was heard, as text', () => {
  const c = toConversation('c1', 1, people, [said('Hello', 'Bonjour'), said('', '')]);
  expect(c.lines).toHaveLength(1);
  expect(asText(c)).toEqual(['Hello / Bonjour']);
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
