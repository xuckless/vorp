// A paired phone (Pair by QR) as one state value and one pure transition. No React, no I/O.
//
// Each phone runs its own interpreter session (`./session`) that turns its owner's speech into
// the other person's language; the server relays between the two phones (docs/pairing-protocol.md).
// This machine wraps that session and adds what pairing needs:
//
// - the room's lifecycle (host: creating → connecting → waiting → joined → live → ended; guest:
//   opening → connecting → live → ended → done; failed when a phone cannot get in),
// - the other phone (here or away) and this phone's own link (up or rejoining),
// - the turns arriving from the other phone (`incoming`) and their playback here: a translation that
//   arrives while this phone's owner is talking waits, and they play one at a time, in order,
// - the relay of this phone's own turns: changes to its session become messages for the other phone
//   (`turn`, `caption`, `speaking`), and its translated audio goes there instead of to the speaker,
// - mic and speaker taking turns: the session's microphone is muted while the other person's
//   translation plays here (and whenever nobody is there to hear it).

import {
  capturingUtterance,
  initialSession,
  inputOwnerId,
  isEcho,
  isPlaceholder,
  transition as sessionTransition,
  validPeople,
  wasHeard,
  type Effect as SessionEffect,
  type People,
  type Pcm,
  type Session,
  type SessionEvent,
  type SessionSettings,
  type Utterance,
  type UtteranceId,
} from './session';

export type PairRole = 'host' | 'guest';

/** Where this phone is in the pairing. */
export type RoomStatus =
  /** Host: not pairing. Guest: picking a language. */
  | 'off'
  /** Guest: Join was tapped and the microphone is opening; no code is spent yet. */
  | 'opening'
  /** Host: asking the server for a room. */
  | 'creating'
  /** The room's socket is open and hello sent; waiting for welcome. */
  | 'connecting'
  /** Host: the QR code shows. */
  | 'waiting'
  /** Host: "They're in", the moment before the conversation shows. */
  | 'joined'
  | 'live'
  /** The room is over: the host's end card, the guest's "They ended the conversation". */
  | 'ended'
  /** Guest: "Thanks for talking", then the landing page. */
  | 'done'
  /** This phone could not get in or stay in; see `problem`. */
  | 'failed';

/**
 * Why this phone could not get in. `offline`: the phone has no network; `down`: the server could
 * not be reached or would not talk (it is not the phone); `unavailable`: the host could not make a
 * code; `hostLeft`: the host really left before the guest joined.
 */
export type RoomProblem = 'micDenied' | 'used' | 'expired' | 'hostLeft' | 'offline' | 'down' | 'unavailable';

/** Why a room ended. `lost`: this phone's own link did not come back in time. */
export type EndReason = 'host_stopped' | 'guest_stopped' | 'host_left' | 'guest_left' | 'lost';

/** An utterance's lifecycle on the wire, in order. */
export type WireTurnState = 'talking' | 'translating' | 'ready' | 'done' | 'failed';
export type PlaybackState = 'queued' | 'playing' | 'heard';

/** What this phone tells the other one, as the contract's text messages. */
export type Outbound =
  | { type: 'speaking'; talking: boolean }
  | { type: 'turn'; turn: string; state: WireTurnState }
  | { type: 'caption'; turn: string; side: 'source' | 'translation'; delta: string }
  | { type: 'playback'; turn: string; state: PlaybackState; progress?: number };

/** A turn from the other phone: their words, the translation into this owner's language, its playback here. */
export type PeerTurn = {
  id: string;
  state: WireTurnState;
  source: string;
  translation: string;
  /** Some of its audio has arrived. */
  audio: boolean;
  playback: 'none' | 'queued' | 'playing' | 'heard';
  /** 0..1 of the audio received so far that has played here. */
  progress: number;
};

/** What the other phone said about one of this phone's turns. */
export type Delivery = { state: PlaybackState; progress: number };

/** The feed's order: this phone's utterances and the other phone's turns, as they started. */
export type FeedRef = { from: 'own' | 'peer'; id: string };

/** What a paired phone's interpreter session is built from (data from src/config, chosen by the feature). */
export type PairSetup = {
  /** This phone's owner's language. */
  language: string;
  /** The interpreter voice this phone's session speaks in (heard on the other phone). */
  voice: string;
  /** The interpreter voice the other phone speaks in (heard here). */
  peerVoice: string;
  settings: SessionSettings;
};

export type Pairing = {
  role: PairRole;
  status: RoomStatus;
  /** Bumped for every room, so a timer or a room result from an earlier room is ignored. */
  room: number;
  /** The room's code: in the QR (host) or the URL (guest). */
  code?: string;
  /** Host: when the unused code expires, on this phone's clock (ms). */
  expiresAt?: number;
  setup: PairSetup;
  /** The other person's language, from welcome (guest) or peer_joined (host). */
  peerLanguage?: string;
  peer: 'here' | 'away';
  link: 'up' | 'rejoining';
  /** The other phone's owner is talking (their `speaking`). */
  peerTalking: boolean;
  /** This phone's interpreter session. */
  own: Session;
  incoming: PeerTurn[];
  /** By this phone's utterance id. */
  delivery: Record<UtteranceId, Delivery>;
  /** What was told about each of this phone's utterances, so a change becomes the next message. */
  sent: Record<UtteranceId, { state: WireTurnState; source: number; translation: number }>;
  feed: FeedRef[];
  /** The last `speaking` sent. */
  speaking: boolean;
  /** The browser kept playback locked (iPhone): "Tap to turn on sound". */
  soundBlocked: boolean;
  /** The `live` cue has sounded for this room. */
  cued: boolean;
  problem?: RoomProblem;
  ended?: EndReason;
  /** Host: the ended conversation was kept in History. */
  saved: boolean;
};

export type PairTimer = 'expiry' | 'goLive' | 'booth' | 'leave';
/** Server refusals, by the contract's error codes. */
export type RefusalCode = 'bad_message' | 'bad_key' | 'not_found' | 'taken' | 'expired' | 'host_gone' | 'replaced' | 'rate_limited';

export type PairEvent =
  // What the owner tapped.
  /** Host: Pair a phone, New code, Show it now (a user gesture: the audio opens in it). */
  | { type: 'pair' }
  /** Guest: Join, in this language (a user gesture). */
  | { type: 'join'; language: string }
  /** Host: Cancel on the code, Not now on the end card. */
  | { type: 'cancel' }
  /** Either: Stop, which ends it for both. */
  | { type: 'stop' }
  /** Guest: Continue on "They ended the conversation". */
  | { type: 'continue' }
  /** "Tap to turn on sound" (a user gesture). */
  | { type: 'soundOn' }
  | { type: 'pressTalk' }
  | { type: 'releaseTalk' }
  // What the I/O answered.
  | { type: 'audioOpened' }
  | { type: 'audioFailed'; kind: 'micDenied' | 'mic' }
  | { type: 'roomCreated'; room: number; code: string; expiresIn: number; at: number }
  | { type: 'roomFailed'; room: number }
  | { type: 'welcome'; peerLanguage?: string; rejoined?: boolean }
  | { type: 'peerJoined'; peerLanguage: string }
  | { type: 'peerAway' }
  | { type: 'peerBack' }
  | { type: 'ended'; reason: EndReason | 'expired' }
  | { type: 'refused'; code: RefusalCode }
  /**
   * The socket closed without `ended` and nothing will bring it back (before pairing). `offline`:
   * it never opened and the phone has no network.
   */
  | { type: 'dropped'; offline?: boolean }
  /** The socket closed without `ended` while paired: it is rejoining with its key. */
  | { type: 'rejoining' }
  /** Rejoining gave up. */
  | { type: 'lost' }
  // Relayed from the other phone.
  | { type: 'peerSpeaking'; talking: boolean }
  | { type: 'peerTurn'; turn: string; state: WireTurnState }
  | { type: 'peerCaption'; turn: string; side: 'source' | 'translation'; delta: string }
  | { type: 'peerAudio'; pcm: Pcm }
  | { type: 'peerPlayback'; turn: string; state: PlaybackState; progress?: number }
  // This phone's speaker.
  | { type: 'incomingProgress'; turn: string; progress: number }
  | { type: 'incomingFinished'; turn: string }
  | { type: 'soundBlocked' }
  | { type: 'timer'; what: PairTimer; room: number }
  /** An event of this phone's interpreter session (its translator, its voice verdicts). */
  | { type: 'own'; event: SessionEvent };

export type PairEffect =
  /** An effect of this phone's interpreter session, run by the session's runner. */
  | { type: 'own'; effect: SessionEffect }
  /** Open the microphone and the speaker now, inside the gesture; answers `audioOpened` / `audioFailed`. */
  | { type: 'openAudio' }
  | { type: 'createRoom'; room: number }
  | { type: 'connectRoom'; role: PairRole; code: string; language: string }
  | { type: 'send'; message: Outbound }
  | { type: 'sendAudio'; pcm: Pcm }
  /** Stop for both: say `end`, then close. */
  | { type: 'endRoom' }
  /** Close the socket without a word (the room is over, or was never ours). */
  | { type: 'closeRoom' }
  /** The other person's audio: keep it until its turn plays. */
  | { type: 'keepIncoming'; turn: string; pcm: Pcm }
  /** Play what was kept for this turn, and what arrives for it from now on. */
  | { type: 'playIncoming'; turn: string }
  | { type: 'enqueueIncoming'; turn: string; pcm: Pcm }
  /** No more audio will come for this turn; `incomingFinished` follows once it has played. */
  | { type: 'finishIncoming'; turn: string }
  | { type: 'dropIncoming'; turn: string }
  | { type: 'stopIncoming' }
  | { type: 'timer'; what: PairTimer; ms: number; room: number }
  | { type: 'keepAwake'; on: boolean }
  | { type: 'cue'; kind: 'joined' | 'live' }
  /** Resume the speaker inside the "Tap to turn on sound" gesture. */
  | { type: 'unlockSound' }
  /** Guest: go to the landing page. */
  | { type: 'leave'; language: string }
  /** Host: keep the conversation, both sides, oldest first. */
  | { type: 'archive'; languages: { owner: string; other: string }; utterances: Utterance[] };

export type PairTransition = [Pairing, PairEffect[]];

/** Timings the machine schedules, from src/config (core imports no config). */
export type PairTiming = { joinedMs: number; boothSeconds: number; doneMs: number };

// ---------------------------------------------------------------- reading the state

/** The wire id of one of this phone's utterances: unique per sender ("hu3" on the host). */
export const turnId = (role: PairRole, id: UtteranceId) => `${role === 'host' ? 'h' : 'g'}${id}`;
const ownId = (turn: string) => turn.slice(1);

/** This phone's owner is talking: the session is hearing them, or they hold the button. */
export function ownTalking(p: Pairing): boolean {
  return p.status === 'live' && (capturingUtterance(p.own) !== undefined || p.own.held !== undefined);
}

/** The other person's turn playing here now, if any. */
export const playingTurn = (p: Pairing): PeerTurn | undefined => p.incoming.find((t) => t.playback === 'playing');

/** Whether this phone is in a room that keeps its screen awake. */
const awake = (p: Pairing) => p.status === 'waiting' || p.status === 'joined' || p.status === 'live';

/** One of this phone's utterances as the other phone should know it. */
function wireState(u: Utterance): WireTurnState {
  if (u.status === 'failed' || u.speaker === 'other' || isPlaceholder(u.translation)) return 'failed';
  switch (u.status) {
    case 'capturing':
      return 'talking';
    case 'translating':
      return u.translation === '' ? 'translating' : 'ready';
    case 'queued':
    case 'speaking':
      return 'ready';
    default:
      return 'done';
  }
}

const RANK: Record<WireTurnState, number> = { talking: 0, translating: 1, ready: 2, done: 3, failed: 3 };

/** The states to send to move a turn on from what was sent, in the contract's order. */
function steps(from: WireTurnState | undefined, to: WireTurnState): WireTurnState[] {
  const at = from === undefined ? -1 : RANK[from];
  if (to === 'failed') return from === undefined || at >= RANK.done ? [] : ['failed'];
  const path: WireTurnState[] = to === 'done' ? ['talking', 'translating', 'ready', 'done'] : (['talking', 'translating', 'ready'] as const).slice(0, RANK[to] + 1);
  return path.filter((s) => RANK[s] > at);
}

// ---------------------------------------------------------------- building the state

export function initialPairing(role: PairRole, setup: PairSetup, code?: string): Pairing {
  return {
    role,
    status: 'off',
    room: 0,
    ...(code === undefined ? {} : { code }),
    setup,
    peer: 'here',
    link: 'up',
    peerTalking: false,
    own: initialSession(people(setup, ''), setup.settings),
    incoming: [],
    delivery: {},
    sent: {},
    feed: [],
    speaking: false,
    soundBlocked: false,
    cued: false,
    saved: false,
  };
}

function people(setup: PairSetup, peerLanguage: string): People {
  return { owner: { language: setup.language, voice: setup.voice }, other: { language: peerLanguage, voice: setup.peerVoice } };
}

/** A fresh room for this phone: everything about the last one is forgotten. */
function freshRoom(p: Pairing, status: RoomStatus): Pairing {
  const { problem: _p, ended: _e, peerLanguage: _l, expiresAt: _x, ...rest } = p;
  return {
    ...rest,
    ...(p.role === 'host' ? { code: undefined } : {}),
    status,
    room: p.room + 1,
    peer: 'here',
    link: 'up',
    peerTalking: false,
    incoming: [],
    delivery: {},
    sent: {},
    feed: [],
    speaking: false,
    soundBlocked: false,
    cued: false,
    saved: false,
  };
}

const send = (message: Outbound): PairEffect => ({ type: 'send', message });

// ---------------------------------------------------------------- this phone's session

/**
 * Run an event through this phone's interpreter session and turn what changed into messages for
 * the other phone. Its playback effects are this phone's relay: translated audio goes to the other
 * phone, a finished reply is that turn's `done`, and its archive is replaced by the pairing's.
 */
function own(p: Pairing, event: SessionEvent): PairTransition {
  const [session, inner] = sessionTransition(p.own, event);
  let [q, out] = relay({ ...p, own: session });
  for (const effect of inner) {
    switch (effect.type) {
      case 'enqueuePlayback':
        if (q.sent[effect.utteranceId]?.state === 'ready') out.push({ type: 'sendAudio', pcm: effect.pcm });
        break;
      case 'finishPlayback': {
        const sent = q.sent[effect.utteranceId];
        if (sent && RANK[sent.state] < RANK.done) {
          q = { ...q, sent: { ...q.sent, [effect.utteranceId]: { ...sent, state: 'done' } } };
          out.push(send({ type: 'turn', turn: turnId(q.role, effect.utteranceId), state: 'done' }));
        }
        break;
      }
      case 'stopPlayback':
        out.push({ type: 'stopIncoming' });
        break;
      case 'archive':
        // The pairing keeps both sides itself (see `finish`).
        break;
      default:
        out.push({ type: 'own', effect });
    }
  }
  if (event.type === 'inputTranscript') [q, out] = chain([q, out], (x) => echoOfIncoming(x));
  return [q, out];
}

/** Changes to this phone's utterances since they were last told, as messages. */
function relay(p: Pairing): PairTransition {
  const out: PairEffect[] = [];
  let sent = p.sent;
  for (const u of p.own.utterances) {
    const was = sent[u.id];
    const to = wireState(u);
    const states = steps(was?.state, to);
    if (was === undefined && states.length === 0) continue;
    const turn = turnId(p.role, u.id);
    states.forEach((state) => out.push(send({ type: 'turn', turn, state })));
    const state = states.length > 0 ? states[states.length - 1] : was!.state;
    let source = was?.source ?? 0;
    let translation = was?.translation ?? 0;
    if (state !== 'failed') {
      // What they said goes over once it is known to be the owner (the language report, or the
      // interpretation starting): the session may be hearing the other person nearby.
      if ((u.language !== undefined || RANK[state] >= RANK.ready) && u.source.length > source) {
        out.push(send({ type: 'caption', turn, side: 'source', delta: u.source.slice(source) }));
        source = u.source.length;
      }
      if (u.translation.length > translation) {
        out.push(send({ type: 'caption', turn, side: 'translation', delta: u.translation.slice(translation) }));
        translation = u.translation.length;
      }
    }
    if (was === undefined || was.state !== state || was.source !== source || was.translation !== translation) {
      sent = { ...sent, [u.id]: { state, source, translation } };
    }
  }
  const known = new Set(p.feed.filter((f) => f.from === 'own').map((f) => f.id));
  const added = Object.keys(sent).filter((id) => !known.has(id) && !(id in p.sent));
  const feed = added.length > 0 ? [...p.feed, ...added.map((id) => ({ from: 'own' as const, id }))] : p.feed;
  return [sent === p.sent && feed === p.feed ? p : { ...p, sent, feed }, out];
}

/** How many of the other person's translations played here, newest first, the echo guard compares against. */
const ECHO_RECENT = 2;

/**
 * The transcript guard across phones: what the microphone heard matches the other person's
 * translation that just played here (in this owner's language). Dropped as an echo.
 */
function echoOfIncoming(p: Pairing): PairTransition {
  const u = p.own.utterances.find((x) => x.id === inputOwnerId(p.own));
  if (u === undefined || u.routedBy === 'button' || (u.status !== 'capturing' && u.status !== 'translating')) return [p, []];
  const played = p.incoming.filter((t) => t.playback === 'playing' || t.playback === 'heard').slice(-ECHO_RECENT);
  if (!isEcho(u.source, played.map((t) => t.translation).join(' '), p.own.settings.echoMatch)) return [p, []];
  return own(p, { type: 'echoRecognised', utteranceId: u.id });
}

function chain(t: PairTransition, f: (p: Pairing) => PairTransition): PairTransition {
  const [next, more] = f(t[0]);
  return [next, [...t[1], ...more]];
}

/** Start this phone's session for the other person's language, once it is known. */
function begin(p: Pairing, peerLanguage: string): PairTransition {
  const who = people(p.setup, peerLanguage);
  if (!validPeople(who)) return fail({ ...p, peerLanguage }, p.role === 'host' ? 'unavailable' : 'down');
  const configured = chain([{ ...p, peerLanguage }, []], (x) => own(x, { type: 'configure', people: who, settings: p.setup.settings }));
  return chain(configured, (x) => own(x, { type: 'start' }));
}

// ---------------------------------------------------------------- the other phone's turns

function patchTurn(p: Pairing, id: string, f: (t: PeerTurn) => Partial<PeerTurn>): Pairing {
  return { ...p, incoming: p.incoming.map((t) => (t.id === id ? { ...t, ...f(t) } : t)) };
}

/** Their turns that never finished: dropped (messages sent while a socket was away are lost). */
function dropUnfinished(p: Pairing): PairTransition {
  const out: PairEffect[] = [];
  const incoming = p.incoming.map((t) => {
    if (t.state === 'done' || t.state === 'failed') return t;
    out.push(t.playback === 'playing' ? { type: 'finishIncoming', turn: t.id } : { type: 'dropIncoming', turn: t.id });
    return { ...t, state: 'failed' as const };
  });
  return [{ ...p, incoming }, out];
}

/** This phone's translations the other phone will never report on: count them as delivered. */
function settleDeliveries(p: Pairing): PairTransition {
  const waiting = p.own.utterances.filter((u) => u.status === 'queued' || u.status === 'speaking');
  return waiting.reduce<PairTransition>((t, u) => chain(t, (x) => own(x, { type: 'playbackFinished', utteranceId: u.id })), [p, []]);
}

// ---------------------------------------------------------------- endings

const problemOf: Record<RefusalCode, RoomProblem> = {
  taken: 'used',
  expired: 'expired',
  not_found: 'expired',
  host_gone: 'hostLeft',
  bad_key: 'down',
  bad_message: 'down',
  replaced: 'down',
  rate_limited: 'down',
};

/** This phone's session stops and the room is let go; the host keeps the conversation. */
function finish(p: Pairing, status: 'ended' | 'done' | 'failed', timing: PairTiming, ended?: EndReason): PairTransition {
  const [stopped, effects] = own(p, { type: 'stop' });
  const heard = archived(stopped);
  const keep = p.role === 'host' && heard.length > 0 && p.peerLanguage !== undefined;
  const next: Pairing = { ...stopped, status, ...(ended ? { ended } : {}), saved: keep, peerTalking: false };
  const out: PairEffect[] = [...effects, { type: 'stopIncoming' }, { type: 'closeRoom' }];
  if (keep) out.push({ type: 'archive', languages: { owner: p.setup.language, other: p.peerLanguage! }, utterances: heard });
  // The booth loop only when the room really ended; a host whose own link dropped goes back to Start.
  if (status === 'ended' && p.role === 'host' && ended !== 'lost') out.push({ type: 'timer', what: 'booth', ms: timing.boothSeconds * 1000, room: p.room });
  if (status === 'done') out.push({ type: 'timer', what: 'leave', ms: timing.doneMs, room: p.room });
  return [next, out];
}

function fail(p: Pairing, problem: RoomProblem): PairTransition {
  const [stopped, effects] = own(p, { type: 'stop' });
  // The audio was opened for this room even if the session never started.
  return [{ ...stopped, status: 'failed', problem }, [...effects, { type: 'own', effect: { type: 'closeAudio' } }, { type: 'stopIncoming' }, { type: 'closeRoom' }]];
}

/** Both sides of the conversation, in the order they were said: what History keeps. */
export function archived(p: Pairing): Utterance[] {
  return p.feed.flatMap((f): Utterance[] => {
    if (f.from === 'own') {
      const u = p.own.utterances.find((x) => x.id === f.id);
      return u && wasHeard(u) && u.speaker !== 'other' ? [{ ...u, speaker: 'owner' }] : [];
    }
    const t = p.incoming.find((x) => x.id === f.id);
    if (!t || t.source === '' || t.state === 'failed' || isPlaceholder(t.translation)) return [];
    return [{ id: t.id, speaker: 'other', routedBy: 'language', status: 'done', source: t.source, translation: t.translation }];
  });
}

// ---------------------------------------------------------------- the transition

function startRoom(p: Pairing): PairTransition {
  const next = freshRoom(p, 'creating');
  return [next, [{ type: 'openAudio' }, { type: 'createRoom', room: next.room }]];
}

function step(p: Pairing, e: PairEvent, timing: PairTiming): PairTransition {
  switch (e.type) {
    case 'pair':
      if (p.role !== 'host' || !(p.status === 'off' || p.status === 'failed' || p.status === 'ended')) return [p, []];
      return startRoom(p);

    case 'join': {
      if (p.role !== 'guest' || !(p.status === 'off' || p.status === 'failed')) return [p, []];
      return [freshRoom({ ...p, setup: { ...p.setup, language: e.language } }, 'opening'), [{ type: 'openAudio' }]];
    }

    case 'audioOpened':
      if (p.status !== 'opening' || p.code === undefined) return [p, []];
      return [{ ...p, status: 'connecting' }, [{ type: 'connectRoom', role: 'guest', code: p.code, language: p.setup.language }]];

    case 'audioFailed': {
      if (p.status !== 'opening' && p.status !== 'creating' && p.status !== 'connecting' && p.status !== 'waiting') return [p, []];
      // Host: the code made for this room is let go. Guest: no code was spent.
      // A guest's microphone that will not open is asked for again, whatever the reason.
      const [next, effects] = fail(p, e.kind === 'micDenied' || p.role === 'guest' ? 'micDenied' : 'unavailable');
      return p.status === 'opening' ? [next, effects] : [next, [{ type: 'endRoom' }, ...effects.filter((x) => x.type !== 'closeRoom')]];
    }

    case 'roomCreated': {
      if (p.status !== 'creating' || e.room !== p.room) return [p, []];
      const next: Pairing = { ...p, status: 'connecting', code: e.code, expiresAt: e.at + e.expiresIn * 1000 };
      return [
        next,
        [
          { type: 'connectRoom', role: 'host', code: e.code, language: p.setup.language },
          { type: 'timer', what: 'expiry', ms: e.expiresIn * 1000, room: p.room },
        ],
      ];
    }

    case 'roomFailed':
      if (p.status !== 'creating' || e.room !== p.room) return [p, []];
      return fail(p, 'unavailable');

    case 'welcome':
      if (e.rejoined) {
        if (p.status !== 'live' && p.status !== 'joined') return [p, []];
        return dropUnfinished({ ...p, link: 'up', peer: 'here' });
      }
      if (p.status !== 'connecting') return [p, []];
      if (p.role === 'host') return [{ ...p, status: 'waiting' }, []];
      if (e.peerLanguage === undefined) return fail(p, 'down');
      return chain([{ ...p, status: 'live' }, [{ type: 'cue', kind: 'joined' }]], (x) => begin(x, e.peerLanguage!));

    case 'peerJoined':
      if (p.role !== 'host' || p.status !== 'waiting') return [p, []];
      return chain(
        [{ ...p, status: 'joined' }, [{ type: 'cue', kind: 'joined' }, { type: 'timer', what: 'goLive', ms: timing.joinedMs, room: p.room }]],
        (x) => begin(x, e.peerLanguage),
      );

    case 'peerAway':
      if (p.status !== 'live' && p.status !== 'joined') return [p, []];
      return settleDeliveries({ ...p, peer: 'away', peerTalking: false });

    case 'peerBack':
      if (p.status !== 'live' && p.status !== 'joined') return [p, []];
      return dropUnfinished({ ...p, peer: 'here' });

    case 'ended':
      if (e.reason === 'expired') return p.status === 'waiting' || p.status === 'connecting' ? fail(p, 'expired') : [p, []];
      if (p.status === 'waiting' || p.status === 'connecting') {
        // Before anyone joined. The host lost its code: it gets a new one.
        return p.role === 'host' ? startRoom({ ...p, status: 'off' }) : fail(p, 'hostLeft');
      }
      if (p.status !== 'live' && p.status !== 'joined') return [p, []];
      return finish(p, 'ended', timing, e.reason);

    case 'refused':
      if (e.code === 'replaced') return [p, []];
      if (p.status === 'live' || p.status === 'joined') return finish(p, 'ended', timing, 'lost');
      if (p.status !== 'connecting' && p.status !== 'waiting') return [p, []];
      return fail(p, p.role === 'host' ? 'unavailable' : problemOf[e.code]);

    case 'dropped':
      if (p.status === 'waiting' || p.status === 'connecting') return p.role === 'host' ? startRoom({ ...p, status: 'off' }) : fail(p, e.offline ? 'offline' : 'down');
      if (p.status === 'live' || p.status === 'joined') return finish(p, 'ended', timing, 'lost');
      return [p, []];

    case 'rejoining':
      if (p.status !== 'live' && p.status !== 'joined') return [p, []];
      return [{ ...p, link: 'rejoining', peerTalking: false }, []];

    case 'lost':
      if (p.status !== 'live' && p.status !== 'joined') return [p, []];
      return finish(p, 'ended', timing, 'lost');

    case 'stop':
      if (p.status === 'live' || p.status === 'joined') {
        const [next, effects] = finish(p, p.role === 'guest' ? 'done' : 'ended', timing, p.role === 'host' ? 'host_stopped' : 'guest_stopped');
        // `end` goes before the socket is closed.
        return [next, [{ type: 'endRoom' }, ...effects.filter((x) => x.type !== 'closeRoom')]];
      }
      return step(p, { type: 'cancel' }, timing);

    case 'cancel':
      if (p.role !== 'host') return [p, []];
      if (p.status === 'creating' || p.status === 'connecting' || p.status === 'waiting') {
        const [next, effects] = fail(p, 'unavailable');
        return [{ ...next, status: 'off', problem: undefined }, [{ type: 'endRoom' }, ...effects.filter((x) => x.type !== 'closeRoom')]];
      }
      if (p.status === 'ended' || p.status === 'failed') return [{ ...p, status: 'off', room: p.room + 1, problem: undefined }, []];
      return [p, []];

    case 'continue':
      if (p.role !== 'guest' || p.status !== 'ended') return [p, []];
      return [{ ...p, status: 'done' }, [{ type: 'timer', what: 'leave', ms: timing.doneMs, room: p.room }]];

    case 'timer':
      if (e.room !== p.room) return [p, []];
      switch (e.what) {
        case 'expiry':
          return p.status === 'waiting' || p.status === 'connecting' ? fail(p, 'expired') : [p, []];
        case 'goLive':
          return p.status === 'joined' ? [{ ...p, status: 'live' }, []] : [p, []];
        case 'booth':
          return p.status === 'ended' ? startRoom(p) : [p, []];
        case 'leave':
          return p.status === 'done' ? [p, [{ type: 'leave', language: p.setup.language }]] : [p, []];
      }
      return [p, []];

    case 'soundBlocked':
      return [p.soundBlocked ? p : { ...p, soundBlocked: true }, []];

    case 'soundOn':
      return [{ ...p, soundBlocked: false }, [{ type: 'unlockSound' }]];

    case 'pressTalk':
      return p.status === 'live' ? own(p, { type: 'pressTalk', speaker: 'owner' }) : [p, []];

    case 'releaseTalk':
      return own(p, { type: 'releaseTalk', speaker: 'owner' });

    case 'own':
      return own(p, e.event);

    // ---------------------------------------------------------- relayed from the other phone

    case 'peerSpeaking':
      return [p.peerTalking === e.talking ? p : { ...p, peerTalking: e.talking }, []];

    case 'peerTurn': {
      if (p.status !== 'live' && p.status !== 'joined') return [p, []];
      const t = p.incoming.find((x) => x.id === e.turn);
      if (t === undefined) {
        // A turn first heard of past its start still counts; one that already ended has nothing to show.
        if (e.state === 'done' || e.state === 'failed') return [p, []];
        const turn: PeerTurn = { id: e.turn, state: e.state, source: '', translation: '', audio: false, playback: 'none', progress: 0 };
        return [{ ...p, incoming: [...p.incoming, turn], feed: [...p.feed, { from: 'peer', id: e.turn }] }, []];
      }
      if (RANK[e.state] <= RANK[t.state] || t.state === 'done' || t.state === 'failed') return [p, []];
      const next = patchTurn(p, t.id, () => ({ state: e.state }));
      if (e.state === 'done' && t.playback === 'playing') return [next, [{ type: 'finishIncoming', turn: t.id }]];
      if (e.state === 'failed') return [next, [t.playback === 'playing' ? { type: 'finishIncoming', turn: t.id } : { type: 'dropIncoming', turn: t.id }]];
      return [next, []];
    }

    case 'peerCaption': {
      const t = p.incoming.find((x) => x.id === e.turn);
      if (t === undefined || t.state === 'failed') return [p, []];
      return [patchTurn(p, t.id, (x) => (e.side === 'source' ? { source: x.source + e.delta } : { translation: x.translation + e.delta })), []];
    }

    case 'peerAudio': {
      // Audio belongs to the sender's latest turn that is ready and not finished.
      const t = [...p.incoming].reverse().find((x) => x.state === 'ready');
      if (t === undefined) return [p, []];
      const next = t.audio ? p : patchTurn(p, t.id, () => ({ audio: true }));
      return [next, [t.playback === 'playing' ? { type: 'enqueueIncoming', turn: t.id, pcm: e.pcm } : { type: 'keepIncoming', turn: t.id, pcm: e.pcm }]];
    }

    case 'peerPlayback': {
      const id = ownId(e.turn);
      if (p.sent[id] === undefined) return [p, []];
      const next = { ...p, delivery: { ...p.delivery, [id]: { state: e.state, progress: e.state === 'heard' ? 1 : (e.progress ?? 0) } } };
      if (e.state === 'playing') return own(next, { type: 'playbackStarted', utteranceId: id });
      if (e.state === 'heard') return own(next, { type: 'playbackFinished', utteranceId: id });
      return [next, []];
    }

    // ---------------------------------------------------------- this phone's speaker

    case 'incomingProgress': {
      const t = p.incoming.find((x) => x.id === e.turn);
      if (t?.playback !== 'playing' || e.progress <= t.progress) return [p, []];
      return [patchTurn(p, t.id, () => ({ progress: e.progress })), [send({ type: 'playback', turn: t.id, state: 'playing', progress: e.progress })]];
    }

    case 'incomingFinished': {
      const t = p.incoming.find((x) => x.id === e.turn);
      if (t?.playback !== 'playing') return [p, []];
      return [patchTurn(p, t.id, () => ({ playback: 'heard', progress: 1 })), [send({ type: 'playback', turn: t.id, state: 'heard' })]];
    }
  }
}

/** Their next translation, if it may play now: one at a time, in order, never while the owner talks. */
function release(p: Pairing): PairTransition {
  if (p.status !== 'live' || p.link !== 'up') return [p, []];
  const talking = ownTalking(p);
  let next = p;
  const out: PairEffect[] = [];
  // Held because the owner is talking: tell their phone it waits.
  if (talking) {
    for (const t of next.incoming) {
      if (t.audio && t.playback === 'none' && t.state !== 'failed') {
        next = patchTurn(next, t.id, () => ({ playback: 'queued' }));
        out.push(send({ type: 'playback', turn: t.id, state: 'queued' }));
      }
    }
    return [next, out];
  }
  if (playingTurn(next) !== undefined) return [next, out];
  const t = next.incoming.find((x) => x.audio && (x.playback === 'none' || x.playback === 'queued') && x.state !== 'failed');
  if (t === undefined) return [next, out];
  next = patchTurn(next, t.id, () => ({ playback: 'playing', progress: 0 }));
  out.push({ type: 'playIncoming', turn: t.id }, send({ type: 'playback', turn: t.id, state: 'playing', progress: 0 }));
  if (t.state === 'done' || t.state === 'failed') out.push({ type: 'finishIncoming', turn: t.id });
  return [next, out];
}

/**
 * The single transition. After each step, what is derived is brought in line, once, here: their
 * next translation plays when it may, the microphone is muted while it plays (and whenever nobody
 * is there to hear), `speaking` follows the owner, the screen stays awake in a room, and the live
 * cue sounds once this phone can be heard.
 */
export function transition(p: Pairing, e: PairEvent, timing: PairTiming): PairTransition {
  let t = step(p, e, timing);
  t = chain(t, release);
  t = chain(t, (q) => {
    const muted = q.status !== 'live' || q.link !== 'up' || q.peer !== 'here' || playingTurn(q) !== undefined;
    return muted === !!q.own.muted ? [q, []] : own(q, { type: 'mute', muted });
  });
  // Muting may have ended the owner's turn, and with it the hold: release again.
  t = chain(t, release);
  t = chain(t, (q) => {
    const talking = ownTalking(q) && q.peer === 'here' && q.link === 'up';
    if (talking === q.speaking) return [q, []];
    // Once the room is over there is nobody to tell.
    return [{ ...q, speaking: talking }, q.status === 'live' ? [send({ type: 'speaking', talking })] : []];
  });
  t = chain(t, (q) => {
    if (q.cued || q.status !== 'live' || q.own.connection !== 'open') return [q, []];
    return [{ ...q, cued: true }, [{ type: 'cue', kind: 'live' }]];
  });
  const [next, effects] = t;
  if (awake(p) !== awake(next)) effects.push({ type: 'keepAwake', on: awake(next) });
  return [next, effects];
}
