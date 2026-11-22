/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { initialSession, transition, type Participant, type Session, type SessionEvent, type SessionSettings } from '@/core/session';

import { captions, stageOf } from './stage';

const people: Participant[] = [
  { id: 'a', name: 'Alex', language: 'en', voice: 'Charon' },
  { id: 'b', name: 'Béa', language: 'fr', voice: 'Charon' },
];
const settings: SessionSettings = {
  detection: 'auto',
  overlap: { id: 'queue', speechDuringPlayback: 'queue', holdSeconds: 20 },
  pauseMicWhileSpeaking: false,
  echoMatch: 0.6,
};
const run = (events: SessionEvent[]): Session => events.reduce((s, e) => transition(s, e)[0], initialSession(people, settings));
const open: SessionEvent[] = [{ type: 'start' }, { type: 'connected' }];
const pcm = new Int16Array([1, 2, 3]);

test('the stage follows the conversation', () => {
  expect(stageOf(run([])).phase).toBe('off');
  expect(stageOf(run([{ type: 'start' }])).phase).toBe('connecting');
  expect(stageOf(run(open)).phase).toBe('listening');

  const heard: SessionEvent[] = [...open, { type: 'speechStarted' }];
  expect(stageOf(run(heard)).phase).toBe('hearing');

  const sent: SessionEvent[] = [...heard, { type: 'inputTranscript', text: 'Bonjour' }, { type: 'speechEnded' }, { type: 'sourceLanguage', language: 'fr' }];
  expect(stageOf(run(sent)).phase).toBe('translating');

  const spoken: SessionEvent[] = [...sent, { type: 'outputAudio', pcm }, { type: 'playbackStarted', utteranceId: 'u1' }];
  // Béa (right) spoke French, so the interpreter speaks English and leans left, to Alex.
  expect(stageOf(run(spoken))).toMatchObject({ phase: 'speaking', direction: -1, language: 'en' });
});

test('captions leave out what was never heard', () => {
  const s = run([...open, { type: 'speechStarted' }]);
  expect(captions(s)).toEqual([]);
  expect(captions(run([...open, { type: 'speechStarted' }, { type: 'inputTranscript', text: 'Hi' }]))).toHaveLength(1);
});
