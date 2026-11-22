/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { initialSession, transition, type People, type Session, type SessionEvent, type SessionSettings } from '@/core/session';

import { captions, spotlight, stageOf } from './stage';

const people: People = {
  owner: { language: 'en', voice: 'Charon' },
  other: { language: 'fr', voice: 'Charon' },
};
const settings: SessionSettings = {
  detection: 'auto',
  overlap: { id: 'queue', speechDuringPlayback: 'queue', holdSeconds: 20 },
  pauseMicWhileSpeaking: false,
  echoMatch: 0.6,
  tone: 'neutral',
  behaviours: [],
  autoDetect: true,
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
  // The other person (right) spoke French, so the interpreter speaks English and leans left, to the owner.
  expect(stageOf(run(spoken))).toMatchObject({ phase: 'speaking', direction: -1, language: 'en' });
});

test("speaking to the other person names the language they last used", () => {
  const events: SessionEvent[] = [
    ...open,
    { type: 'speechStarted' },
    { type: 'inputTranscript', text: 'नमस्ते' },
    { type: 'speechEnded' },
    { type: 'sourceLanguage', language: 'hi' },
    { type: 'outputAudio', pcm },
    { type: 'turnComplete' },
    { type: 'playbackFinished', utteranceId: 'u1' },
    { type: 'speechStarted' },
    { type: 'inputTranscript', text: 'Hello' },
    { type: 'speechEnded' },
    { type: 'sourceLanguage', language: 'en' },
    { type: 'outputAudio', pcm },
    { type: 'playbackStarted', utteranceId: 'u2' },
  ];
  expect(stageOf(run(events))).toMatchObject({ phase: 'speaking', direction: 1, language: 'hi' });
});

test('captions leave out what was never heard', () => {
  const s = run([...open, { type: 'speechStarted' }]);
  expect(captions(s)).toEqual([]);
  expect(captions(run([...open, { type: 'speechStarted' }, { type: 'inputTranscript', text: 'Hi' }]))).toHaveLength(1);
});

test('a placeholder answer to noise or echo is not a caption, in either form seen live', () => {
  for (const placeholder of ['<no speech detected>', '<no speech>{pause}']) {
    const s = run([...open, { type: 'speechStarted' }, { type: 'inputTranscript', text: 'die' }, { type: 'speechEnded' }, { type: 'outputTranscript', text: placeholder }]);
    expect(captions(s)).toEqual([]);
    expect(spotlight(s).card).toBeUndefined();
  }
});

test('the spotlight is the line being spoken, with the next ones waiting behind it', () => {
  const first: SessionEvent[] = [...open, { type: 'speechStarted' }, { type: 'inputTranscript', text: 'One' }, { type: 'speechEnded' }, { type: 'outputAudio', pcm }, { type: 'playbackStarted', utteranceId: 'u1' }];
  const s = run([...first, { type: 'speechStarted' }, { type: 'inputTranscript', text: 'Two' }]);
  const shown = spotlight(s);
  expect(shown.card?.source).toBe('One');
  expect(shown.waiting.map((u) => u.source)).toEqual(['Two']);
});
