/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { DEFAULT_PEOPLE } from './conversation';
import { interpreterPrompt, languageTool, pairedPrompt, systemPrompt } from './prompts';

const plain = { tone: 'neutral', behaviours: [], autoDetect: true };

test('anything not in the owner language is interpreted into it, and nothing is answered', () => {
  const prompt = interpreterPrompt(DEFAULT_PEOPLE, plain);
  expect(prompt).toContain('The owner speaks English.');
  expect(prompt).toContain('When you hear any language other than English, the other person is speaking: say it in English');
  expect(prompt).toContain('Never answer');
});

test('with auto-detect the owner is interpreted into what the other person last spoke', () => {
  const prompt = interpreterPrompt(DEFAULT_PEOPLE, plain);
  expect(prompt).toContain('the language the other person spoke most recently');
  expect(prompt).toContain('Until the other person has spoken, say it in French.');
});

test('without auto-detect the owner is always interpreted into the picked language', () => {
  const prompt = interpreterPrompt(DEFAULT_PEOPLE, { ...plain, autoDetect: false });
  expect(prompt).toContain('When you hear English, the owner is speaking: say it in French.');
  expect(prompt).not.toContain('most recently');
});

test('the language report takes any language, not a list of the setup', () => {
  expect(languageTool.parametersJsonSchema.properties.language).not.toHaveProperty('enum');
});

test('tone and behaviours add their rules, and only when chosen', () => {
  const none = interpreterPrompt(DEFAULT_PEOPLE, plain);
  const full = interpreterPrompt(DEFAULT_PEOPLE, { ...plain, tone: 'formal', behaviours: ['culturalNotes', 'recap'] });
  expect(none).not.toContain('add_note');
  expect(full).toContain('add_note');
  expect(full).toContain('formal, polite register');
});

test('a paired phone interprets only its owner, one way, and leaves the other phone alone', () => {
  const prompt = pairedPrompt(DEFAULT_PEOPLE, plain);
  expect(prompt).toContain('When the owner speaks English, say it in French.');
  expect(prompt).toContain('any language other than English');
  expect(prompt).toContain("phone's loudspeaker");
  expect(prompt).toContain('Never answer');
  expect(prompt).not.toContain('say it in English');
});

test('the prompt row comes from the settings; unset is the one-device interpreter', () => {
  expect(systemPrompt(DEFAULT_PEOPLE, plain)).toBe(interpreterPrompt(DEFAULT_PEOPLE, plain));
  expect(systemPrompt(DEFAULT_PEOPLE, { ...plain, prompt: 'paired' })).toBe(pairedPrompt(DEFAULT_PEOPLE, plain));
});
