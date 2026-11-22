/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { DEFAULT_PEOPLE } from '@/config/conversation';

import { restore } from './snapshot';

const defaults = { agentAvatar: 'botClover', thinkingIndicator: 'orbWeaving' };
const offered = { agentAvatar: ['botClover', 'botGhost'], thinkingIndicator: ['orbWeaving'] };

test('nothing saved gives the defaults: owner English, other French, auto-detect on', () => {
  const { setup, theme } = restore(null, offered, defaults);
  expect(setup.people).toEqual(DEFAULT_PEOPLE);
  expect(setup.people.owner.language).toBe('en');
  expect(setup.people.other.language).toBe('fr');
  expect(setup.settings.autoDetect).toBe(true);
  expect(theme).toBe('system');
});

test('a snapshot from another build keeps only what the tables know', () => {
  const { setup, slots, motion } = restore(
    JSON.stringify({
      people: { owner: { language: 'hi', voice: 'Kore' }, other: { language: 'xx', voice: 'Nobody' } },
      autoDetect: false,
      tone: 'shouting',
      behaviours: ['recap', 'gone'],
      slots: { agentAvatar: 'botGhost', thinkingIndicator: 'gone' },
      motion: 'reduce',
    }),
    offered,
    defaults,
  );
  expect(setup.people).toEqual({ owner: { language: 'hi', voice: 'Kore' }, other: DEFAULT_PEOPLE.other });
  expect(setup.settings.autoDetect).toBe(false);
  expect(setup.settings.tone).toBe('neutral');
  expect(setup.settings.behaviours).toEqual(['recap']);
  expect(slots.agentAvatar).toBe('botGhost');
  expect(slots.thinkingIndicator).toBe('orbWeaving');
  expect(motion).toBe('reduce');
  expect(restore('not json', offered, defaults).setup.people).toEqual(DEFAULT_PEOPLE);
});

test('a snapshot from before the owner model maps the first seat to the owner and the second to the other', () => {
  const { setup } = restore(
    JSON.stringify({
      participants: [
        { id: 'p1', name: 'Spanish speaker', language: 'es', voice: 'Kore' },
        { id: 'p2', name: 'German speaker', language: 'de', voice: 'Kore' },
        { id: 'p3', name: 'French speaker', language: 'fr', voice: 'Kore' },
      ],
    }),
    offered,
    defaults,
  );
  expect(setup.people).toEqual({ owner: { language: 'es', voice: 'Kore' }, other: { language: 'de', voice: 'Kore' } });
  expect(setup.settings.autoDetect).toBe(true);
});

test('unrecognised people fall back to the defaults', () => {
  for (const people of [42, 'x', null, [], { owner: 'en' }]) {
    expect(restore(JSON.stringify({ people }), offered, defaults).setup.people).toEqual(DEFAULT_PEOPLE);
  }
  expect(restore(JSON.stringify({ participants: 'nope' }), offered, defaults).setup.people).toEqual(DEFAULT_PEOPLE);
});

test('a saved setup with one language on both sides gives the other person a different one', () => {
  const same = (language: string) => JSON.stringify({ people: { owner: { language, voice: 'Kore' }, other: { language, voice: 'Kore' } } });
  expect(restore(same('es'), offered, defaults).setup.people.other.language).toBe('fr');
  const french = restore(same('fr'), offered, defaults).setup.people;
  expect(french.owner.language).toBe('fr');
  expect(french.other.language).toBe('en');
});
