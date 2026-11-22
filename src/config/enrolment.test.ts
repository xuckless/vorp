/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { ENROLMENT_SENTENCES, enrolmentSentences } from './enrolment';
import { LANGUAGES } from './languages';

test('every row is a language of the table, with three distinct sentences', () => {
  for (const [code, sentences] of Object.entries(ENROLMENT_SENTENCES)) {
    expect(LANGUAGES.some((l) => l.code === code)).toBe(true);
    expect(new Set(sentences).size).toBe(3);
  }
});

test('the pinned and common languages have their own sentences', () => {
  for (const code of ['en', 'fr', 'es', 'de', 'zh-Hans', 'ar', 'hi', 'ja', 'pt-BR']) expect(ENROLMENT_SENTENCES[code]).toBeDefined();
});

test('a variant reads its family row, anything else reads English', () => {
  expect(enrolmentSentences('fr-CA')).toBe(ENROLMENT_SENTENCES.fr);
  expect(enrolmentSentences('pt')).toBe(ENROLMENT_SENTENCES['pt-BR']);
  expect(enrolmentSentences('zu')).toBe(ENROLMENT_SENTENCES.en);
});
