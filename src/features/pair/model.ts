// What the paired screens show, derived from the pairing (core/pairing) as plain data. Pure: the
// DOM screens (./dom) render from these values and nothing else, and every rule here is tested
// with plain pairings. Copy is named by key (`GuestKey`, config/pair-copy.ts); the screens look it
// up in the reader's language.

import { JOIN_PATH } from '@/config/pairing';
import { browserLanguage, guestCopy, type GuestKey } from '@/config/pair-copy';
import { LANGUAGES, nativeName } from '@/config/languages';
import { ownTalking, playingTurn, type PairRole, type Pairing, type PeerTurn } from '@/core/pairing';
import { capturingUtterance, isPlaceholder, sameLanguage, type SessionErrorKind, type Utterance } from '@/core/session';

// ---------------------------------------------------------------- the paired conversation

/** Where one card of the feed is, seen from this phone (the design's states). */
export type FeedState =
  // This phone's owner's: their words arriving, being translated, waiting on the other phone,
  // playing there, heard there; `sent` when nothing more will be said about it.
  | 'live'
  | 'translating'
  | 'waitingThem'
  | 'delivering'
  | 'heard'
  | 'sent'
  // The other person's: words arriving (greyed while this owner talks), waiting its turn,
  // playing here, done.
  | 'queuedLive'
  | 'queued'
  | 'playing'
  | 'done';

export type FeedCard = {
  id: string;
  mine: boolean;
  state: FeedState;
  source: string;
  translation: string;
  /** 0..1: of its playback here (theirs) or on the other phone (mine). */
  progress: number;
  /** Theirs, waiting: how many more wait behind it, collapsed into a shelf. */
  shelf?: number;
};

export type PeerSignal = 'connected' | 'reconnecting' | 'ended';
export type PairPhase = 'listening' | 'hearing' | 'translating' | 'speaking';

export type PairTalkModel = {
  role: PairRole;
  /** This phone's owner's language, and the other person's. */
  you: string;
  them: string;
  peer: PeerSignal;
  phase: PairPhase;
  /** Whose side the light comes from. */
  who: 'you' | 'them';
  /** The line under the ring, as a copy key; none once it has ended. */
  status?: GuestKey;
  /** Newest last, at most `FEED_CARDS`. */
  cards: FeedCard[];
  /** Under the feed: this phone was locked (its link dropped), or theirs dropped. */
  aside?: 'locked' | 'peerAway';
  /** The browser kept playback locked: "Tap to turn on sound". */
  sound: boolean;
  /** It is over: the host's end card (saved or not), or the guest's "They ended the conversation". */
  end?: { kind: 'host'; saved: boolean } | { kind: 'guest' };
  /** This phone's interpreter could not carry on. */
  problem?: SessionErrorKind;
  handsFree: boolean;
  held: boolean;
  canHold: boolean;
  /** The ring is at rest (connecting, reconnecting, ended). */
  rest: boolean;
};

/** The design's feed: the newest few cards, older ones fading off the top. */
export const FEED_CARDS = 4;

const shownSource = (t: PeerTurn) => t.source !== '' || t.translation !== '';

function mineState(p: Pairing, u: Utterance): FeedState {
  if (u.status === 'capturing') return 'live';
  const d = p.delivery[u.id];
  if (d?.state === 'heard') return 'heard';
  if (d?.state === 'playing') return 'delivering';
  if (d?.state === 'queued') return 'waitingThem';
  if (u.status === 'translating' || u.status === 'queued' || u.status === 'speaking') return p.status === 'live' ? 'translating' : 'sent';
  return 'sent';
}

function theirState(t: PeerTurn, talking: boolean): FeedState {
  if (t.playback === 'playing') return 'playing';
  if (t.playback === 'heard' || (t.state === 'done' && !t.audio)) return 'done';
  if (t.state === 'talking') return talking ? 'queuedLive' : 'live';
  return talking || t.playback === 'queued' ? 'queued' : 'translating';
}

/** Whether one of this phone's utterances belongs in the feed: the owner's, said, and not dropped. */
function ownShown(p: Pairing, u: Utterance): boolean {
  return u.source !== '' && u.status !== 'failed' && u.speaker !== 'other' && !isPlaceholder(u.translation) && p.sent[u.id]?.state !== 'failed';
}

export function feedCards(p: Pairing): FeedCard[] {
  const talking = ownTalking(p);
  const all = p.feed.flatMap((f): FeedCard[] => {
    if (f.from === 'own') {
      const u = p.own.utterances.find((x) => x.id === f.id);
      if (!u || !ownShown(p, u)) return [];
      const d = p.delivery[u.id];
      return [{ id: `own-${u.id}`, mine: true, state: mineState(p, u), source: u.source, translation: u.translation, progress: d?.progress ?? 0 }];
    }
    const t = p.incoming.find((x) => x.id === f.id);
    if (!t || t.state === 'failed') return [];
    // Nothing to read yet while this owner talks: it may be this owner's own voice, heard by the
    // other phone. It shows once its words arrive.
    if (!shownSource(t) && talking) return [];
    return [{ id: `peer-${t.id}`, mine: false, state: theirState(t, talking), source: t.source, translation: t.translation, progress: t.progress }];
  });
  const shown = all.slice(-FEED_CARDS);
  // Waiting ones stack: the first as a greyed card, the rest as a shelf under it.
  const waiting = shown.filter((c) => !c.mine && (c.state === 'queued' || c.state === 'queuedLive'));
  if (waiting.length < 2) return shown;
  const rest = new Set(waiting.slice(1));
  return shown.filter((c) => !rest.has(c)).map((c) => (c === waiting[0] ? { ...c, shelf: waiting.length - 1 } : c));
}

/** The paired conversation, or undefined before it is live (and after the guest says goodbye). */
export function pairTalkModel(p: Pairing): PairTalkModel | undefined {
  if (p.status !== 'live' && p.status !== 'ended') return undefined;
  const ended = p.status === 'ended';
  const cards = ended ? [] : feedCards(p);
  const away = p.link !== 'up' || p.peer !== 'here';
  const connecting = p.own.connection === 'connecting' || p.own.connection === 'reconnecting';
  const playing = playingTurn(p);
  const capturing = capturingUtterance(p.own);
  const theyTalk = p.peerTalking || p.incoming.some((t) => t.state === 'talking' && shownSource(t));
  const translating =
    p.own.utterances.some((u) => u.status === 'translating' && ownShown(p, u)) || cards.some((c) => !c.mine && c.state === 'translating');

  let phase: PairPhase = 'listening';
  let who: 'you' | 'them' = 'you';
  let status: GuestKey | undefined = 'listening';
  if (ended) status = undefined;
  else if (away) status = 'reconnecting';
  else if (connecting || p.own.connection === 'idle') status = 'joining';
  else if (p.own.connection === 'failed') status = undefined;
  else if (ownTalking(p) && (capturing === undefined || capturing.speaker !== 'other')) [phase, who, status] = ['hearing', 'you', 'hearingYou'];
  else if (playing) [phase, who, status] = ['speaking', 'them', 'speakingToYou'];
  else if (theyTalk) [phase, who, status] = ['hearing', 'them', 'theyreTalking'];
  else if (translating) [phase, status] = ['translating', 'translating'];
  else if (cards.some((c) => c.state === 'delivering')) status = 'playingThere';

  const handsFree = p.own.settings.detection === 'auto';
  return {
    role: p.role,
    you: p.setup.language,
    them: p.peerLanguage ?? '',
    peer: ended ? 'ended' : away ? 'reconnecting' : 'connected',
    phase,
    who,
    ...(status ? { status } : {}),
    cards,
    ...(!ended && p.link !== 'up' ? { aside: 'locked' as const } : !ended && p.peer !== 'here' ? { aside: 'peerAway' as const } : {}),
    sound: p.soundBlocked && !ended,
    ...(ended ? { end: p.role === 'host' ? { kind: 'host' as const, saved: p.saved } : { kind: 'guest' as const } } : {}),
    ...(!ended && p.own.connection === 'failed' ? { problem: p.own.error?.kind ?? 'socket' } : {}),
    handsFree,
    held: p.own.held === 'owner',
    canHold: !ended && !away && p.own.connection === 'open' && !handsFree,
    rest: ended || away || connecting,
  };
}

// ---------------------------------------------------------------- the host's code

export type HostPairModel =
  /** The code to scan. `making` until the room is ready; `url` is what the QR says. */
  | { view: 'code'; state: 'making' | 'waiting' | 'expired' | 'unavailable' | 'micDenied'; url?: string; expiresAt?: number }
  /** "They're in". */
  | { view: 'joined'; them: string }
  | { view: 'talk'; talk: PairTalkModel };

/** What the QR code says: the app's origin, the join path, the code, and the host's language. */
export function joinUrl(origin: string, code: string, hostLanguage: string): string {
  return `${origin}${JOIN_PATH}${encodeURIComponent(code)}?host=${encodeURIComponent(hostLanguage)}`;
}

/** The host's pairing screens, or undefined when the host is not pairing. */
export function hostPairModel(p: Pairing, origin: string): HostPairModel | undefined {
  const talk = pairTalkModel(p);
  if (talk) return { view: 'talk', talk };
  switch (p.status) {
    case 'off':
      return undefined;
    case 'joined':
      return { view: 'joined', them: p.peerLanguage ?? '' };
    case 'waiting':
      return { view: 'code', state: 'waiting', url: joinUrl(origin, p.code!, p.setup.language), ...(p.expiresAt ? { expiresAt: p.expiresAt } : {}) };
    case 'failed':
      return { view: 'code', state: p.problem === 'expired' ? 'expired' : p.problem === 'micDenied' ? 'micDenied' : 'unavailable' };
    default:
      return { view: 'code', state: 'making' };
  }
}

// ---------------------------------------------------------------- the guest's page

export type GuestView = 'pick' | 'joining' | 'micDenied' | 'used' | 'expired' | 'hostLeft' | 'done';

export type GuestChoice = { value: string; label: string; detail?: string; disabled?: string };

export type GuestPageModel = {
  view: GuestView;
  /** The language the page speaks (the guest's pick, or the browser's). */
  copy: string;
  /** Their pick. */
  language: string;
  /** The host's language, when the QR named it. */
  host?: string;
  /** The host's language as the guest would read it, in its own name. */
  hostName?: string;
  choices: GuestChoice[];
  /** The conversation, once live. */
  talk?: PairTalkModel;
};

/** Every language by its own name, sorted by it; the host's (any variant) greyed out with why. */
export function guestChoices(host: string | undefined, copy: string): GuestChoice[] {
  const { t } = guestCopy(copy);
  return LANGUAGES.map((l) => {
    const label = nativeName(l.code);
    return {
      value: l.code,
      label,
      ...(label !== l.name ? { detail: l.name } : {}),
      ...(host !== undefined && sameLanguage(l.code, host) ? { disabled: t('theySpeakThis') } : {}),
    };
  }).sort((a, b) => a.label.localeCompare(b.label));
}

/** The guest's first pick: the browser's language if Vorp has it and the host does not speak it. */
export function guestLanguage(host: string | undefined, asked: readonly string[]): string {
  const codes = LANGUAGES.map((l) => l.code).filter((c) => host === undefined || !sameLanguage(c, host));
  return browserLanguage(codes, asked) ?? (host !== undefined && sameLanguage(host, 'en') ? 'es' : 'en');
}

const GUEST_PROBLEM: Record<NonNullable<Pairing['problem']>, GuestView> = {
  micDenied: 'micDenied',
  used: 'used',
  expired: 'expired',
  hostLeft: 'hostLeft',
  // No copy of its own (the design has none): the way on is the same, a new code.
  unavailable: 'hostLeft',
};

export function guestPageModel(p: Pairing, pick: string, host: string | undefined): GuestPageModel {
  const talk = pairTalkModel(p);
  let view: GuestView = 'pick';
  if (p.status === 'opening' || p.status === 'connecting') view = 'joining';
  else if (p.status === 'failed') view = GUEST_PROBLEM[p.problem ?? 'unavailable'];
  else if (p.status === 'done') view = 'done';
  const language = p.status === 'off' ? pick : p.setup.language;
  return {
    view,
    copy: language,
    language,
    ...(host ? { host, hostName: nativeName(host) } : {}),
    choices: guestChoices(host, language),
    ...(talk ? { talk } : {}),
  };
}
