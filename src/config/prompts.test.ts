/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { DEFAULT_PARTICIPANTS } from './conversation';
import { interpreterPrompt } from './prompts';

test('the interpreter prompt names both directions and forbids answering', () => {
  const prompt = interpreterPrompt(DEFAULT_PARTICIPANTS);
  expect(prompt).toContain('When you hear English, say it in French.');
  expect(prompt).toContain('When you hear French, say it in English.');
  expect(prompt).toContain('Never answer');
});

test('three languages list every other language', () => {
  const prompt = interpreterPrompt([
    ...DEFAULT_PARTICIPANTS,
    { id: 'p3', name: 'Spanish speaker', language: 'es', voice: 'Charon' },
  ]);
  expect(prompt).toContain('When you hear Spanish, say it in English, then in French.');
});
