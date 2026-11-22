/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { LANGUAGES } from '@/config/languages';
import { DEFAULT_SETTINGS } from '@/config/policies';
import { initialSession, transition, type People } from '@/core/session';

import { pickableLanguages, shownLanguage, withLanguage } from './people';

const people: People = { owner: { language: 'en', voice: 'Charon' }, other: { language: 'pt-BR', voice: 'Charon' } };

test("a role can pick any language but the other role's, variants included", () => {
  const forOwner = pickableLanguages(people, 'owner').map((l) => l.code);
  expect(forOwner).not.toContain('pt-BR');
  expect(forOwner).not.toContain('pt-PT');
  expect(forOwner).toContain('en');
  expect(pickableLanguages(people, 'other').map((l) => l.code)).not.toContain('en');
  expect(pickableLanguages(people, 'other')).toHaveLength(LANGUAGES.length - 1);
});

test('changing a language never gives both people the same one', () => {
  expect(withLanguage(people, 'other', 'fr')?.other.language).toBe('fr');
  expect(withLanguage(people, 'other', 'en-GB')).toBeUndefined();
  expect(withLanguage(people, 'owner', 'pt-PT')).toBeUndefined();
});

test('their language shows what they spoke during a conversation and the pick once it stops', () => {
  const events = [
    { type: 'start' },
    { type: 'connected' },
    { type: 'speechStarted' },
    { type: 'inputTranscript', text: 'Hola' },
    { type: 'speechEnded' },
    { type: 'sourceLanguage', language: 'es' },
  ] as const;
  const live = events.reduce((s, e) => transition(s, e)[0], initialSession(people, DEFAULT_SETTINGS));
  expect(shownLanguage(live, 'other')).toBe('es');
  expect(shownLanguage(live, 'owner')).toBe('en');
  const [stopped] = transition(live, { type: 'stop' });
  expect(shownLanguage(stopped, 'other')).toBe('pt-BR');
});
