/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { initialPairing, transition, type PairEvent, type Pairing, type PairSetup } from '@/core/pairing';
import type { SessionEvent, SessionSettings } from '@/core/session';

import { guestChoices, guestLanguage, guestPageModel, hostPairModel, joinUrl, pairTalkModel } from './model';

const settings: SessionSettings = {
  detection: 'auto',
  overlap: { id: 'queue', speechDuringPlayback: 'queue', holdSeconds: 20 },
  pauseMicWhileSpeaking: false,
  echoMatch: 0.6,
  tone: 'neutral',
  behaviours: [],
  autoDetect: false,
  prompt: 'paired',
};
const setup: PairSetup = { language: 'en', voice: 'Charon', peerVoice: 'Kore', settings };
const timing = { joinedMs: 1900, boothSeconds: 6, doneMs: 2600 };
const pcm = new Int16Array([1]);
const o = (event: SessionEvent): PairEvent => ({ type: 'own', event });

const after = (events: PairEvent[], from: Pairing = initialPairing('host', setup)) => events.reduce((p, e) => transition(p, e, timing)[0], from);

const live: PairEvent[] = [
  { type: 'pair' },
  { type: 'audioOpened' },
  { type: 'roomCreated', room: 1, code: 'C0DE', expiresIn: 600, at: 0 },
  { type: 'welcome' },
  { type: 'peerJoined', peerLanguage: 'fr' },
  { type: 'timer', what: 'goLive', room: 1 },
  o({ type: 'connected' }),
];

const mine: PairEvent[] = [
  o({ type: 'speechStarted' }),
  o({ type: 'inputTranscript', text: 'Where is the bus' }),
  o({ type: 'speechEnded' }),
  o({ type: 'sourceLanguage', language: 'en' }),
  o({ type: 'outputTranscript', text: 'Où est le bus' }),
  o({ type: 'outputAudio', pcm }),
  o({ type: 'turnComplete' }),
];

const theirs = (turn: string, source: string, translation: string): PairEvent[] => [
  { type: 'peerTurn', turn, state: 'talking' },
  { type: 'peerCaption', turn, side: 'source', delta: source },
  { type: 'peerTurn', turn, state: 'ready' },
  { type: 'peerAudio', pcm },
  { type: 'peerCaption', turn, side: 'translation', delta: translation },
];

describe('the host’s code', () => {
  test('making, then the code to scan with its expiry, then "They’re in"', () => {
    expect(hostPairModel(initialPairing('host', setup), 'https://x')).toBeUndefined();
    expect(hostPairModel(after(live.slice(0, 1)), 'https://x')).toEqual({ view: 'code', state: 'making' });
    expect(hostPairModel(after(live.slice(0, 4)), 'https://x')).toEqual({ view: 'code', state: 'waiting', url: 'https://x/join/C0DE?host=en', expiresAt: 600_000 });
    expect(hostPairModel(after(live.slice(0, 5)), 'https://x')).toEqual({ view: 'joined', them: 'fr' });
    expect(hostPairModel(after(live), 'https://x')?.view).toBe('talk');
  });

  test('an expired code says so', () => {
    expect(hostPairModel(after([...live.slice(0, 4), { type: 'timer', what: 'expiry', room: 1 }]), 'o')).toEqual({ view: 'code', state: 'expired' });
  });

  test('the QR names the host’s language, so the guest page can grey it out', () => {
    expect(joinUrl('http://localhost:8081', 'a-b_c', 'pt-BR')).toBe('http://localhost:8081/join/a-b_c?host=pt-BR');
  });
});

describe('the paired conversation', () => {
  test('this owner talking: their card is live and the status says so', () => {
    const talk = pairTalkModel(after([...live, ...mine.slice(0, 2)]))!;
    expect(talk.status).toBe('hearingYou');
    expect(talk.phase).toBe('hearing');
    expect(talk.cards).toEqual([{ id: 'own-u1', mine: true, state: 'live', source: 'Where is the bus', translation: '', progress: 0 }]);
  });

  test('delivery: translating, waiting for them, playing there with its progress, heard', () => {
    const sent = after([...live, ...mine]);
    expect(pairTalkModel(sent)!.cards[0].state).toBe('translating');
    const waiting = after([{ type: 'peerPlayback', turn: 'hu1', state: 'queued' }], sent);
    expect(pairTalkModel(waiting)!.cards[0].state).toBe('waitingThem');
    const playing = after([{ type: 'peerPlayback', turn: 'hu1', state: 'playing', progress: 0.4 }], sent);
    expect(pairTalkModel(playing)!.cards[0]).toMatchObject({ state: 'delivering', progress: 0.4 });
    expect(pairTalkModel(playing)!.status).toBe('playingThere');
    const heard = after([{ type: 'peerPlayback', turn: 'hu1', state: 'heard' }], playing);
    expect(pairTalkModel(heard)!.cards[0].state).toBe('heard');
  });

  test('they’re talking: their words live, then their translation playing here', () => {
    const talking = after([...live, ...theirs('gu1', 'Bonjour', 'Hello').slice(0, 2)]);
    expect(pairTalkModel(talking)!.status).toBe('theyreTalking');
    expect(pairTalkModel(talking)!.cards[0]).toMatchObject({ mine: false, state: 'live', source: 'Bonjour' });
    const playing = after(theirs('gu1', 'Bonjour', 'Hello').slice(2), talking);
    expect(pairTalkModel(playing)!.status).toBe('speakingToYou');
    expect(pairTalkModel(playing)!.cards[0]).toMatchObject({ state: 'playing', translation: 'Hello' });
  });

  test('arriving while this owner talks: greyed and waiting; several stack into a shelf', () => {
    const p = after([
      ...live,
      o({ type: 'speechStarted' }),
      o({ type: 'inputTranscript', text: 'And another thing' }),
      ...theirs('gu1', 'Un', 'One'),
      { type: 'peerTurn', turn: 'gu1', state: 'done' },
      ...theirs('gu2', 'Deux', 'Two'),
    ]);
    const cards = pairTalkModel(p)!.cards;
    expect(cards.map((c) => [c.id, c.state, c.shelf])).toEqual([
      ['own-u1', 'live', undefined],
      ['peer-gu1', 'queued', 1],
    ]);
  });

  test('a turn of theirs with no words yet is not shown while this owner talks', () => {
    const p = after([...live, o({ type: 'speechStarted' }), { type: 'peerTurn', turn: 'gu1', state: 'talking' }]);
    expect(pairTalkModel(p)!.cards.filter((c) => !c.mine)).toEqual([]);
  });

  test('their phone away: reconnecting, with the ring at rest', () => {
    const talk = pairTalkModel(after([...live, { type: 'peerAway' }]))!;
    expect(talk.peer).toBe('reconnecting');
    expect(talk.status).toBe('reconnecting');
    expect(talk.aside).toBe('peerAway');
    expect(talk.rest).toBe(true);
  });

  test('this phone locked and rejoining: the locked line', () => {
    expect(pairTalkModel(after([...live, { type: 'rejoining' }]))!.aside).toBe('locked');
  });

  test('ended: the host’s end card says whether it was kept', () => {
    const saved = pairTalkModel(after([...live, ...mine, { type: 'stop' }]))!;
    expect(saved.end).toEqual({ kind: 'host', saved: true, recap: false });
    expect(saved.cards).toEqual([]);
    expect(pairTalkModel(after([...live, { type: 'ended', reason: 'guest_stopped' }]))!.end).toEqual({ kind: 'host', saved: false, recap: false });
  });

  test('hands-free off: Hold to talk is there once connected', () => {
    const manual = { ...setup, settings: { ...settings, detection: 'manual' as const } };
    const talk = pairTalkModel(after(live, initialPairing('host', manual)))!;
    expect(talk.handsFree).toBe(false);
    expect(talk.canHold).toBe(true);
  });
});

describe('the guest’s page', () => {
  test('the picker names languages in their own names, the host’s greyed out with why, in the reader’s language', () => {
    const choices = guestChoices('en', 'es');
    expect(choices.find((c) => c.value === 'es')).toEqual({ value: 'es', label: 'Español', detail: 'Spanish' });
    expect(choices.find((c) => c.value === 'en')?.disabled).toBe('Lo habla la otra persona');
    expect(choices.map((c) => c.label)).toEqual([...choices.map((c) => c.label)].sort((a, b) => a.localeCompare(b)));
  });

  test('the first pick is the browser’s language, unless the host speaks it', () => {
    expect(guestLanguage('en', ['fr-CA', 'en'])).toBe('fr');
    expect(guestLanguage('fr', ['fr-CA', 'en-US'])).toBe('en');
    expect(guestLanguage('en', ['en-US'])).toBe('es');
    expect(guestLanguage(undefined, ['de-DE'])).toBe('de');
  });

  test('joining, problems, the conversation, goodbye', () => {
    const guest = initialPairing('guest', setup, 'C0DE');
    expect(guestPageModel(guest, 'fr', 'en').view).toBe('pick');
    const joining = after([{ type: 'join', language: 'fr' }], guest);
    expect(guestPageModel(joining, 'fr', 'en')).toMatchObject({ view: 'joining', copy: 'fr', hostName: 'English' });
    const denied = after([{ type: 'audioFailed', kind: 'micDenied' }], joining);
    expect(guestPageModel(denied, 'fr', 'en').view).toBe('micDenied');
    const used = after([{ type: 'audioOpened' }, { type: 'refused', code: 'taken' }], joining);
    expect(guestPageModel(used, 'fr', 'en').view).toBe('used');
    const talking = after([{ type: 'audioOpened' }, { type: 'welcome', peerLanguage: 'en' }], joining);
    expect(guestPageModel(talking, 'fr', 'en').talk?.them).toBe('en');
    const done = after([{ type: 'stop' }], talking);
    expect(guestPageModel(done, 'fr', 'en').view).toBe('done');
  });
});
