/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { DEFAULT_SETTINGS } from '@/config/policies';
import { initialSession, transition, type People, type Session, type SessionEvent } from '@/core/session';
import { initialEnrolment } from '@/features/enrolment/enrolment';
import type { Conversation } from '@/features/history/history';

import { copyText, enrolModel, historyItem, languageChoices, setupEvent, setupModel, talkModel, whenText } from './model';

const people: People = { owner: { language: 'en', voice: 'Charon' }, other: { language: 'fr', voice: 'Charon' } };
const run = (events: SessionEvent[], settings = DEFAULT_SETTINGS): Session =>
  events.reduce((s, e) => transition(s, e)[0], initialSession(people, settings));
const open: SessionEvent[] = [{ type: 'start' }, { type: 'connected' }];
const pcm = new Int16Array([1, 2, 3]);
const theyAsked: SessionEvent[] = [
  ...open,
  { type: 'speechStarted' },
  { type: 'inputTranscript', text: 'Où est la gare ?' },
  { type: 'speechEnded' },
  { type: 'sourceLanguage', language: 'fr' },
];

test('no conversation, no talk view', () => {
  expect(talkModel(run([]), 'live')).toBeUndefined();
});

test('connecting, then listening, in the design’s words', () => {
  expect(talkModel(run([{ type: 'start' }]), 'live')).toMatchObject({ connection: 'connecting', status: 'Connecting', quiet: 'Getting ready to listen.', canHold: false });
  expect(talkModel(run(open), 'live')).toMatchObject({ connection: 'live', phase: 'listening', status: 'Listening', quiet: 'Speak, and Vorp will say it in French.', canHold: true });
  // Hold to talk is never live in the demo.
  expect(talkModel(run(open), 'demo')?.canHold).toBe(false);
});

test('hands-free off asks for the button', () => {
  const manual = { ...DEFAULT_SETTINGS, detection: 'manual' as const };
  expect(talkModel(run(open, manual), 'live')).toMatchObject({ status: 'Hold to talk', quiet: 'Hold the button and speak. Vorp says it in French.' });
});

test('a turn: hearing, translating, then speaking to you with the card revealed', () => {
  expect(talkModel(run([...open, { type: 'speechStarted' }]), 'live')).toMatchObject({ phase: 'hearing', status: 'Hearing' });
  const translating = talkModel(run(theyAsked), 'live');
  expect(translating).toMatchObject({ phase: 'translating', who: 'them', status: 'Translating' });
  expect(translating?.card).toMatchObject({ who: 'them', source: 'Où est la gare ?', revealed: false, speaking: false });

  const spoken = talkModel(
    run([...theyAsked, { type: 'outputTranscript', text: 'Where is the station?' }, { type: 'outputAudio', pcm }, { type: 'playbackStarted', utteranceId: 'u1' }]),
    'live',
  );
  expect(spoken).toMatchObject({ phase: 'speaking', who: 'them', status: 'Speaking to you' });
  expect(spoken?.card).toMatchObject({ translation: 'Where is the station?', revealed: true, speaking: true });
});

test('holding the button makes way for you until you are heard', () => {
  const held = talkModel(run([...open, { type: 'pressTalk', speaker: 'owner' }]), 'live');
  expect(held).toMatchObject({ held: true, phase: 'hearing', who: 'you', status: 'Hearing you', quiet: 'Go ahead, Vorp is listening to you.' });
  expect(held?.card).toBeUndefined();
});

test('them speaking another language: status and the line under the card say so', () => {
  const spanish: SessionEvent[] = [
    ...open,
    { type: 'speechStarted' },
    { type: 'inputTranscript', text: '¿Dónde está la estación?' },
    { type: 'speechEnded' },
    { type: 'sourceLanguage', language: 'es' },
  ];
  const t = talkModel(run([...spanish, { type: 'turnComplete' }, { type: 'speechStarted' }]), 'live');
  expect(t?.aside).toBe('They’re speaking Spanish, so Vorp switched from French.');
  expect(talkModel(run(spanish, { ...DEFAULT_SETTINGS, autoDetect: false }), 'live')?.aside).toBeUndefined();
});

test('errors become a problem; reconnecting keeps the card and says why', () => {
  const failed = talkModel(run([{ type: 'start' }, { type: 'connectFailed', kind: 'token', message: 'x' }]), 'live');
  expect(failed).toMatchObject({ connection: 'problem', problem: 'token', status: '' });
  const answered: SessionEvent[] = [
    ...theyAsked,
    { type: 'outputTranscript', text: 'Where is the station?' },
    { type: 'outputAudio', pcm },
    { type: 'turnComplete' },
    { type: 'playbackStarted', utteranceId: 'u1' },
    { type: 'playbackFinished', utteranceId: 'u1' },
  ];
  const lost = talkModel(run([...answered, { type: 'connectionLost', kind: 'socket', message: 'x' }]), 'live');
  expect(lost).toMatchObject({ connection: 'reconnecting', status: 'Reconnecting', aside: 'The connection dropped. Picking up where you left off.' });
  expect(lost?.card?.translation).toBe('Where is the station?');
});

test('setup changes become configure events; a shared language is refused', () => {
  const s = run([]);
  expect(setupModel(s, 'system')).toMatchObject({ you: 'en', them: 'fr', handsFree: true, appearance: 'system' });
  expect(setupEvent(s, { them: 'es' })).toMatchObject({ type: 'configure', people: { other: { language: 'es' } } });
  expect(setupEvent(s, { you: 'fr-CA' })).toBeUndefined();
  expect(setupEvent(s, { appearance: 'dark' })).toBeUndefined();
  expect(setupEvent(s, { handsFree: false })).toMatchObject({ settings: { detection: 'manual' } });
  const noRecap = setupEvent(s, { recap: false });
  expect(noRecap?.type === 'configure' && noRecap.settings.behaviours.includes('recap')).toBe(false);
  expect(setupEvent(s, { voice: 'Kore' })).toMatchObject({ people: { owner: { voice: 'Kore' }, other: { voice: 'Kore' } } });
});

test('the pickers grey out the other side’s language, with why', () => {
  const pt: People = { owner: { language: 'pt-BR', voice: 'Charon' }, other: { language: 'fr', voice: 'Charon' } };
  const theirs = languageChoices(pt, 'other');
  expect(theirs.filter((c) => c.disabled).every((c) => c.value.startsWith('pt') && c.disabled === 'You speak this')).toBe(true);
  expect(theirs.some((c) => c.disabled)).toBe(true);
  expect(languageChoices(pt, 'owner').find((c) => c.value === 'fr')?.disabled).toBe('They speak this');
});

test('enrolment shows the sentence to read', () => {
  const e = enrolModel({ ...initialEnrolment, status: 'notEnrolled' }, 'en');
  expect(e).toMatchObject({ status: 'notEnrolled', index: 0, count: 3, enrolled: false });
  expect(e.sentence.length).toBeGreaterThan(0);
});

test('history rows and copy text', () => {
  const c: Conversation = {
    id: '1',
    endedAt: new Date(2026, 10, 22, 14, 2).getTime(),
    languages: { owner: 'en', other: 'fr' },
    lines: [
      { speaker: 'other', source: 'Bonjour', translation: 'Hello' },
      { speaker: 'owner', source: 'Thanks', translation: 'Merci', note: 'A note' },
    ],
    recap: { status: 'ready', text: { English: 'They greeted.', French: 'Ils se sont salués.' } },
  };
  const item = historyItem(c, new Date(2026, 10, 22, 18, 0).getTime());
  expect(item).toMatchObject({ title: 'French', when: 'Today, 14:02', line: 'Hello' });
  expect(item.bubbles[0]).toEqual({ who: 'them', source: 'Bonjour', translation: 'Hello' });
  expect(item.recap.texts[1]).toEqual({ language: 'French', code: 'fr', text: 'Ils se sont salués.' });
  expect(copyText(c)).toBe('Them: Bonjour\n  Hello\nYou: Thanks\n  Merci\n\nEnglish: They greeted.\nFrench: Ils se sont salués.');
});

test('when a conversation was', () => {
  const now = new Date(2026, 10, 22, 9, 0).getTime();
  expect(whenText(new Date(2026, 10, 21, 10, 47).getTime(), now)).toBe('Yesterday, 10:47');
  expect(whenText(new Date(2026, 10, 18, 21, 15).getTime(), now)).toBe('18 Nov, 21:15');
  expect(whenText(new Date(2025, 0, 3, 8, 5).getTime(), now)).toBe('3 Jan 2025, 08:05');
});
