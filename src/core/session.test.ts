/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import {
  initialSession,
  isEcho,
  isPlaceholder,
  micOpen,
  replying,
  playbackQueue,
  targetLanguage,
  theirLanguage,
  transition,
  validPeople,
  wasHeard,
  type Effect,
  type People,
  type Session,
  type SessionEvent,
  type SessionSettings,
} from './session';

const people: People = {
  owner: { language: 'en', voice: 'Charon' },
  other: { language: 'fr', voice: 'Charon' },
};

const queue = { id: 'queue', speechDuringPlayback: 'queue', holdSeconds: 20 } as const;
const handsFree: SessionSettings = { detection: 'auto', overlap: queue, pauseMicWhileSpeaking: false, echoMatch: 0.6, tone: 'neutral', behaviours: [], autoDetect: true };
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
    expect(log[0]).toEqual([{ type: 'openAudio' }, { type: 'connect', people, settings: manual }]);
  });

  test('connected opens; a second start does nothing', () => {
    const [s, log] = run([...open, { type: 'start' }]);
    expect(s.connection).toBe('open');
    expect(log[2]).toEqual([]);
  });

  test('stop fails what is in flight and releases everything', () => {
    const [s, log] = run([...open, { type: 'pressTalk', speaker: 'owner' }, { type: 'stop' }]);
    expect(s.connection).toBe('idle');
    expect(s.utterances[0].status).toBe('failed');
    expect(s.held).toBeUndefined();
    expect(types(log[3])).toEqual(['stopCapture', 'stopPlayback', 'disconnect', 'closeAudio']);
  });

  test('a lost connection reconnects and fails the turn in flight', () => {
    const [s, log] = run([
      ...open,
      { type: 'pressTalk', speaker: 'owner' },
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
    const [s, log] = run([...open, { type: 'pressTalk', speaker: 'owner' }, { type: 'audioFailed', kind: 'mic', message: 'gone' }]);
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
      { type: 'pressTalk', speaker: 'owner' },
      { type: 'inputTranscript', text: 'Hello ' },
      { type: 'releaseTalk', speaker: 'owner' },
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
    expect(types(log[4])).toEqual(['stopCapture', 'endTurn', 'recogniseVoice']);
    expect(log[7]).toEqual([{ type: 'enqueuePlayback', utteranceId: 'u1', pcm }]);
    expect(log[10]).toEqual([{ type: 'finishPlayback', utteranceId: 'u1' }]);
    expect(s.utterances).toEqual([
      { id: 'u1', speaker: 'owner', routedBy: 'button', status: 'done', source: 'Hello there', translation: 'Bonjour' },
    ]);
    expect(s.awaitingResponse).toEqual([]);
  });

  test('the lifecycle passes through every stage in order', () => {
    const steps: SessionEvent[] = [
      { type: 'pressTalk', speaker: 'owner' },
      { type: 'releaseTalk', speaker: 'owner' },
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
    const [s, log] = run([{ type: 'pressTalk', speaker: 'owner' }]);
    expect(s.utterances).toEqual([]);
    expect(log[0]).toEqual([]);
  });

  test('only one person holds at a time, and only they can release', () => {
    const [s] = run([
      ...open,
      { type: 'pressTalk', speaker: 'owner' },
      { type: 'pressTalk', speaker: 'other' },
      { type: 'releaseTalk', speaker: 'other' },
    ]);
    expect(s.utterances).toHaveLength(1);
    expect(s.utterances[0].status).toBe('capturing');
    expect(s.held).toBe('owner');
  });

  test('a turn with no audio and no text fails', () => {
    const [s] = run([
      ...open,
      { type: 'pressTalk', speaker: 'owner' },
      { type: 'releaseTalk', speaker: 'owner' },
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
      { type: 'pressTalk', speaker: 'owner' },
      { type: 'inputTranscript', text: 'Good morning' },
      { type: 'releaseTalk', speaker: 'owner' },
      { type: 'pressTalk', speaker: 'owner' },
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
    expect(log.slice(2).flat()).toEqual([
      { type: 'holdAudio', maxSeconds: 20 },
      { type: 'recogniseVoice', utteranceId: 'u1' },
    ]);
    expect(s.utterances[0]).toMatchObject({ speaker: 'other', routedBy: 'language', language: 'fr-FR', status: 'translating' });
    expect(targetLanguage(s, s.utterances[0])).toBe('en');
  });

  test('a transcript without a speech-start signal still opens an utterance', () => {
    const [s] = run([...open, { type: 'inputTranscript', text: 'Hello', language: 'en', finished: true }], freshHandsFree());
    expect(s.utterances[0]).toMatchObject({ speaker: 'owner', status: 'translating', source: 'Hello' });
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
    expect(s.utterances[0]).toMatchObject({ speaker: 'other', language: 'fr', status: 'translating' });
  });

  test('a language report does not override a held button', () => {
    const [s] = run(
      [...open, { type: 'pressTalk', speaker: 'owner' }, { type: 'inputTranscript', text: 'Bonjour' }, { type: 'sourceLanguage', language: 'fr' }],
      freshHandsFree(),
    );
    expect(s.utterances[0]).toMatchObject({ speaker: 'owner', routedBy: 'button' });
  });

  test('without an input language, the output language names the speaker (two people)', () => {
    const [s] = run(
      [...open, { type: 'speechStarted' }, { type: 'inputTranscript', text: 'Hello' }, { type: 'outputTranscript', text: 'Bonjour', language: 'fr' }],
      freshHandsFree(),
    );
    expect(s.utterances[0]).toMatchObject({ speaker: 'owner', status: 'translating' });
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
    expect(s.utterances[1].speaker).toBe('other');
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
    expect(types(log.flat())).toEqual(['openAudio', 'connect', 'startCapture', 'holdAudio', 'recogniseVoice', 'enqueuePlayback', 'finishPlayback', 'releaseAudio']);
    expect(replying(s)).toBe(false);
    expect(micOpen(s)).toBe(true); // the microphone never closed
  });

  test('speech sent after the release becomes the next utterance, spoken after the first', () => {
    const [s] = run(
      [...open, ...said('Hello', 'en'), { type: 'outputAudio', pcm }, { type: 'turnComplete' }, ...said('Bonjour', 'fr'), { type: 'outputAudio', pcm }],
      freshHandsFree(),
    );
    expect(statuses(s)).toEqual(['queued', 'queued']);
    expect(s.utterances.map((u) => u.speaker)).toEqual(['owner', 'other']);
  });
});

describe('push-to-talk overrides detection', () => {
  test('a held button names the speaker whatever language is detected', () => {
    const [s, log] = run(
      [
        ...open,
        { type: 'pressTalk', speaker: 'owner' },
        { type: 'speechStarted' },
        { type: 'inputTranscript', text: 'OK', language: 'fr' },
        { type: 'speechEnded' },
        { type: 'releaseTalk', speaker: 'owner' },
      ],
      freshHandsFree(),
    );
    expect(s.utterances).toHaveLength(1);
    expect(s.utterances[0]).toMatchObject({ speaker: 'owner', routedBy: 'button', status: 'translating' });
    expect(types(log[2])).toEqual(['beginTurn']); // the microphone is already open
    expect(types(log[6])).toEqual(['endTurn', 'holdAudio', 'recogniseVoice']);
    expect(s.held).toBeUndefined();
  });

  test('pressing during hands-free speech takes the utterance over', () => {
    const [s] = run(
      [...open, { type: 'speechStarted' }, { type: 'inputTranscript', text: 'Hello', language: 'fr' }, { type: 'pressTalk', speaker: 'owner' }],
      freshHandsFree(),
    );
    expect(s.utterances[0]).toMatchObject({ speaker: 'owner', routedBy: 'button', status: 'capturing' });
  });

  test('a long pause while held: the server answers early, the hold keeps its speaker', () => {
    const [s] = run(
      [
        ...open,
        { type: 'pressTalk', speaker: 'owner' },
        { type: 'inputTranscript', text: 'First part' },
        { type: 'outputAudio', pcm },
        { type: 'turnComplete' },
        { type: 'speechStarted' },
        { type: 'inputTranscript', text: 'second part', language: 'fr' },
        { type: 'releaseTalk', speaker: 'owner' },
      ],
      freshHandsFree(),
    );
    expect(s.utterances.map((u) => [u.speaker, u.status])).toEqual([
      ['owner', 'queued'],
      ['owner', 'translating'],
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

  test('a dropped echo is left out of the archived conversation', () => {
    const [, log] = run([...speaking, ...said('bonjour a tous comment allez vous', 'fr'), { type: 'stop' }], freshHandsFree());
    const archived = log.flat().find((e) => e.type === 'archive');
    expect(archived).toMatchObject({ utterances: [{ id: 'u1' }] });
    expect(archived?.type === 'archive' && archived.utterances).toHaveLength(1);
  });

  test('real speech during playback is kept', () => {
    const [s] = run([...speaking, ...said('Très bien, et toi ?', 'fr')], freshHandsFree());
    expect(s.utterances[1].status).toBe('translating');
  });

  test('a held button is never treated as echo', () => {
    const [s] = run(
      [...speaking, { type: 'pressTalk', speaker: 'owner' }, { type: 'inputTranscript', text: 'bonjour à tous comment allez-vous' }],
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
      [...open, ...said('Hello', 'en'), { type: 'outputAudio', pcm }, { type: 'playbackStarted', utteranceId: 'u1' }, { type: 'pressTalk', speaker: 'owner' }],
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
  const spanish: People = { ...people, other: { ...people.other, language: 'es' } };
  const [idle] = transition(freshHandsFree(), { type: 'configure', people: spanish, settings: manual });
  expect(idle.people.other.language).toBe('es');
  expect(idle.settings.detection).toBe('manual');
  const [connecting] = transition(freshHandsFree(), { type: 'start' });
  const [same] = transition(connecting, { type: 'configure', people: spanish, settings: manual });
  expect(same.people).toBe(connecting.people);
});

describe('one owner, any other language', () => {
  /** A hands-free turn the interpreter reports the language of, as gemini-3.8-live does. */
  const reported = (text: string, language: string, translation: string): SessionEvent[] => [
    { type: 'speechStarted' },
    { type: 'inputTranscript', text },
    { type: 'speechEnded' },
    { type: 'sourceLanguage', language },
    { type: 'outputTranscript', text: translation },
    { type: 'outputAudio', pcm },
    { type: 'turnComplete' },
  ];

  test('speech in a language nobody picked is the other person, translated into the owner language', () => {
    const [s] = run([...open, ...reported('नमस्ते, आप कैसे हैं?', 'hi', 'Hello, how are you?')], freshHandsFree());
    expect(s.utterances[0]).toMatchObject({ speaker: 'other', language: 'hi', routedBy: 'language' });
    expect(targetLanguage(s, s.utterances[0])).toBe('en');
  });

  test('speech in the owner language is the owner', () => {
    const [s] = run([...open, ...reported('Good morning', 'en-GB', 'Bonjour')], freshHandsFree());
    expect(s.utterances[0].speaker).toBe('owner');
    expect(s.otherLanguage).toBeUndefined();
  });

  test('with auto-detect the owner is spoken to them in the language they last used', () => {
    const before = run([...open, ...reported('Good morning', 'en', 'Bonjour')], freshHandsFree())[0];
    expect(theirLanguage(before)).toBe('fr');
    expect(targetLanguage(before, before.utterances[0])).toBe('fr');

    const [s] = run([...reported('नमस्ते', 'hi', 'Hello'), ...reported('Nice to meet you', 'en', 'आपसे मिलकर अच्छा लगा')], before);
    expect(s.otherLanguage).toBe('hi');
    expect(theirLanguage(s)).toBe('hi');
    expect(targetLanguage(s, s.utterances[2])).toBe('hi');

    const [later] = run(reported('Hola', 'es', 'Hello'), s);
    expect(theirLanguage(later)).toBe('es');
  });

  test('without auto-detect the owner is always spoken to them in the picked language', () => {
    const fixed = initialSession(people, { ...handsFree, autoDetect: false });
    const [s] = run([...open, ...reported('नमस्ते', 'hi', 'Hello'), ...reported('Nice to meet you', 'en', 'Enchanté')], fixed);
    expect(s.otherLanguage).toBe('hi');
    expect(theirLanguage(s)).toBe('fr');
    expect(targetLanguage(s, s.utterances[1])).toBe('fr');
  });

  test('a new conversation or a new setup forgets the language they last used', () => {
    const [s] = run([...open, ...reported('नमस्ते', 'hi', 'Hello')], freshHandsFree());
    expect(run([{ type: 'stop' }, { type: 'start' }], s)[0].otherLanguage).toBeUndefined();
    expect(run([{ type: 'stop' }, { type: 'configure', people, settings: handsFree }], s)[0].otherLanguage).toBeUndefined();
  });

  test('the archive names the language they last used', () => {
    const [, log] = run([...open, ...reported('नमस्ते', 'hi', 'Hello'), { type: 'stop' }], freshHandsFree());
    expect(log.flat().find((e) => e.type === 'archive')).toMatchObject({ languages: { owner: 'en', other: 'hi' } });
  });

  test('hold-to-talk is the owner only: a press for the other person is ignored', () => {
    const [s, log] = run([...open, { type: 'pressTalk', speaker: 'other' }, { type: 'inputTranscript', text: 'Hola' }], freshHandsFree());
    expect(s.held).toBeUndefined();
    expect(log[2]).toEqual([]);
    expect(s.utterances[0]).toMatchObject({ routedBy: 'language' });
  });

  test('a voice verdict names the speaker over the language, never over a held button', () => {
    const [s] = run(
      [...open, { type: 'speechStarted' }, { type: 'inputTranscript', text: 'Hello' }, { type: 'speakerRecognised', speaker: 'other' }, { type: 'speechEnded' }, { type: 'sourceLanguage', language: 'en' }],
      freshHandsFree(),
    );
    expect(s.utterances[0]).toMatchObject({ speaker: 'other', routedBy: 'voice', language: 'en' });
    // They spoke the owner's language: nothing to follow.
    expect(s.otherLanguage).toBeUndefined();

    const [held] = run([...open, { type: 'pressTalk', speaker: 'owner' }, { type: 'speakerRecognised', speaker: 'other' }], freshHandsFree());
    expect(held.utterances[0]).toMatchObject({ speaker: 'owner', routedBy: 'button' });
  });

  test('without any language report, a reply in the owner language means the other person spoke', () => {
    const [s] = run([...open, { type: 'speechStarted' }, { type: 'inputTranscript', text: 'Namaste' }, { type: 'outputTranscript', text: 'Hello', language: 'en' }], freshHandsFree());
    expect(s.utterances[0].speaker).toBe('other');
  });
});

describe('placeholder replies', () => {
  test('only bracketed tokens are placeholders', () => {
    expect(isPlaceholder('<no speech detected>')).toBe(true);
    expect(isPlaceholder('<no speech>{pause}')).toBe(true);
    expect(isPlaceholder(' {pause} ')).toBe(true);
    expect(isPlaceholder('<no spe')).toBe(true); // still streaming in
    expect(isPlaceholder('')).toBe(false);
    expect(isPlaceholder('Bonjour')).toBe(false);
    expect(isPlaceholder('Bonjour {pause}')).toBe(false);
    expect(isPlaceholder('3 < 5')).toBe(false);
  });

  test('an utterance answered with a placeholder is not heard, so it is not archived', () => {
    const [, log] = run(
      [
        ...open,
        ...said('die', 'en'),
        { type: 'outputTranscript', text: '<no speech>{pause}' },
        { type: 'outputAudio', pcm },
        { type: 'turnComplete' },
        ...said('Good morning', 'en'),
        { type: 'outputTranscript', text: 'Bonjour' },
        { type: 'stop' },
      ],
      freshHandsFree(),
    );
    const archived = log.flat().find((e) => e.type === 'archive');
    expect(archived?.type === 'archive' && archived.utterances.map((u) => u.source)).toEqual(['Good morning']);
    expect(wasHeard({ id: 'x', routedBy: 'language', status: 'done', source: 'die', translation: '<no speech detected>' })).toBe(false);
  });
});

test('a note lands on the utterance being answered', () => {
  const [s] = run(
    [{ type: 'start' }, { type: 'connected' }, { type: 'speechStarted' }, { type: 'inputTranscript', text: 'A piece of cake' }, { type: 'speechEnded' }, { type: 'note', text: 'Idiom: very easy' }],
    freshHandsFree(),
  );
  expect(s.utterances[0].note).toBe('Idiom: very easy');
});

describe('the setup', () => {
  test('the owner and the other person cannot share a language: the previous setup stays', () => {
    const both: People = { ...people, other: { ...people.other, language: 'en-GB' } };
    expect(validPeople(both)).toBe(false);
    expect(validPeople(people)).toBe(true);
    const [s, effects] = transition(freshHandsFree(), { type: 'configure', people: both, settings: manual });
    expect(s.people).toEqual(people);
    expect(s.settings).toEqual(handsFree);
    expect(effects).toEqual([]);
  });

  test('after a conversation stops, "them" goes back to the picked language', () => {
    const [s] = run([...open, { type: 'speechStarted' }, { type: 'inputTranscript', text: 'Hola' }, { type: 'speechEnded' }, { type: 'sourceLanguage', language: 'es' }], freshHandsFree());
    expect(theirLanguage(s)).toBe('es');
    const [stopped] = run([{ type: 'stop' }], s);
    expect(stopped.otherLanguage).toBeUndefined();
    expect(theirLanguage(stopped)).toBe('fr');
    const [failed] = run([{ type: 'audioFailed', kind: 'mic', message: 'gone' }], s);
    expect(theirLanguage(failed)).toBe('fr');
  });
});

describe('voice recognition', () => {
  const hola: SessionEvent[] = [{ type: 'speechStarted' }, { type: 'inputTranscript', text: 'Hola amigo' }, { type: 'speechEnded' }];

  test('the end of each capture asks for its voice to be judged', () => {
    const [, log] = run([...open, ...hola], freshHandsFree());
    expect(log[4]).toContainEqual({ type: 'recogniseVoice', utteranceId: 'u1' });
    expect(log.flat().filter((e) => e.type === 'recogniseVoice')).toHaveLength(1);
  });

  test('nothing is judged for speech that was dropped or cut off by a stop', () => {
    const [, stopped] = run([...open, { type: 'speechStarted' }, { type: 'stop' }], freshHandsFree());
    expect(stopped.flat().some((e) => e.type === 'recogniseVoice')).toBe(false);
  });

  test('a late verdict lands on the utterance it was computed for, not the one being captured', () => {
    const [s] = run(
      [...open, ...hola, { type: 'speechStarted' }, { type: 'speakerRecognised', speaker: 'other', utteranceId: 'u1' }],
      freshHandsFree(),
    );
    expect(s.utterances.map((u) => [u.id, u.speaker, u.routedBy])).toEqual([
      ['u1', 'other', 'voice'],
      ['u2', undefined, 'language'],
    ]);
  });

  test("the other person speaking the owner's language is still the other person, and their language stays", () => {
    const [s] = run(
      [...open, ...hola, { type: 'speakerRecognised', speaker: 'other', utteranceId: 'u1' }, { type: 'sourceLanguage', language: 'en' }],
      freshHandsFree(),
    );
    expect(s.utterances[0]).toMatchObject({ speaker: 'other', routedBy: 'voice', language: 'en' });
    expect(theirLanguage(s)).toBe('fr');
  });

  test("Vorp's own voice is dropped as an echo, and so is the model's reply to it", () => {
    const [s, log] = run(
      [...open, ...hola, { type: 'echoRecognised', utteranceId: 'u1' }, { type: 'outputTranscript', text: 'Hello friend' }, { type: 'outputAudio', pcm }],
      freshHandsFree(),
    );
    expect(s.utterances[0]).toMatchObject({ status: 'failed', error: 'echo', translation: '' });
    expect(s.awaitingResponse).toEqual(['u1']);
    expect(log[log.length - 1]).toEqual([]);
    expect(wasHeard(s.utterances[0])).toBe(false);
  });

  test('an echo verdict is too late once the reply plays, and never applies to a held button', () => {
    const [playing] = run([...open, ...hola, { type: 'outputAudio', pcm }, { type: 'echoRecognised', utteranceId: 'u1' }], freshHandsFree());
    expect(playing.utterances[0].status).toBe('queued');
    const [held] = run([...open, { type: 'pressTalk', speaker: 'owner' }, { type: 'echoRecognised', utteranceId: 'u1' }], freshHandsFree());
    expect(held.utterances[0].status).toBe('capturing');
  });

  test('a verdict for an unknown utterance changes nothing', () => {
    const [s] = run([...open, ...hola], freshHandsFree());
    expect(run([{ type: 'speakerRecognised', speaker: 'owner', utteranceId: 'u9' }, { type: 'echoRecognised', utteranceId: 'u9' }], s)[0]).toEqual(s);
  });
});
