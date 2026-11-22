/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import {
  archived,
  initialPairing,
  ownTalking,
  transition,
  type Outbound,
  type PairEffect,
  type PairEvent,
  type Pairing,
  type PairSetup,
} from './pairing';
import type { SessionEvent, SessionSettings } from './session';

const queue = { id: 'queue', speechDuringPlayback: 'queue', holdSeconds: 20 } as const;
const settings: SessionSettings = {
  detection: 'auto',
  overlap: queue,
  pauseMicWhileSpeaking: false,
  echoMatch: 0.6,
  tone: 'neutral',
  behaviours: [],
  autoDetect: false,
  prompt: 'paired',
};
const setup = (language: string): PairSetup => ({ language, voice: 'Charon', peerVoice: 'Kore', settings });
const timing = { joinedMs: 1900, boothSeconds: 6, doneMs: 2600 };
const pcm = new Int16Array([1, 2, 3]);

function run(events: PairEvent[], from: Pairing): [Pairing, PairEffect[][]] {
  const log: PairEffect[][] = [];
  const state = events.reduce((p, e) => {
    const [next, effects] = transition(p, e, timing);
    log.push(effects);
    return next;
  }, from);
  return [state, log];
}

const types = (effects: PairEffect[]) => effects.map((e) => (e.type === 'own' ? `own:${e.effect.type}` : e.type));
const sent = (effects: PairEffect[][]): Outbound[] => effects.flat().flatMap((e) => (e.type === 'send' ? [e.message] : []));
const o = (event: SessionEvent): PairEvent => ({ type: 'own', event });

const host = () => initialPairing('host', setup('en'));
const guest = () => initialPairing('guest', setup('en'), 'CODE');

/** The host up to a live conversation with a French guest, its session connected. */
const hostLive: PairEvent[] = [
  { type: 'pair' },
  { type: 'audioOpened' },
  { type: 'roomCreated', room: 1, code: 'CODE', expiresIn: 600, at: 1000 },
  { type: 'welcome' },
  { type: 'peerJoined', peerLanguage: 'fr' },
  { type: 'timer', what: 'goLive', room: 1 },
  o({ type: 'connected' }),
];

/** The guest (French) up to a live conversation with an English host. */
const guestLive: PairEvent[] = [{ type: 'join', language: 'fr' }, { type: 'audioOpened' }, { type: 'welcome', peerLanguage: 'en' }, o({ type: 'connected' })];

/** The owner says something in their language and the interpreter answers it with audio. */
const ownTurn = (source: string, language: string, translation: string): PairEvent[] => [
  o({ type: 'speechStarted' }),
  o({ type: 'inputTranscript', text: source }),
  o({ type: 'speechEnded' }),
  o({ type: 'sourceLanguage', language }),
  o({ type: 'outputTranscript', text: translation }),
  o({ type: 'outputAudio', pcm }),
  o({ type: 'turnComplete' }),
];

/** The other phone's turn arriving, whole. */
const peerTurn = (turn: string, source: string, translation: string): PairEvent[] => [
  { type: 'peerTurn', turn, state: 'talking' },
  { type: 'peerCaption', turn, side: 'source', delta: source },
  { type: 'peerTurn', turn, state: 'translating' },
  { type: 'peerTurn', turn, state: 'ready' },
  { type: 'peerAudio', pcm },
  { type: 'peerCaption', turn, side: 'translation', delta: translation },
  { type: 'peerTurn', turn, state: 'done' },
];

describe('the host', () => {
  test('pairs: the audio opens in the tap, a room is made, its socket says hello', () => {
    const [p, log] = run(hostLive.slice(0, 4), host());
    expect(types(log[0])).toEqual(['openAudio', 'createRoom']);
    expect(types(log[2])).toEqual(['connectRoom', 'timer']);
    expect(log[2][1]).toEqual({ type: 'timer', what: 'expiry', ms: 600_000, room: 1 });
    expect(p.status).toBe('waiting');
    expect(p.code).toBe('CODE');
    expect(p.expiresAt).toBe(601_000);
    expect(types(log[3])).toEqual(['keepAwake']);
  });

  test('the guest joins: a cue, its session starts for their language, then the conversation shows', () => {
    const [p, log] = run(hostLive, host());
    expect(types(log[4])).toEqual(['cue', 'timer', 'own:openAudio', 'own:connect']);
    expect(log[4][1]).toMatchObject({ what: 'goLive', ms: 1900 });
    const connect = log[4].find((e) => e.type === 'own' && e.effect.type === 'connect');
    expect(connect).toMatchObject({ effect: { people: { owner: { language: 'en' }, other: { language: 'fr' } } } });
    expect(p.status).toBe('live');
    // The microphone opens once the session is connected, and the live cue sounds.
    expect(types(log[6])).toContain('own:startCapture');
    expect(log[6]).toContainEqual({ type: 'cue', kind: 'live' });
  });

  test('a code nobody used expires', () => {
    const [p] = run([...hostLive.slice(0, 4), { type: 'timer', what: 'expiry', room: 1 }], host());
    expect(p.status).toBe('failed');
    expect(p.problem).toBe('expired');
  });

  test('a waiting host whose socket drops gets a new code', () => {
    const [p, log] = run([...hostLive.slice(0, 4), { type: 'dropped' }], host());
    expect(p.status).toBe('creating');
    expect(p.room).toBe(2);
    expect(types(log[4])).toContain('createRoom');
  });

  test('Cancel on the code ends the room and goes back to Start', () => {
    const [p, log] = run([...hostLive.slice(0, 4), { type: 'cancel' }], host());
    expect(p.status).toBe('off');
    expect(types(log[4])[0]).toBe('endRoom');
  });

  test('a timer from an earlier room is ignored', () => {
    const [p] = run([...hostLive.slice(0, 4), { type: 'timer', what: 'expiry', room: 0 }], host());
    expect(p.status).toBe('waiting');
  });
});

describe('the guest', () => {
  test('Join opens the microphone first; the code is spent only once it is open', () => {
    const [p, log] = run(guestLive, guest());
    expect(types(log[0])).toEqual(['openAudio']);
    expect(log[1]).toEqual([{ type: 'connectRoom', role: 'guest', code: 'CODE', language: 'fr' }]);
    expect(log[2]).toContainEqual({ type: 'cue', kind: 'joined' });
    expect(p.status).toBe('live');
    expect(p.peerLanguage).toBe('en');
    expect(p.own.people.owner.language).toBe('fr');
  });

  test('a denied microphone spends no code and can be tried again', () => {
    const [p, log] = run([{ type: 'join', language: 'fr' }, { type: 'audioFailed', kind: 'micDenied' }], guest());
    expect(p.problem).toBe('micDenied');
    expect(types(log.flat())).not.toContain('connectRoom');
    const [again] = run([{ type: 'join', language: 'fr' }], p);
    expect(again.status).toBe('opening');
  });

  test('a refused code says why', () => {
    const at = (code: 'taken' | 'expired' | 'host_gone' | 'not_found') =>
      run([{ type: 'join', language: 'fr' }, { type: 'audioOpened' }, { type: 'refused', code }], guest())[0].problem;
    expect(at('taken')).toBe('used');
    expect(at('expired')).toBe('expired');
    expect(at('host_gone')).toBe('hostLeft');
    expect(at('not_found')).toBe('expired');
  });

  test('Stop ends it for both, keeps nothing, and leaves for the landing page', () => {
    const [p, log] = run([...guestLive, ...ownTurn('Bonjour à tous', 'fr', 'Hello everyone'), { type: 'stop' }, { type: 'timer', what: 'leave', room: 1 }], guest());
    const stop = log[log.length - 2];
    expect(types(stop)[0]).toBe('endRoom');
    expect(types(stop)).not.toContain('archive');
    expect(stop).toContainEqual({ type: 'timer', what: 'leave', ms: 2600, room: 1 });
    expect(p.status).toBe('done');
    expect(log[log.length - 1]).toEqual([{ type: 'leave', language: 'fr' }]);
  });

  test('the host ending it shows the ended card, then Continue says goodbye', () => {
    const [p, log] = run([...guestLive, { type: 'ended', reason: 'host_stopped' }, { type: 'continue' }], guest());
    expect(types(log[4])).toContain('closeRoom');
    expect(p.status).toBe('done');
  });
});

describe('this phone’s turns go to the other phone', () => {
  test('talking, the words once they are the owner’s, the translation, its audio, then done', () => {
    const [p, log] = run([...hostLive, ...ownTurn('Where is the bus', 'en', 'Où est le bus')], host());
    expect(sent(log.slice(hostLive.length))).toEqual([
      { type: 'turn', turn: 'hu1', state: 'talking' },
      { type: 'speaking', talking: true },
      { type: 'turn', turn: 'hu1', state: 'translating' },
      { type: 'speaking', talking: false },
      { type: 'caption', turn: 'hu1', side: 'source', delta: 'Where is the bus' },
      { type: 'turn', turn: 'hu1', state: 'ready' },
      { type: 'caption', turn: 'hu1', side: 'translation', delta: 'Où est le bus' },
      { type: 'turn', turn: 'hu1', state: 'done' },
    ]);
    // The translated audio goes to the other phone, never to this phone's speaker.
    const effects = log.slice(hostLive.length).flat();
    expect(effects).toContainEqual({ type: 'sendAudio', pcm });
    expect(types(effects)).not.toContain('own:enqueuePlayback');
    expect(p.own.utterances[0].status).toBe('queued');
  });

  test('their phone reports delivery: playing, then heard', () => {
    const [p] = run(
      [
        ...hostLive,
        ...ownTurn('Where is the bus', 'en', 'Où est le bus'),
        { type: 'peerPlayback', turn: 'hu1', state: 'playing', progress: 0.5 },
      ],
      host(),
    );
    expect(p.delivery.u1).toEqual({ state: 'playing', progress: 0.5 });
    expect(p.own.utterances[0].status).toBe('speaking');
    const [heard] = run([{ type: 'peerPlayback', turn: 'hu1', state: 'heard' }], p);
    expect(heard.delivery.u1.state).toBe('heard');
    expect(heard.own.utterances[0].status).toBe('done');
  });

  test('speech in another language is the other person nearby: it is never relayed', () => {
    const [p, log] = run(
      [
        ...hostLive,
        o({ type: 'speechStarted' }),
        o({ type: 'inputTranscript', text: 'Bonjour à vous' }),
        o({ type: 'speechEnded' }),
        o({ type: 'sourceLanguage', language: 'fr' }),
        o({ type: 'outputTranscript', text: 'Hello to you' }),
        o({ type: 'outputAudio', pcm }),
        o({ type: 'turnComplete' }),
      ],
      host(),
    );
    const out = sent(log.slice(hostLive.length));
    expect(out.filter((m) => m.type === 'caption')).toEqual([]);
    expect(out).toContainEqual({ type: 'turn', turn: 'hu1', state: 'failed' });
    expect(log.flat().some((e) => e.type === 'sendAudio')).toBe(false);
    expect(archived(p)).toEqual([]);
  });
});

describe('the other phone’s turns play here', () => {
  test('a translation plays as it arrives; the microphone is muted while it plays', () => {
    const [p, log] = run([...hostLive, ...peerTurn('g1', 'Bonjour', 'Hello')], host());
    const effects = log.slice(hostLive.length).flat();
    expect(types(effects)).toContain('playIncoming');
    expect(types(effects)).toContain('own:stopCapture');
    expect(effects).toContainEqual({ type: 'finishIncoming', turn: 'g1' });
    expect(p.incoming[0]).toMatchObject({ source: 'Bonjour', translation: 'Hello', playback: 'playing' });
    const [heard, after] = run([{ type: 'incomingFinished', turn: 'g1' }], p);
    expect(heard.incoming[0].playback).toBe('heard');
    expect(sent(after)).toContainEqual({ type: 'playback', turn: 'g1', state: 'heard' });
    expect(types(after[0])).toContain('own:startCapture');
  });

  test('one that arrives while the owner talks waits, and plays when they stop', () => {
    const [p, log] = run([...hostLive, o({ type: 'speechStarted' }), ...peerTurn('g1', 'Bonjour', 'Hello')], host());
    expect(ownTalking(p)).toBe(true);
    expect(p.incoming[0].playback).toBe('queued');
    expect(log.flat()).toContainEqual({ type: 'keepIncoming', turn: 'g1', pcm });
    expect(sent(log)).toContainEqual({ type: 'playback', turn: 'g1', state: 'queued' });
    expect(types(log.flat())).not.toContain('playIncoming');
    const [released, after] = run([o({ type: 'speechEnded' })], p);
    expect(released.incoming[0].playback).toBe('playing');
    expect(types(after[0])).toContain('playIncoming');
  });

  test('several play one at a time, in order', () => {
    const [p, log] = run([...hostLive, ...peerTurn('g1', 'Un', 'One'), ...peerTurn('g2', 'Deux', 'Two')], host());
    expect(p.incoming.map((t) => t.playback)).toEqual(['playing', 'none']);
    expect(log.flat().filter((e) => e.type === 'playIncoming')).toEqual([{ type: 'playIncoming', turn: 'g1' }]);
    const [next] = run([{ type: 'incomingFinished', turn: 'g1' }], p);
    expect(next.incoming.map((t) => t.playback)).toEqual(['heard', 'playing']);
  });

  test('the microphone hearing their translation from this speaker is an echo, and is dropped', () => {
    const [p, log] = run(
      [
        ...hostLive,
        ...peerTurn('g1', 'Où est la gare', 'Where is the station'),
        { type: 'incomingFinished', turn: 'g1' },
        o({ type: 'speechStarted' }),
        o({ type: 'inputTranscript', text: 'Where is the station' }),
      ],
      host(),
    );
    expect(p.own.utterances[0]).toMatchObject({ status: 'failed', error: 'echo' });
    expect(sent(log)).toContainEqual({ type: 'turn', turn: 'hu1', state: 'failed' });
  });

  test('their phone dropping and coming back drops the turns it never finished', () => {
    const [p] = run(
      [...hostLive, { type: 'peerTurn', turn: 'g1', state: 'talking' }, { type: 'peerAway' }, { type: 'peerBack' }],
      host(),
    );
    expect(p.incoming[0].state).toBe('failed');
    expect(p.peer).toBe('here');
  });

  test('nobody to hear: the microphone is muted while their phone is away', () => {
    const [p] = run([...hostLive, { type: 'peerAway' }], host());
    expect(p.own.muted).toBe(true);
  });
});

describe('the end', () => {
  test('the host keeps both sides in order, then the booth loop makes a fresh code', () => {
    const [p, log] = run(
      [
        ...hostLive,
        ...ownTurn('Where is the bus', 'en', 'Où est le bus'),
        ...peerTurn('g1', 'Juste là', 'Right there'),
        { type: 'incomingFinished', turn: 'g1' },
        { type: 'stop' },
      ],
      host(),
    );
    const stop = log[log.length - 1];
    expect(types(stop)[0]).toBe('endRoom');
    const archive = stop.find((e) => e.type === 'archive');
    expect(archive).toMatchObject({
      languages: { owner: 'en', other: 'fr' },
      utterances: [
        { speaker: 'owner', source: 'Where is the bus', translation: 'Où est le bus' },
        { speaker: 'other', source: 'Juste là', translation: 'Right there' },
      ],
    });
    expect(stop).toContainEqual({ type: 'timer', what: 'booth', ms: 6000, room: 1 });
    expect(stop).toContainEqual({ type: 'keepAwake', on: false });
    expect(p.saved).toBe(true);
    const [next, after] = run([{ type: 'timer', what: 'booth', room: 1 }], p);
    expect(next.status).toBe('creating');
    expect(next.incoming).toEqual([]);
    expect(types(after[0])).toEqual(['openAudio', 'createRoom']);
  });

  test('Not now on the end card goes back to Start, and the booth timer does nothing', () => {
    const [p] = run([...hostLive, { type: 'stop' }, { type: 'cancel' }, { type: 'timer', what: 'booth', room: 1 }], host());
    expect(p.status).toBe('off');
  });

  test('the guest ending it ends the host’s too; with nothing said nothing is kept', () => {
    const [p, log] = run([...hostLive, { type: 'ended', reason: 'guest_stopped' }], host());
    expect(p.status).toBe('ended');
    expect(p.ended).toBe('guest_stopped');
    expect(p.saved).toBe(false);
    expect(types(log[log.length - 1])).not.toContain('archive');
  });

  test('this phone’s link not coming back ends it', () => {
    const [p] = run([...hostLive, { type: 'rejoining' }, { type: 'lost' }], host());
    expect(p.status).toBe('ended');
    expect(p.ended).toBe('lost');
  });

  test('rejoining mutes the microphone, and rejoining brings it back', () => {
    const [away] = run([...hostLive, { type: 'rejoining' }], host());
    expect(away.link).toBe('rejoining');
    expect(away.own.muted).toBe(true);
    const [back] = run([{ type: 'welcome', rejoined: true }], away);
    expect(back.link).toBe('up');
    expect(back.own.muted).toBe(false);
  });
});

test('sound locked by the browser: one tap unlocks it', () => {
  const [p, log] = run([...guestLive, { type: 'soundBlocked' }, { type: 'soundOn' }], guest());
  expect(p.soundBlocked).toBe(false);
  expect(log[log.length - 1]).toEqual([{ type: 'unlockSound' }]);
});
