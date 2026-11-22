/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import {
  initialSession,
  isEcho,
  micOpen,
  replying,
  playbackQueue,
  targetLanguages,
  transition,
  type Effect,
  type Participant,
  type Session,
  type SessionEvent,
  type SessionSettings,
} from './session';

const people: Participant[] = [
  { id: 'a', name: 'Alex', language: 'en', voice: 'Charon' },
  { id: 'b', name: 'Béa', language: 'fr', voice: 'Charon' },
];

const queue = { id: 'queue', speechDuringPlayback: 'queue', holdSeconds: 20 } as const;
const handsFree: SessionSettings = { detection: 'auto', overlap: queue, pauseMicWhileSpeaking: false, echoMatch: 0.6, tone: 'neutral', behaviours: [] };
const manual: SessionSettings = { ...handsFree, detection: 'manual' };

const pcm = new Int16Array([1, 2, 3]);

function run(events: SessionEvent[], from: Session = initialSession(people, manual)): [Session, Effect[][]] {
  const log: Effect[][] = [];
  const state = events.reduce((s, e) => {
    const [next, effects] = transition(s, e);
    log.push(effects);
    return next;
  }, from);
  return [state, log];
}

const types = (effects: Effect[]) => effects.map((e) => e.type);
const statuses = (s: Session) => s.utterances.map((u) => u.status);

const open: SessionEvent[] = [{ type: 'start' }, { type: 'connected' }];
const freshHandsFree = () => initialSession(people, handsFree);

/** One hands-free turn: speech, transcript in `lang`, end of speech. */
const said = (text: string, language: string): SessionEvent[] => [
  { type: 'speechStarted' },
  { type: 'inputTranscript', text, language },
  { type: 'speechEnded' },
];

describe('connection', () => {
  test('start connects with the participants and settings', () => {
    const [s, log] = run([{ type: 'start' }]);
    expect(s.connection).toBe('connecting');
    expect(log[0]).toEqual([{ type: 'openAudio' }, { type: 'connect', participants: people, settings: manual }]);
  });

  test('connected opens; a second start does nothing', () => {
    const [s, log] = run([...open, { type: 'start' }]);
    expect(s.connection).toBe('open');
    expect(log[2]).toEqual([]);
  });

  test('stop fails what is in flight and releases everything', () => {
    const [s, log] = run([...open, { type: 'pressTalk', speakerId: 'a' }, { type: 'stop' }]);
    expect(s.connection).toBe('idle');
    expect(s.utterances[0].status).toBe('failed');
    expect(s.held).toBeUndefined();
    expect(types(log[3])).toEqual(['stopCapture', 'stopPlayback', 'disconnect', 'closeAudio']);
  });

  test('a lost connection reconnects and fails the turn in flight', () => {
    const [s, log] = run([
      ...open,
      { type: 'pressTalk', speakerId: 'a' },
      { type: 'connectionLost', kind: 'socket', message: 'socket closed (1006)' },
    ]);
    expect(s.connection).toBe('reconnecting');
    expect(s.utterances[0].status).toBe('failed');
    expect(s.awaitingResponse).toEqual([]);
    expect(types(log[3])).toEqual(['stopCapture', 'connect']);
  });
});

describe('error paths', () => {
  test('microphone denied ends the conversation and says why', () => {
    const [s, log] = run([{ type: 'start' }, { type: 'audioFailed', kind: 'micDenied', message: 'Permission denied' }]);
    expect(s.connection).toBe('failed');
    expect(s.error).toEqual({ kind: 'micDenied', message: 'Permission denied' });
    expect(types(log[1])).toEqual(['stopPlayback', 'disconnect', 'closeAudio']);
  });

  test('a microphone failure mid-turn fails the utterance', () => {
    const [s, log] = run([...open, { type: 'pressTalk', speakerId: 'a' }, { type: 'audioFailed', kind: 'mic', message: 'gone' }]);
    expect(s.utterances[0]).toMatchObject({ status: 'failed', error: 'gone' });
    expect(types(log[3])).toEqual(['stopCapture', 'stopPlayback', 'disconnect', 'closeAudio']);
  });

  test('a token failure is a failed connect of kind token', () => {
    const [s] = run([{ type: 'start' }, { type: 'connectFailed', kind: 'token', message: 'token server answered 429' }]);
    expect(s.connection).toBe('failed');
    expect(s.error).toEqual({ kind: 'token', message: 'token server answered 429' });
  });

  test('a socket drop during setup is a failed connect; retry starts again', () => {
    const [s, log] = run([{ type: 'start' }, { type: 'connectFailed', kind: 'socket', message: 'closed' }, { type: 'start' }]);
    expect(s.connection).toBe('connecting');
    expect(s.error).toBeUndefined();
    expect(types(log[2])).toEqual(['openAudio', 'connect']);
  });

  test('the session time limit reconnects, keeps queued audio playing, then resumes listening', () => {
    const [s, log] = run(
      [
        ...open,
        ...said('Hello there', 'en'),
        { type: 'outputAudio', pcm },
        { type: 'connectionLost', kind: 'timeLimit', message: 'goAway' },
        { type: 'connected' },
      ],
      freshHandsFree(),
    );
    expect(types(log[6])).toEqual(['stopCapture', 'finishPlayback', 'connect', 'releaseAudio']);
    expect(types(log[7])).toEqual(['startCapture']);
    expect(statuses(s)).toEqual(['queued']);
    expect(s.connection).toBe('open');
  });

  test('a failed reconnect ends in failed with the error kind', () => {
    const [s] = run([
      ...open,
      { type: 'connectionLost', kind: 'socket', message: 'drop' },
      { type: 'connectFailed', kind: 'token', message: 'expired' },
    ]);
    expect(s.connection).toBe('failed');
    expect(s.error?.kind).toBe('token');
  });

  test('a failed reconnect releases the microphone and keeps what was heard', () => {
    const [s, log] = run(
      [
        ...open,
        ...said('Hello there', 'en'),
        { type: 'outputTranscript', text: 'Bonjour' },
        { type: 'outputAudio', pcm },
        { type: 'connectionLost', kind: 'socket', message: 'drop' },
        { type: 'connectFailed', kind: 'token', message: 'expired' },
      ],
      freshHandsFree(),
    );
    expect(types(log[8])).toEqual(['stopPlayback', 'disconnect', 'closeAudio', 'archive']);
    expect(log[8].find((e) => e.type === 'archive')).toMatchObject({ utterances: [{ source: 'Hello there' }] });
    expect(statuses(s)).toEqual(['failed']);
  });

  test('a microphone failure keeps what was heard', () => {
    const [, log] = run([...open, ...said('Hello there', 'en'), { type: 'audioFailed', kind: 'mic', message: 'gone' }], freshHandsFree());
    expect(types(log[5])).toContain('archive');
  });

  test('a failed conversation is kept once: stop after it archives nothing, start begins anew', () => {
    const [s, log] = run(
      [...open, ...said('Hello there', 'en'), { type: 'audioFailed', kind: 'mic', message: 'gone' }, { type: 'stop' }, { type: 'start' }],
      freshHandsFree(),
    );
    expect(log[6]).toEqual([]);
    expect(s.utterances).toEqual([]);
  });
});

describe('push-to-talk (manual detection)', () => {
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
    expect(types(log[1])).toEqual([]); // manual: the microphone waits for a button
    expect(types(log[2])).toEqual(['beginTurn', 'startCapture']);
    expect(types(log[4])).toEqual(['stopCapture', 'endTurn']);
    expect(log[7]).toEqual([{ type: 'enqueuePlayback', utteranceId: 'u1', pcm }]);
    expect(log[10]).toEqual([{ type: 'finishPlayback', utteranceId: 'u1' }]);
    expect(s.utterances).toEqual([
      { id: 'u1', speakerId: 'a', routedBy: 'button', status: 'done', source: 'Hello there', translation: 'Bonjour' },
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

  test('only one person holds at a time, and only they can release', () => {
    const [s] = run([
      ...open,
      { type: 'pressTalk', speakerId: 'a' },
      { type: 'pressTalk', speakerId: 'b' },
      { type: 'releaseTalk', speakerId: 'b' },
    ]);
    expect(s.utterances).toHaveLength(1);
    expect(s.utterances[0].status).toBe('capturing');
    expect(s.held).toBe('a');
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

  test('hands-free signals are ignored in manual mode', () => {
    const [s] = run([...open, { type: 'speechStarted' }, { type: 'inputTranscript', text: 'hi', language: 'en' }]);
    expect(s.utterances).toEqual([]);
  });

  test('an input transcript goes to the new turn, not the one still being answered (phase 1 gap)', () => {
    const [s] = run([
      ...open,
      { type: 'pressTalk', speakerId: 'a' },
      { type: 'inputTranscript', text: 'Good morning' },
      { type: 'releaseTalk', speakerId: 'a' },
      { type: 'pressTalk', speakerId: 'b' },
      { type: 'inputTranscript', text: 'Bonjour' },
      { type: 'outputTranscript', text: 'Bonjour' },
    ]);
    expect(s.utterances.map((u) => [u.source, u.translation])).toEqual([
      ['Good morning', 'Bonjour'],
      ['Bonjour', ''],
    ]);
  });
});

describe('hands-free (automatic detection)', () => {
  test('the microphone streams as soon as the connection opens', () => {
    const [s, log] = run(open, freshHandsFree());
    expect(types(log[1])).toEqual(['startCapture']);
    expect(micOpen(s)).toBe(true);
  });

  test('detected speech opens an utterance and the detected language picks the speaker', () => {
    const [s, log] = run([...open, ...said('Bonjour à tous', 'fr-FR')], freshHandsFree());
    // No turn signals: the server ends the turn. The model then replies and does not listen, so audio is held.
    expect(log.slice(2).flat()).toEqual([{ type: 'holdAudio', maxSeconds: 20 }]);
    expect(s.utterances[0]).toMatchObject({ speakerId: 'b', routedBy: 'language', language: 'fr-FR', status: 'translating' });
    expect(targetLanguages(s, s.utterances[0])).toEqual(['en']);
  });

  test('a transcript without a speech-start signal still opens an utterance', () => {
    const [s] = run([...open, { type: 'inputTranscript', text: 'Hello', language: 'en', finished: true }], freshHandsFree());
    expect(s.utterances[0]).toMatchObject({ speakerId: 'a', status: 'translating', source: 'Hello' });
  });

  test("the interpreter's own language report names the speaker of the utterance being answered", () => {
    const [s] = run(
      [
        ...open,
        { type: 'speechStarted' },
        { type: 'inputTranscript', text: 'Merci beaucoup' },
        { type: 'speechEnded' },
        { type: 'sourceLanguage', language: 'fr' },
      ],
      freshHandsFree(),
    );
    expect(s.utterances).toHaveLength(1);
    expect(s.utterances[0]).toMatchObject({ speakerId: 'b', language: 'fr', status: 'translating' });
  });

  test('a language report does not override a held button', () => {
    const [s] = run(
      [...open, { type: 'pressTalk', speakerId: 'a' }, { type: 'inputTranscript', text: 'Bonjour' }, { type: 'sourceLanguage', language: 'fr' }],
      freshHandsFree(),
    );
    expect(s.utterances[0]).toMatchObject({ speakerId: 'a', routedBy: 'button' });
  });

  test('without an input language, the output language names the speaker (two people)', () => {
    const [s] = run(
      [...open, { type: 'speechStarted' }, { type: 'inputTranscript', text: 'Hello' }, { type: 'outputTranscript', text: 'Bonjour', language: 'fr' }],
      freshHandsFree(),
    );
    expect(s.utterances[0]).toMatchObject({ speakerId: 'a', status: 'translating' });
  });

  test('model output for a turn still capturing ends that turn', () => {
    const [s] = run([...open, { type: 'speechStarted' }, { type: 'inputTranscript', text: 'Hi', language: 'en' }, { type: 'outputAudio', pcm }], freshHandsFree());
    expect(statuses(s)).toEqual(['queued']);
  });

  test('speech during playback is captured and does not cut off the translation', () => {
    const [s, log] = run(
      [
        ...open,
        ...said('How are you', 'en'),
        { type: 'outputAudio', pcm },
        { type: 'playbackStarted', utteranceId: 'u1' },
        ...said('Très bien merci', 'fr'),
      ],
      freshHandsFree(),
    );
    expect(statuses(s)).toEqual(['speaking', 'translating']);
    expect(s.utterances[1].speakerId).toBe('b');
    expect(log.flat().some((e) => e.type === 'stopPlayback' || e.type === 'stopCapture')).toBe(false);
    expect(micOpen(s)).toBe(true);
  });

  test('three utterances in flight speak in order while the third is still captured', () => {
    const [s, log] = run(
      [
        ...open,
        ...said('One', 'en'),
        { type: 'outputAudio', pcm }, // u1 reply
        { type: 'playbackStarted', utteranceId: 'u1' },
        ...said('Deux', 'fr'),
        { type: 'speechStarted' }, // u3 starts while u1 speaks and u2 waits
        { type: 'inputTranscript', text: 'Three', language: 'en' },
        { type: 'turnComplete' }, // u1 reply done
        { type: 'outputAudio', pcm }, // u2 reply
      ],
      freshHandsFree(),
    );
    expect(statuses(s)).toEqual(['speaking', 'queued', 'capturing']);
    expect(playbackQueue(s).map((u) => u.id)).toEqual(['u1', 'u2']);
    expect(s.awaitingResponse).toEqual(['u2', 'u3']);
    const enqueued = log.flat().flatMap((e) => (e.type === 'enqueuePlayback' ? [e.utteranceId] : []));
    expect(enqueued).toEqual(['u1', 'u2']);
    expect(s.utterances[2].source).toBe('Three');

    const [after] = run(
      [
        { type: 'playbackFinished', utteranceId: 'u1' },
        { type: 'playbackStarted', utteranceId: 'u2' },
        { type: 'speechEnded' },
        { type: 'turnComplete' },
        { type: 'outputAudio', pcm },
      ],
      s,
    );
    expect(statuses(after)).toEqual(['done', 'speaking', 'queued']);
  });

  test('a failure mid-queue leaves the translations before and after it intact', () => {
    const [s, log] = run(
      [
        ...open,
        ...said('One', 'en'),
        { type: 'outputAudio', pcm },
        { type: 'playbackStarted', utteranceId: 'u1' },
        ...said('Deux', 'fr'),
        ...said('Three', 'en'),
        { type: 'turnComplete' }, // u1 done generating
        { type: 'turnComplete' }, // u2: the model stayed silent
        { type: 'outputAudio', pcm }, // u3 reply
        { type: 'turnComplete' },
        { type: 'playbackFinished', utteranceId: 'u1' },
        { type: 'playbackStarted', utteranceId: 'u3' },
        { type: 'playbackFinished', utteranceId: 'u3' },
      ],
      freshHandsFree(),
    );
    expect(statuses(s)).toEqual(['done', 'failed', 'done']);
    expect(s.utterances[1].error).toBe('no translation');
    expect(log.flat().filter((e) => e.type === 'finishPlayback').map((e) => (e as { utteranceId: string }).utteranceId)).toEqual(['u1', 'u3']);
  });

  test('turnComplete for a hands-free turn that is still capturing fails it (noise, no reply)', () => {
    const [s] = run([...open, { type: 'speechStarted' }, { type: 'turnComplete' }], freshHandsFree());
    expect(s.utterances[0]).toMatchObject({ status: 'failed', error: 'no translation' });
    expect(s.awaitingResponse).toEqual([]);
  });

  test('an interruption keeps the audio already queued and is noted', () => {
    const [s, log] = run(
      [...open, ...said('Hello', 'en'), { type: 'outputAudio', pcm }, { type: 'interrupted' }, { type: 'turnComplete' }],
      freshHandsFree(),
    );
    expect(s.utterances[0]).toMatchObject({ status: 'queued', error: 'interrupted' });
    expect(types(log[log.length - 1])).toEqual(['finishPlayback', 'releaseAudio']);
  });
});

describe('audio hold while the model replies', () => {
  test('held from the end of a turn until its reply completes, then released', () => {
    const [s, log] = run([...open, ...said('Hello', 'en'), { type: 'outputAudio', pcm }, { type: 'turnComplete' }], freshHandsFree());
    expect(types(log.flat())).toEqual(['openAudio', 'connect', 'startCapture', 'holdAudio', 'enqueuePlayback', 'finishPlayback', 'releaseAudio']);
    expect(replying(s)).toBe(false);
    expect(micOpen(s)).toBe(true); // the microphone never closed
  });

  test('speech sent after the release becomes the next utterance, spoken after the first', () => {
    const [s] = run(
      [...open, ...said('Hello', 'en'), { type: 'outputAudio', pcm }, { type: 'turnComplete' }, ...said('Bonjour', 'fr'), { type: 'outputAudio', pcm }],
      freshHandsFree(),
    );
    expect(statuses(s)).toEqual(['queued', 'queued']);
    expect(s.utterances.map((u) => u.speakerId)).toEqual(['a', 'b']);
  });
});

describe('push-to-talk overrides detection', () => {
  test('a held button names the speaker whatever language is detected', () => {
    const [s, log] = run(
      [
        ...open,
        { type: 'pressTalk', speakerId: 'b' },
        { type: 'speechStarted' },
        { type: 'inputTranscript', text: 'OK', language: 'en' },
        { type: 'speechEnded' },
        { type: 'releaseTalk', speakerId: 'b' },
      ],
      freshHandsFree(),
    );
    expect(s.utterances).toHaveLength(1);
    expect(s.utterances[0]).toMatchObject({ speakerId: 'b', routedBy: 'button', status: 'translating' });
    expect(types(log[2])).toEqual(['beginTurn']); // the microphone is already open
    expect(types(log[6])).toEqual(['endTurn', 'holdAudio']);
    expect(s.held).toBeUndefined();
  });

  test('pressing during hands-free speech takes the utterance over', () => {
    const [s] = run(
      [...open, { type: 'speechStarted' }, { type: 'inputTranscript', text: 'Hello', language: 'fr' }, { type: 'pressTalk', speakerId: 'a' }],
      freshHandsFree(),
    );
    expect(s.utterances[0]).toMatchObject({ speakerId: 'a', routedBy: 'button', status: 'capturing' });
  });

  test('a long pause while held: the server answers early, the hold keeps its speaker', () => {
    const [s] = run(
      [
        ...open,
        { type: 'pressTalk', speakerId: 'a' },
        { type: 'inputTranscript', text: 'First part' },
        { type: 'outputAudio', pcm },
        { type: 'turnComplete' },
        { type: 'speechStarted' },
        { type: 'inputTranscript', text: 'second part', language: 'fr' },
        { type: 'releaseTalk', speakerId: 'a' },
      ],
      freshHandsFree(),
    );
    expect(s.utterances.map((u) => [u.speakerId, u.status])).toEqual([
      ['a', 'queued'],
      ['a', 'translating'],
    ]);
  });
});

describe('echo guard', () => {
  const speaking: SessionEvent[] = [
    ...open,
    ...said('Good morning everyone', 'en'),
    { type: 'outputTranscript', text: 'Bonjour à tous, comment allez-vous ?' },
    { type: 'outputAudio', pcm },
    { type: 'playbackStarted', utteranceId: 'u1' },
  ];

  test('a capture that repeats what Vorp is speaking is dropped, and so is the reply to it', () => {
    const [s, log] = run(
      [...speaking, ...said('bonjour a tous comment allez vous', 'fr'), { type: 'turnComplete' }, { type: 'outputAudio', pcm }, { type: 'turnComplete' }],
      freshHandsFree(),
    );
    expect(s.utterances[1]).toMatchObject({ status: 'failed', error: 'echo' });
    const enqueued = log.flat().flatMap((e) => (e.type === 'enqueuePlayback' ? [e.utteranceId] : []));
    expect(enqueued).toEqual(['u1']);
    expect(s.awaitingResponse).toEqual([]);
  });

  test('an echo that arrives after its translation finished playing is still dropped', () => {
    const [s] = run(
      [
        ...speaking,
        { type: 'turnComplete' },
        { type: 'playbackFinished', utteranceId: 'u1' },
        ...said('bonjour a tous comment allez vous', 'fr'),
      ],
      freshHandsFree(),
    );
    expect(s.utterances[0].status).toBe('done');
    expect(s.utterances[1]).toMatchObject({ status: 'failed', error: 'echo' });
  });

  test('only the latest finished translations count as echo sources', () => {
    const turn = (n: number, text: string): SessionEvent[] => [
      ...said(`line ${n} here`, 'en'),
      { type: 'outputTranscript', text },
      { type: 'outputAudio', pcm },
      { type: 'turnComplete' },
      { type: 'playbackFinished', utteranceId: `u${n}` },
    ];
    const [s] = run(
      [...open, ...turn(1, 'Bonjour à tous'), ...turn(2, 'Il fait beau'), ...turn(3, 'Merci bien'), ...said('bonjour a tous', 'fr')],
      freshHandsFree(),
    );
    expect(s.utterances[3].status).toBe('translating');
  });

  test('real speech during playback is kept', () => {
    const [s] = run([...speaking, ...said('Très bien, et toi ?', 'fr')], freshHandsFree());
    expect(s.utterances[1].status).toBe('translating');
  });

  test('a held button is never treated as echo', () => {
    const [s] = run(
      [...speaking, { type: 'pressTalk', speakerId: 'b' }, { type: 'inputTranscript', text: 'bonjour à tous comment allez-vous' }],
      freshHandsFree(),
    );
    expect(s.utterances[1].status).toBe('capturing');
  });

  test('isEcho needs at least two words and the threshold share', () => {
    expect(isEcho('Bonjour', 'Bonjour à tous', 0.6)).toBe(false);
    expect(isEcho('Bonjour à TOUS!', 'bonjour a tous', 0.6)).toBe(true);
    expect(isEcho('see you tomorrow', 'bonjour à tous', 0.6)).toBe(false);
  });
});

describe('pauseMicWhileSpeaking', () => {
  const paused = () => initialSession(people, { ...handsFree, pauseMicWhileSpeaking: true });

  test('the microphone stops while Vorp speaks and resumes after', () => {
    const [s, log] = run(
      [
        ...open,
        ...said('Hello', 'en'),
        { type: 'outputAudio', pcm },
        { type: 'playbackStarted', utteranceId: 'u1' },
        { type: 'turnComplete' },
        { type: 'playbackFinished', utteranceId: 'u1' },
      ],
      paused(),
    );
    expect(types(log[6])).toEqual(['stopCapture', 'endTurn']);
    expect(types(log[8])).toEqual(['startCapture']);
    expect(micOpen(s)).toBe(true);
  });

  test('a held button still listens while Vorp speaks', () => {
    const [s] = run(
      [...open, ...said('Hello', 'en'), { type: 'outputAudio', pcm }, { type: 'playbackStarted', utteranceId: 'u1' }, { type: 'pressTalk', speakerId: 'b' }],
      paused(),
    );
    expect(micOpen(s)).toBe(true);
  });

  test('off by default in these settings: the microphone stays open while speaking', () => {
    const [s] = run([...open, ...said('Hello', 'en'), { type: 'outputAudio', pcm }, { type: 'playbackStarted', utteranceId: 'u1' }], freshHandsFree());
    expect(micOpen(s)).toBe(true);
  });
});

test('the setup changes between sessions, not during one', () => {
  const spanish = people.map((p, i) => (i === 1 ? { ...p, language: 'es' } : p));
  const [idle] = transition(freshHandsFree(), { type: 'configure', participants: spanish, settings: manual });
  expect(idle.participants[1].language).toBe('es');
  expect(idle.settings.detection).toBe('manual');
  const [connecting] = transition(freshHandsFree(), { type: 'start' });
  const [same] = transition(connecting, { type: 'configure', participants: spanish, settings: manual });
  expect(same.participants).toBe(connecting.participants);
});

test('a note lands on the utterance being answered', () => {
  const [s] = run(
    [{ type: 'start' }, { type: 'connected' }, { type: 'speechStarted' }, { type: 'inputTranscript', text: 'A piece of cake' }, { type: 'speechEnded' }, { type: 'note', text: 'Idiom: very easy' }],
    freshHandsFree(),
  );
  expect(s.utterances[0].note).toBe('Idiom: very easy');
});
