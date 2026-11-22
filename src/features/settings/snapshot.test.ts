/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { DEFAULT_PARTICIPANTS } from '@/config/conversation';

import { restore } from './snapshot';

const defaults = { agentAvatar: 'botClover', thinkingIndicator: 'orbWeaving' };
const offered = { agentAvatar: ['botClover', 'botGhost'], thinkingIndicator: ['orbWeaving'] };

test('nothing saved gives the defaults', () => {
  const { setup, theme } = restore(null, offered, defaults);
  expect(setup.participants).toEqual(DEFAULT_PARTICIPANTS);
  expect(theme).toBe('system');
});

test('a snapshot from another build keeps only what the tables know', () => {
  const { setup, slots, motion } = restore(
    JSON.stringify({
      participants: [
        { id: 'p1', name: 'Spanish speaker', language: 'es', voice: 'Kore' },
        { id: 'p2', name: 'French speaker', language: 'fr', voice: 'Kore' },
        { id: 'p3', name: 'Nobody', language: 'xx', voice: 'Kore' },
      ],
      tone: 'shouting',
      behaviours: ['recap', 'gone'],
      slots: { agentAvatar: 'botGhost', thinkingIndicator: 'gone' },
      motion: 'reduce',
    }),
    offered,
    defaults,
  );
  expect(setup.participants.map((p) => p.language)).toEqual(['es', 'fr']);
  expect(setup.settings.tone).toBe('neutral');
  expect(setup.settings.behaviours).toEqual(['recap']);
  expect(slots.agentAvatar).toBe('botGhost');
  expect(slots.thinkingIndicator).toBe('orbWeaving');
  expect(motion).toBe('reduce');
  expect(restore('not json', offered, defaults).setup.participants).toEqual(DEFAULT_PARTICIPANTS);
});
