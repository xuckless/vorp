/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { DEFAULT_PARTICIPANTS } from './conversation';
import { interpreterPrompt } from './prompts';

test('the interpreter prompt names both directions and forbids answering', () => {
  const prompt = interpreterPrompt(DEFAULT_PARTICIPANTS, { tone: 'neutral', behaviours: [] });
  expect(prompt).toContain('When you hear English, say it in French.');
  expect(prompt).toContain('When you hear French, say it in English.');
  expect(prompt).toContain('Never answer');
});

test('three languages list every other language', () => {
  const prompt = interpreterPrompt([
    ...DEFAULT_PARTICIPANTS,
    { id: 'p3', name: 'Spanish speaker', language: 'es', voice: 'Charon' },
  ], { tone: 'neutral', behaviours: [] });
  expect(prompt).toContain('When you hear Spanish, say it in English, then in French.');
});

test('tone and behaviours add their rules, and only when chosen', () => {
  const plain = interpreterPrompt(DEFAULT_PARTICIPANTS, { tone: 'neutral', behaviours: [] });
  const full = interpreterPrompt(DEFAULT_PARTICIPANTS, { tone: 'formal', behaviours: ['culturalNotes', 'recap'] });
  expect(plain).not.toContain('add_note');
  expect(full).toContain('add_note');
  expect(full).toContain('formal, polite register');
});
