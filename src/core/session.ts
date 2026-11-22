// The conversation as one state value and one pure transition function.
// No React, no I/O, no imports from other folders.

export type ParticipantId = string;
export type UtteranceId = string;

export type Participant = {
  id: ParticipantId;
  name: string;
  /** BCP-47 code from the languages table. */
  language: string;
  /** Voice name from the voices table. One interpreter voice is used for now. */
  voice: string;
};

export type UtteranceStatus = 'capturing' | 'translating' | 'queued' | 'speaking' | 'done' | 'failed';

/** What decided who spoke: a held talk button, or the language the speech was detected in. */
export type RoutedBy = 'button' | 'language';

export type Utterance = {
  id: UtteranceId;
  /** Unknown until the detected language (or a held button) names the speaker. */
  speakerId?: ParticipantId;
  routedBy: RoutedBy;
  /** BCP-47 code the input transcript was detected in, when the server reports one. */
  language?: string;
  status: UtteranceStatus;
  /** What the speaker said (input transcript). */
  source: string;
  /** What the interpreter said (output transcript). */
  translation: string;
  error?: string;
};

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'failed';

/**
 * How turns end. 'auto': the server's voice activity detection ends turns and a held button
 * overrides it. 'manual': push-to-talk only, the client marks every turn (noisy rooms).
 */
export type TurnDetection = 'auto' | 'manual';

/**
 * A row of the overlap policy table: what new speech does to a translation being spoken.
 * Only 'queue' exists; ducking and barge-in become further values and rows.
 */
export type OverlapPolicy = { id: string; speechDuringPlayback: 'queue' };

/** Data from `src/config`, handed to the reducer; core never imports config. */
export type SessionSettings = {
  detection: TurnDetection;
  overlap: OverlapPolicy;
  /** Emergency flag: stop sending the microphone while Vorp speaks. */
  pauseMicWhileSpeaking: boolean;
  /** Share of a captured transcript's words found in the spoken translation that marks it an echo, 0..1. */
  echoMatch: number;
};

export type SessionErrorKind = 'micDenied' | 'mic' | 'token' | 'socket' | 'timeLimit';
export type SessionError = { kind: SessionErrorKind; message: string };

export type Session = {
  participants: Participant[];
  settings: SessionSettings;
  connection: ConnectionStatus;
  /** Oldest first. */
  utterances: Utterance[];
  /**
   * Utterances whose turn has been sent and whose response has not completed, oldest first.
   * The model answers turns in order, so the head owns every incoming response message and
   * the tail is the newest input.
   */
  awaitingResponse: UtteranceId[];
  /** The participant holding a talk button, if any. */
  held?: ParticipantId;
  nextId: number;
  error?: SessionError;
};

/** Audio as 16-bit PCM samples; the effect runner moves it, the reducer only routes it. */
export type Pcm = Int16Array;

export type SessionEvent =
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'connected' }
  | { type: 'connectFailed'; kind: 'token' | 'socket'; message: string }
  | { type: 'connectionLost'; kind: 'socket' | 'timeLimit'; message: string }
  | { type: 'audioFailed'; kind: 'micDenied' | 'mic'; message: string }
  | { type: 'pressTalk'; speakerId: ParticipantId }
  | { type: 'releaseTalk'; speakerId: ParticipantId }
  | { type: 'speechStarted' }
  | { type: 'speechEnded' }
  | { type: 'inputTranscript'; text: string; language?: string; finished?: boolean }
  | { type: 'outputTranscript'; text: string; language?: string }
  /** The interpreter reports the language of the utterance it is answering. */
  | { type: 'sourceLanguage'; language: string }
  | { type: 'outputAudio'; pcm: Pcm }
  | { type: 'interrupted' }
  | { type: 'turnComplete' }
  | { type: 'playbackStarted'; utteranceId: UtteranceId }
  | { type: 'playbackFinished'; utteranceId: UtteranceId };

export type Effect =
  | { type: 'connect'; participants: Participant[]; settings: SessionSettings }
  | { type: 'disconnect' }
  | { type: 'openAudio' }
  | { type: 'closeAudio' }
  /** Start / stop sending microphone audio to the translator. Derived, see `micOpen`. */
  | { type: 'startCapture' }
  | { type: 'stopCapture' }
  | { type: 'beginTurn' }
  | { type: 'endTurn' }
  | { type: 'enqueuePlayback'; utteranceId: UtteranceId; pcm: Pcm }
  | { type: 'finishPlayback'; utteranceId: UtteranceId }
  | { type: 'stopPlayback' };

export type Transition = [Session, Effect[]];

export function initialSession(participants: Participant[], settings: SessionSettings): Session {
  return { participants, settings, connection: 'idle', utterances: [], awaitingResponse: [], nextId: 1 };
}

export const ACTIVE_STATUSES: readonly UtteranceStatus[] = ['capturing', 'translating', 'queued', 'speaking'];

export function capturingUtterance(s: Session): Utterance | undefined {
  return s.utterances.find((u) => u.status === 'capturing');
}

/** Translations on their way out, in the order they will be spoken. */
export function playbackQueue(s: Session): Utterance[] {
  return s.utterances.filter((u) => u.status === 'translating' || u.status === 'queued' || u.status === 'speaking');
}

/** Whether microphone audio should be flowing to the translator. */
export function micOpen(s: Session): boolean {
  if (s.connection !== 'open') return false;
  if (s.held !== undefined) return true;
  if (s.settings.detection === 'manual') return false;
  if (s.settings.pauseMicWhileSpeaking && s.utterances.some((u) => u.status === 'speaking')) return false;
  return true;
}

/** The languages an utterance is being translated into. */
export function targetLanguages(s: Session, u: Utterance): string[] {
  const from = s.participants.find((p) => p.id === u.speakerId)?.language;
  if (from === undefined) return [];
  return [...new Set(s.participants.map((p) => p.language).filter((l) => !sameLanguage(l, from)))];
}

/** BCP-47 match, falling back to the primary subtag ('fr-FR' matches 'fr'). */
export function sameLanguage(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x === y || x.split('-')[0] === y.split('-')[0];
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** True when most of the captured words appear in what Vorp is speaking. */
export function isEcho(captured: string, spoken: string, threshold: number): boolean {
  const heard = words(captured);
  if (heard.length < 2) return false;
  const said = new Set(words(spoken));
  return heard.filter((w) => said.has(w)).length / heard.length >= threshold;
}

function headId(s: Session): UtteranceId | undefined {
  return s.awaitingResponse[0];
}

/** The utterance new input transcript belongs to: the one capturing, else the newest sent turn. */
function inputOwnerId(s: Session): UtteranceId | undefined {
  return capturingUtterance(s)?.id ?? s.awaitingResponse[s.awaitingResponse.length - 1];
}

function patch(s: Session, id: UtteranceId, f: (u: Utterance) => Partial<Utterance>): Session {
  return { ...s, utterances: s.utterances.map((u) => (u.id === id ? { ...u, ...f(u) } : u)) };
}

function find(s: Session, id: UtteranceId | undefined): Utterance | undefined {
  return id === undefined ? undefined : s.utterances.find((u) => u.id === id);
}

function openUtterance(s: Session, speakerId: ParticipantId | undefined, routedBy: RoutedBy): [Session, UtteranceId] {
  const id = `u${s.nextId}`;
  const utterance: Utterance = { id, speakerId, routedBy, status: 'capturing', source: '', translation: '' };
  return [
    { ...s, nextId: s.nextId + 1, utterances: [...s.utterances, utterance], awaitingResponse: [...s.awaitingResponse, id] },
    id,
  ];
}

/** Fail every utterance that is still in flight, for example when the conversation stops. */
function failInFlight(s: Session, error: string): Session {
  return {
    ...s,
    held: undefined,
    awaitingResponse: [],
    utterances: s.utterances.map((u) => (ACTIVE_STATUSES.includes(u.status) ? { ...u, status: 'failed', error } : u)),
  };
}

/** Ends the conversation's resources; the microphone stop is added by `transition`. */
const RELEASE: Effect[] = [{ type: 'stopPlayback' }, { type: 'disconnect' }, { type: 'closeAudio' }];

/** Server output for the head arrived, so the server has ended that turn. */
function turnEnded(s: Session, u: Utterance): Session {
  return u.status === 'capturing' ? patch(s, u.id, () => ({ status: 'translating' })) : s;
}

/** Assign the speaker from the detected input language. A held button always wins. */
function routeByInput(u: Utterance, participants: Participant[], language: string | undefined): Partial<Utterance> {
  if (language === undefined || u.routedBy === 'button') return {};
  const speaker = participants.find((p) => sameLanguage(p.language, language));
  return { language, speakerId: speaker?.id ?? u.speakerId };
}

/**
 * Fallback routing from the output language: with no input language, the speaker is the only
 * participant whose language differs from the translation's (exact for two people).
 */
function routeByOutput(u: Utterance, participants: Participant[], language: string | undefined): Partial<Utterance> {
  if (language === undefined || u.routedBy === 'button' || u.speakerId !== undefined) return {};
  const others = participants.filter((p) => !sameLanguage(p.language, language));
  return others.length === 1 ? { speakerId: others[0].id } : {};
}

function step(s: Session, e: SessionEvent): Transition {
  switch (e.type) {
    case 'start':
      if (s.connection === 'connecting' || s.connection === 'open' || s.connection === 'reconnecting') return [s, []];
      // openAudio runs inside the user gesture that sent 'start', which browsers require.
      return [
        { ...s, connection: 'connecting', error: undefined },
        [{ type: 'openAudio' }, { type: 'connect', participants: s.participants, settings: s.settings }],
      ];

    case 'stop':
      return [{ ...failInFlight(s, 'stopped'), connection: 'idle' }, RELEASE];

    case 'connected':
      if (s.connection !== 'connecting' && s.connection !== 'reconnecting') return [s, []];
      return [{ ...s, connection: 'open', error: undefined }, []];

    case 'connectFailed':
      if (s.connection !== 'connecting' && s.connection !== 'reconnecting') return [s, []];
      return [{ ...s, connection: 'failed', error: { kind: e.kind, message: e.message } }, []];

    case 'connectionLost': {
      // Only an open connection reconnects by itself; a failed reconnect ends in 'failed'.
      if (s.connection !== 'open') return [s, []];
      // In-flight responses do not survive the old connection; audio already queued still plays.
      const partial = s.awaitingResponse.filter((id) => {
        const status = find(s, id)?.status;
        return status === 'queued' || status === 'speaking';
      });
      const lost = s.utterances.filter((u) => u.status === 'capturing' || u.status === 'translating').map((u) => u.id);
      const next = lost.reduce((acc, id) => patch(acc, id, () => ({ status: 'failed', error: e.message })), s);
      return [
        { ...next, connection: 'reconnecting', awaitingResponse: [], held: undefined, error: { kind: e.kind, message: e.message } },
        [
          ...partial.map((utteranceId) => ({ type: 'finishPlayback', utteranceId }) as const),
          { type: 'connect', participants: s.participants, settings: s.settings },
        ],
      ];
    }

    case 'audioFailed': {
      // Without a microphone there is no conversation: end it and say why.
      if (s.connection === 'idle') return [s, []];
      return [
        { ...failInFlight(s, e.message), connection: 'failed', error: { kind: e.kind, message: e.message } },
        RELEASE,
      ];
    }

    case 'pressTalk': {
      if (s.connection !== 'open' || s.held !== undefined) return [s, []];
      if (!s.participants.some((p) => p.id === e.speakerId)) return [s, []];
      const current = capturingUtterance(s);
      // A held button overrides detection: it takes over the speech being captured, if any.
      const [next] =
        current === undefined
          ? openUtterance(s, e.speakerId, 'button')
          : [patch(s, current.id, () => ({ speakerId: e.speakerId, routedBy: 'button' as const }))];
      return [{ ...next, held: e.speakerId }, [{ type: 'beginTurn' }]];
    }

    case 'releaseTalk': {
      if (s.held !== e.speakerId) return [s, []];
      const u = capturingUtterance(s);
      const released = { ...s, held: undefined };
      const next = u === undefined ? released : patch(released, u.id, () => ({ status: 'translating' }));
      return [next, [{ type: 'endTurn' }]];
    }

    case 'speechStarted': {
      if (s.connection !== 'open' || s.settings.detection !== 'auto' || capturingUtterance(s) !== undefined) return [s, []];
      const [next] = openUtterance(s, s.held, s.held === undefined ? 'language' : 'button');
      return [next, []];
    }

    case 'speechEnded': {
      const u = capturingUtterance(s);
      // A held button ends its own turn on release.
      if (u === undefined || s.held !== undefined) return [s, []];
      return [patch(s, u.id, () => ({ status: 'translating' })), []];
    }

    case 'inputTranscript': {
      let next = s;
      let id = inputOwnerId(s);
      if (id === undefined) {
        // Hands-free speech the server detected before (or without) a speech-start signal.
        if (s.connection !== 'open' || s.settings.detection !== 'auto') return [s, []];
        [next, id] = openUtterance(s, s.held, s.held === undefined ? 'language' : 'button');
      }
      next = patch(next, id, (u) => ({ source: u.source + e.text, ...routeByInput(u, s.participants, e.language) }));
      const u = find(next, id)!;
      if (u.routedBy === 'language' && (u.status === 'capturing' || u.status === 'translating')) {
        const spoken = next.utterances
          .filter((o) => o.id !== u.id && (o.status === 'queued' || o.status === 'speaking'))
          .map((o) => o.translation)
          .join(' ');
        if (isEcho(u.source, spoken, s.settings.echoMatch)) {
          // Vorp heard itself. Stay in awaitingResponse so the model's reply to it is dropped too.
          return [patch(next, id, () => ({ status: 'failed', error: 'echo' })), []];
        }
      }
      if (e.finished && u.status === 'capturing' && s.held === undefined) {
        next = patch(next, id, () => ({ status: 'translating' }));
      }
      return [next, []];
    }

    case 'outputTranscript': {
      const u = find(s, headId(s));
      if (u === undefined || u.status === 'failed') return [s, []];
      const next = patch(turnEnded(s, u), u.id, (v) => ({
        translation: v.translation + e.text,
        ...routeByOutput(v, s.participants, e.language),
      }));
      return [next, []];
    }

    case 'sourceLanguage': {
      // Part of the model's reply, so it belongs to the utterance being answered.
      const u = find(s, headId(s));
      if (u === undefined || u.status === 'failed') return [s, []];
      return [patch(s, u.id, (v) => routeByInput(v, s.participants, e.language)), []];
    }

    case 'outputAudio': {
      const u = find(s, headId(s));
      if (u === undefined || u.status === 'failed') return [s, []];
      const next = u.status === 'capturing' || u.status === 'translating' ? patch(s, u.id, () => ({ status: 'queued' })) : s;
      return [next, [{ type: 'enqueuePlayback', utteranceId: u.id, pcm: e.pcm }]];
    }

    case 'interrupted': {
      // Only possible under a barge-in policy or a client message. Under 'queue' the audio
      // already received still plays; turnComplete follows and settles the utterance.
      const u = find(s, headId(s));
      if (u === undefined) return [s, []];
      return [patch(s, u.id, () => ({ error: 'interrupted' })), []];
    }

    case 'turnComplete': {
      const u = find(s, headId(s));
      if (u === undefined) return [s, []];
      const rest = { ...s, awaitingResponse: s.awaitingResponse.slice(1) };
      switch (u.status) {
        case 'failed':
          return [rest, []];
        case 'queued':
        case 'speaking':
          return [rest, [{ type: 'finishPlayback', utteranceId: u.id }]];
        case 'capturing':
          // A held or manual turn ends on release: keep waiting for the reply to it.
          if (s.held !== undefined || s.settings.detection === 'manual') return [s, []];
          return [patch(rest, u.id, () => ({ status: 'failed', error: 'no translation' })), []];
        case 'translating': {
          // The model answered without audio (for example, it heard nothing).
          const status = u.translation === '' ? 'failed' : 'done';
          const error = status === 'failed' ? (u.error ?? 'no translation') : u.error;
          return [patch(rest, u.id, () => ({ status, error })), []];
        }
        default:
          return [s, []];
      }
    }

    case 'playbackStarted': {
      const u = find(s, e.utteranceId);
      if (u === undefined || u.status !== 'queued') return [s, []];
      return [patch(s, u.id, () => ({ status: 'speaking' })), []];
    }

    case 'playbackFinished': {
      const u = find(s, e.utteranceId);
      if (u === undefined || (u.status !== 'queued' && u.status !== 'speaking')) return [s, []];
      return [patch(s, u.id, () => ({ status: 'done' })), []];
    }
  }
}

/**
 * The single transition. The microphone is derived from state (`micOpen`), so starting and
 * stopping it is computed here once instead of in every case: stops go first, starts last.
 */
export function transition(s: Session, e: SessionEvent): Transition {
  const [next, effects] = step(s, e);
  const was = micOpen(s);
  const now = micOpen(next);
  if (was === now) return [next, effects];
  if (now) return [next, [...effects, { type: 'startCapture' }]];
  // Pausing a hands-free stream on an open connection: flush the server's cached audio.
  const flush =
    next.connection === 'open' && next.settings.detection === 'auto' && !effects.some((x) => x.type === 'endTurn');
  return [next, [{ type: 'stopCapture' }, ...effects, ...(flush ? [{ type: 'endTurn' } as const] : [])]];
}
