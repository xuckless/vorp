/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { initialSession, transition, type Effect, type Participant, type Session, type SessionEvent } from './session';

const people: Participant[] = [
  { id: 'a', name: 'Alex', language: 'en', voice: 'Charon' },
  { id: 'b', name: 'Béa', language: 'fr', voice: 'Charon' },
];

const pcm = new Int16Array([1, 2, 3]);

function run(events: SessionEvent[], from: Session = initialSession(people)): [Session, Effect[][]] {
  const log: Effect[][] = [];
  const state = events.reduce((s, e) => {
    const [next, effects] = transition(s, e);
    log.push(effects);
    return next;
  }, from);
  return [state, log];
}

const types = (effects: Effect[]) => effects.map((e) => e.type);

describe('connection', () => {
  test('start connects with the participants', () => {
    const [s, log] = run([{ type: 'start' }]);
    expect(s.connection).toBe('connecting');
    expect(log[0]).toEqual([{ type: 'openAudio' }, { type: 'connect', participants: people }]);
  });

  test('connected opens; a second start does nothing', () => {
    const [s, log] = run([{ type: 'start' }, { type: 'connected' }, { type: 'start' }]);
    expect(s.connection).toBe('open');
    expect(log[2]).toEqual([]);
  });

  test('a failed connect records the error', () => {
    const [s] = run([{ type: 'start' }, { type: 'connectFailed', error: 'no token' }]);
    expect(s.connection).toBe('failed');
    expect(s.error).toBe('no token');
  });

  test('stop fails what is in flight and releases everything', () => {
    const [s, log] = run([
      { type: 'start' },
      { type: 'connected' },
      { type: 'pressTalk', speakerId: 'a' },
      { type: 'stop' },
    ]);
    expect(s.connection).toBe('idle');
    expect(s.utterances[0].status).toBe('failed');
    expect(types(log[3])).toEqual(['stopCapture', 'stopPlayback', 'disconnect', 'closeAudio']);
  });

  test('a lost connection reconnects and fails the turn in flight', () => {
    const [s, log] = run([
      { type: 'start' },
      { type: 'connected' },
      { type: 'pressTalk', speakerId: 'a' },
      { type: 'connectionLost', reason: 'goAway' },
    ]);
    expect(s.connection).toBe('reconnecting');
    expect(s.utterances[0].status).toBe('failed');
    expect(s.awaitingResponse).toEqual([]);
    expect(types(log[3])).toEqual(['stopCapture', 'connect']);
  });
});

describe('basic turn', () => {
  const open: SessionEvent[] = [{ type: 'start' }, { type: 'connected' }];

  test('press, speak, release, translate, play, done', () => {
    const [s, log] = run([
      ...open,
      { type: 'pressTalk', speakerId: 'a' },
      { type: 'inputTranscript', text: 'Hello ' },
      { type: 'releaseTalk', speakerId: 'a' },
      { type: 'inputTranscript', text: 'there' },
      { type: 'outputTranscript', text: 'Bonjour' },
      { type: 'outputAudio', pcm },
      { type: 'playbackStarted', utteranceId: 'u1' },
      { type: 'outputAudio', pcm },
      { type: 'turnComplete' },
      { type: 'playbackFinished', utteranceId: 'u1' },
    ]);
    expect(types(log[2])).toEqual(['beginTurn', 'startCapture']);
    expect(types(log[4])).toEqual(['stopCapture', 'endTurn']);
    expect(log[7]).toEqual([{ type: 'enqueuePlayback', utteranceId: 'u1', pcm }]);
    expect(log[10]).toEqual([{ type: 'finishPlayback', utteranceId: 'u1' }]);
    expect(s.utterances).toEqual([
      { id: 'u1', speakerId: 'a', status: 'done', source: 'Hello there', translation: 'Bonjour' },
    ]);
    expect(s.awaitingResponse).toEqual([]);
  });

  test('the lifecycle passes through every stage in order', () => {
    const steps: SessionEvent[] = [
      { type: 'pressTalk', speakerId: 'b' },
      { type: 'releaseTalk', speakerId: 'b' },
      { type: 'outputAudio', pcm },
      { type: 'playbackStarted', utteranceId: 'u1' },
      { type: 'turnComplete' },
      { type: 'playbackFinished', utteranceId: 'u1' },
    ];
    let [s] = run(open);
    const seen = steps.map((e) => {
      [s] = transition(s, e);
      return s.utterances[0].status;
    });
    expect(seen).toEqual(['capturing', 'translating', 'queued', 'speaking', 'speaking', 'done']);
  });

  test('talk is ignored until the connection is open', () => {
    const [s, log] = run([{ type: 'pressTalk', speakerId: 'a' }]);
    expect(s.utterances).toEqual([]);
    expect(log[0]).toEqual([]);
  });

  test('only one person captures at a time, and only they can release', () => {
    const [s] = run([
      ...open,
      { type: 'pressTalk', speakerId: 'a' },
      { type: 'pressTalk', speakerId: 'b' },
      { type: 'releaseTalk', speakerId: 'b' },
    ]);
    expect(s.utterances).toHaveLength(1);
    expect(s.utterances[0].status).toBe('capturing');
  });

  test('a turn with no audio and no text fails', () => {
    const [s] = run([
      ...open,
      { type: 'pressTalk', speakerId: 'a' },
      { type: 'releaseTalk', speakerId: 'a' },
      { type: 'turnComplete' },
    ]);
    expect(s.utterances[0].status).toBe('failed');
  });

  test('the next speaker can talk while the previous translation plays', () => {
    const [s] = run([
      ...open,
      { type: 'pressTalk', speakerId: 'a' },
      { type: 'releaseTalk', speakerId: 'a' },
      { type: 'outputAudio', pcm },
      { type: 'playbackStarted', utteranceId: 'u1' },
      { type: 'turnComplete' },
      { type: 'pressTalk', speakerId: 'b' },
    ]);
    expect(s.utterances.map((u) => u.status)).toEqual(['speaking', 'capturing']);
    expect(s.awaitingResponse).toEqual(['u2']);
  });

  test('a microphone failure fails the utterance and ends the turn', () => {
    const [s, log] = run([
      ...open,
      { type: 'pressTalk', speakerId: 'a' },
      { type: 'captureFailed', error: 'denied' },
    ]);
    expect(s.utterances[0]).toMatchObject({ status: 'failed', error: 'denied' });
    expect(types(log[3])).toEqual(['stopCapture', 'endTurn']);
  });
});
