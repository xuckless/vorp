/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { nativeName, normaliseLanguage } from './languages';

test('a reported language becomes a code from the table where one fits', () => {
  expect(normaliseLanguage('hi')).toBe('hi');
  expect(normaliseLanguage('fr-FR')).toBe('fr');
  expect(normaliseLanguage('EN_us')).toBe('en');
  expect(normaliseLanguage('zh')).toBe('zh-Hans');
  expect(normaliseLanguage('zh-hant')).toBe('zh-Hant');
  expect(normaliseLanguage('pt-PT')).toBe('pt-PT');
  expect(normaliseLanguage('Hindi')).toBe('hi');
});

test('a language missing from the table is kept as reported', () => {
  expect(normaliseLanguage(' tlh ')).toBe('tlh');
});

test('a language is named in itself, as a label, else in English', () => {
  expect(nativeName('es')).toBe('Español');
  expect(nativeName('fr')).toBe('Français');
  expect(nativeName('ja')).toBe('日本語');
  expect(nativeName('zu')).toBe('isiZulu');
  expect(nativeName('qqq')).toBe('qqq');
});
