// The conversation as one state value and one pure transition function.
// No React, no I/O, no imports from other folders.

export type UtteranceId = string;

/**
 * Vorp is one owner's interpreter. The owner ("you") has a native language and hears
 * everything in it; the other person ("them") is spoken to in the language the owner picked,
 * or, with auto-detect, in the language they last spoke.
 */
export type Role = 'owner' | 'other';

export type Person = {
  /** BCP-47 code from the languages table: the owner's own, or the one picked for the other person. */
  language: string;
  /** Voice name from the voices table. One interpreter voice is used for now. */
  voice: string;
};

export type People = Record<Role, Person>;

export type UtteranceStatus = 'capturing' | 'translating' | 'queued' | 'speaking' | 'done' | 'failed';

/**
 * What decided who spoke, strongest first: the owner's held talk button, a voice verdict (on-device
 * speaker recognition against the owner's voiceprint; the runner sends `speakerRecognised`), or
 * the language the speech was detected in (the owner's language is the owner, any other is the
 * other person).
 */
export type RoutedBy = 'button' | 'voice' | 'language';

export type Utterance = {
  id: UtteranceId;
  /** Unknown until the detected language (or a held button, or a voice verdict) names the speaker. */
  speaker?: Role;
  routedBy: RoutedBy;
  /** BCP-47 code of what was said: the interpreter's report, else the input transcript's. */
  language?: string;
  status: UtteranceStatus;
  /** What the speaker said (input transcript). */
  source: string;
  /** What the interpreter said (output transcript). */
  translation: string;
  /** A caption-only note from the interpreter (an idiom, a cultural reference). Never spoken. */
  note?: string;
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
export type OverlapPolicy = {
  id: string;
  speechDuringPlayback: 'queue';
  /**
   * The model does not listen while it produces a reply (verified against gemini-3.8-live with
   * NO_INTERRUPTION), so microphone audio is held back meanwhile and sent when the reply is
   * complete. At most this many seconds are held before they are sent anyway.
   */
  holdSeconds: number;
};

/** Data from `src/config`, handed to the reducer; core never imports config. */
export type SessionSettings = {
  detection: TurnDetection;
  overlap: OverlapPolicy;
  /** Emergency flag: stop sending the microphone while Vorp speaks. */
  pauseMicWhileSpeaking: boolean;
  /** Share of a captured transcript's words found in the spoken translation that marks it an echo, 0..1. */
  echoMatch: number;
  /** Tone row id and behaviour row ids from the config tables. Carried to the translator; the reducer does not read them. */
  tone: string;
  behaviours: readonly string[];
  /**
   * On: the owner's speech goes into the language the other person last spoke (the picked one
   * until they have spoken). Off: always into the picked language.
   */
  autoDetect: boolean;
  /**
   * The prompt row the translator builds its system instruction from (`PROMPTS` in
   * src/config/prompts.ts): the one-device interpreter when unset, 'paired' on a paired phone.
   * Carried to the translator; the reducer does not read it.
   */
  prompt?: string;
};

export type SessionErrorKind = 'micDenied' | 'mic' | 'token' | 'socket' | 'timeLimit';
export type SessionError = { kind: SessionErrorKind; message: string };

export type Session = {
  people: People;
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
  /** Set while the owner holds the talk button. Hold-to-talk is the owner's only. */
  held?: 'owner';
  /**
   * The microphone is closed from outside the conversation: a paired phone mutes it while it
   * plays the other person's translation (mic and speaker take turns). A held button still
   * opens it.
   */
  muted?: boolean;
  /**
   * The language the other person last spoke in this conversation, from the interpreter's
   * reports. Unset until they speak; the conversation ending (stopped or failed), a new
   * conversation or a new setup clears it, so "them" goes back to the picked language.
   */
  otherLanguage?: string;
  nextId: number;
  error?: SessionError;
};

/** Audio as 16-bit PCM samples; the effect runner moves it, the reducer only routes it. */
export type Pcm = Int16Array;

export type SessionEvent =
  | { type: 'start' }
  | { type: 'stop' }
  /**
   * Replace the setup. Only between sessions: a live session was opened for the old one. A setup
   * in which the owner and the other person share a language is refused (see `validPeople`).
   */
  | { type: 'configure'; people: People; settings: SessionSettings }
  | { type: 'connected' }
  | { type: 'connectFailed'; kind: 'token' | 'socket'; message: string }
  | { type: 'connectionLost'; kind: 'socket' | 'timeLimit'; message: string }
  | { type: 'audioFailed'; kind: 'micDenied' | 'mic'; message: string }
  /** Hold-to-talk is the owner's only: a press for 'other' is ignored. */
  | { type: 'pressTalk'; speaker: Role }
  | { type: 'releaseTalk'; speaker: Role }
  | { type: 'speechStarted' }
  | { type: 'speechEnded' }
  | { type: 'inputTranscript'; text: string; language?: string; finished?: boolean }
  | { type: 'outputTranscript'; text: string; language?: string }
  /** The interpreter reports the language of the utterance it is answering. */
  | { type: 'sourceLanguage'; language: string }
  /**
   * A voice verdict: the utterance's voice matched the owner's voiceprint, or clearly did not.
   * On `utteranceId` (the runner judges after capture ends, so the verdict may arrive once newer
   * speech is being captured), else on the speech being captured, else the newest sent turn.
   * Overrides language routing, never a held button.
   */
  | { type: 'speakerRecognised'; speaker: Role; utteranceId?: UtteranceId }
  /**
   * The utterance's voice is Vorp's own (its voiceprint, learnt from what it played): an echo.
   * Dropped like a transcript echo, while it is still capturing or translating.
   */
  | { type: 'echoRecognised'; utteranceId: UtteranceId }
  /** A caption-only note on the utterance being answered. */
  | { type: 'note'; text: string }
  | { type: 'outputAudio'; pcm: Pcm }
  | { type: 'interrupted' }
  | { type: 'turnComplete' }
  | { type: 'playbackStarted'; utteranceId: UtteranceId }
  | { type: 'playbackFinished'; utteranceId: UtteranceId }
  /** Close (or reopen) the microphone from outside; see `Session.muted`. */
  | { type: 'mute'; muted: boolean };

export type Effect =
  | { type: 'connect'; people: People; settings: SessionSettings }
  | { type: 'disconnect' }
  | { type: 'openAudio' }
  | { type: 'closeAudio' }
  /** Start / stop sending microphone audio to the translator. Derived, see `micOpen`. */
  | { type: 'startCapture' }
  /** Keep microphone audio back instead of sending it; `releaseAudio` sends what was kept, in order. */
  | { type: 'holdAudio'; maxSeconds: number }
  | { type: 'releaseAudio' }
  | { type: 'stopCapture' }
  /**
   * An utterance's capture ended (it was not dropped): judge its voice from the microphone audio
   * sent since the previous one. Derived, see `capturesEnded`; the verdict comes back as
   * `speakerRecognised` or `echoRecognised`, or nothing when unsure.
   */
  | { type: 'recogniseVoice'; utteranceId: UtteranceId }
  | { type: 'beginTurn' }
  | { type: 'endTurn' }
  | { type: 'enqueuePlayback'; utteranceId: UtteranceId; pcm: Pcm }
  | { type: 'finishPlayback'; utteranceId: UtteranceId }
  | { type: 'stopPlayback' }
  /** A conversation in which something was heard has ended; keep it. */
  | { type: 'archive'; languages: Record<Role, string>; utterances: Utterance[] };

export type Transition = [Session, Effect[]];

export function initialSession(people: People, settings: SessionSettings): Session {
  return { people, settings, connection: 'idle', utterances: [], awaitingResponse: [], nextId: 1 };
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
  if (s.muted) return false;
  if (s.settings.detection === 'manual') return false;
  if (s.settings.pauseMicWhileSpeaking && s.utterances.some((u) => u.status === 'speaking')) return false;
  return true;
}

/**
 * Whether the model is producing a reply: the oldest unanswered utterance has finished being
 * captured. Derived, like `micOpen`; `transition` turns its changes into hold / release effects.
 */
export function replying(s: Session): boolean {
  // Manual turns are bracketed by the client's own activity signals, so nothing is held there.
  if (s.settings.detection !== 'auto') return false;
  const head = s.utterances.find((u) => u.id === s.awaitingResponse[0]);
  return head !== undefined && head.status !== 'capturing';
}

/** The language the owner's speech goes into now: what the other person last spoke, with auto-detect. */
export function theirLanguage(s: Session): string {
  return (s.settings.autoDetect ? s.otherLanguage : undefined) ?? s.people.other.language;
}

/** The language an utterance is being translated into, once its speaker is known. */
export function targetLanguage(s: Session, u: Utterance): string | undefined {
  if (u.speaker === undefined) return undefined;
  return u.speaker === 'owner' ? theirLanguage(s) : s.people.owner.language;
}

/** Who speaks a language: the owner's language is the owner, any other is the other person. */
export function speakerOf(people: People, language: string): Role {
  return sameLanguage(people.owner.language, language) ? 'owner' : 'other';
}

/**
 * Whether a setup can be used: the owner and the other person must not share a language
 * (`sameLanguage`), since the language is what tells them apart when nothing else does.
 */
export function validPeople(people: People): boolean {
  return !sameLanguage(people.owner.language, people.other.language);
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

/** A complete stage-direction token: `<no speech detected>`, `{pause}`. */
const TOKENS = /<[^<>]*>|\{[^{}]*\}/g;
/** What is left of a token still streaming in: `<no spe`, `{pau`. */
const OPEN_TOKEN = /^[<{][^<>{}]*$/;

/**
 * Whether a reply is not a translation but a stage direction. For noise or echo the model
 * sometimes answers "<no speech detected>" or "<no speech>{pause}" instead of staying silent
 * (seen live, 21 November 2026). Only bracketed `<...>` and `{...}` tokens count, nothing else;
 * an empty reply is not a placeholder, it is no reply yet.
 */
export function isPlaceholder(translation: string): boolean {
  const rest = translation.replace(TOKENS, '').trim();
  return translation.trim() !== '' && (rest === '' || OPEN_TOKEN.test(rest));
}

/**
 * Something a person said: not silence, not Vorp hearing itself, and not answered with a stage
 * direction. What captions, the transcript, history and the recap keep.
 */
export function wasHeard(u: Utterance): boolean {
  return u.source !== '' && u.error !== 'echo' && !isPlaceholder(u.translation);
}

/** How many finished translations, newest first, the echo guard still compares against. */
const ECHO_RECENT = 2;

/** True when most of the captured words appear in what Vorp is speaking. */
export function isEcho(captured: string, spoken: string, threshold: number): boolean {
  const heard = words(captured);
  if (heard.length < 2) return false;
  const said = new Set(words(spoken));
  return heard.filter((w) => said.has(w)).length / heard.length >= threshold;
}

/**
 * Vorp heard itself: fail the utterance as an echo. It stays in awaitingResponse so the model's
 * reply to it is dropped too.
 */
function dropEcho(s: Session, id: UtteranceId): Session {
  return patch(s, id, () => ({ status: 'failed', error: 'echo' }));
}

/** Whether a voice verdict may still change an utterance: known, not dropped, not on a held button. */
function judgeable(u: Utterance | undefined): u is Utterance {
  return u !== undefined && u.status !== 'failed' && u.routedBy !== 'button';
}

function headId(s: Session): UtteranceId | undefined {
  return s.awaitingResponse[0];
}

/** The utterance new input transcript belongs to: the one capturing, else the newest sent turn. */
export function inputOwnerId(s: Session): UtteranceId | undefined {
  return capturingUtterance(s)?.id ?? s.awaitingResponse[s.awaitingResponse.length - 1];
}

function patch(s: Session, id: UtteranceId, f: (u: Utterance) => Partial<Utterance>): Session {
  return { ...s, utterances: s.utterances.map((u) => (u.id === id ? { ...u, ...f(u) } : u)) };
}

function find(s: Session, id: UtteranceId | undefined): Utterance | undefined {
  return id === undefined ? undefined : s.utterances.find((u) => u.id === id);
}

function openUtterance(s: Session, speaker: Role | undefined, routedBy: RoutedBy): [Session, UtteranceId] {
  const id = `u${s.nextId}`;
  const utterance: Utterance = { id, speaker, routedBy, status: 'capturing', source: '', translation: '' };
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

/**
 * End the conversation, stopped or failed: fail what is in flight, release its resources and
 * keep it if something was heard. A failed conversation is over too; 'start' begins a new one.
 */
function end(s: Session, connection: 'idle' | 'failed', reason: string, error: SessionError | undefined): Transition {
  // The detected language is forgotten: "them" goes back to the picked language.
  const ended: Session = { ...failInFlight(s, reason), connection, error, otherLanguage: undefined };
  const heard = ended.utterances.filter(wasHeard);
  const languages = { owner: s.people.owner.language, other: theirLanguage(s) };
  const archive: Effect[] = heard.length > 0 ? [{ type: 'archive', languages, utterances: heard }] : [];
  return [ended, [...RELEASE, ...archive]];
}

/** Server output for the head arrived, so the server has ended that turn. */
function turnEnded(s: Session, u: Utterance): Session {
  return u.status === 'capturing' ? patch(s, u.id, () => ({ status: 'translating' })) : s;
}

/** Record the detected input language and, unless a button or a voice decided, the speaker from it. */
function routeByInput(u: Utterance, people: People, language: string | undefined): Partial<Utterance> {
  if (language === undefined) return {};
  if (u.routedBy !== 'language') return { language };
  return { language, speaker: speakerOf(people, language) };
}

/**
 * Fallback routing from the output language, with no input language: a reply in the owner's
 * language answers the other person, any other reply answers the owner.
 */
function routeByOutput(u: Utterance, people: People, language: string | undefined): Partial<Utterance> {
  if (language === undefined || u.routedBy !== 'language' || u.speaker !== undefined) return {};
  return { speaker: speakerOf(people, language) === 'owner' ? 'other' : 'owner' };
}

/** The other person's language follows what they speak: a language report on their utterance. */
function followOther(s: Session, id: UtteranceId): Session {
  const u = find(s, id);
  if (u?.speaker !== 'other' || u.language === undefined || sameLanguage(u.language, s.people.owner.language)) return s;
  return { ...s, otherLanguage: u.language };
}

function step(s: Session, e: SessionEvent): Transition {
  switch (e.type) {
    case 'start':
      if (s.connection === 'connecting' || s.connection === 'open' || s.connection === 'reconnecting') return [s, []];
      // openAudio runs inside the user gesture that sent 'start', which browsers require.
      return [
        // A new conversation: the last one was archived when it stopped or failed.
        { ...s, connection: 'connecting', error: undefined, utterances: [], awaitingResponse: [], otherLanguage: undefined },
        [{ type: 'openAudio' }, { type: 'connect', people: s.people, settings: s.settings }],
      ];

    case 'configure':
      if (s.connection !== 'idle' && s.connection !== 'failed') return [s, []];
      // The same language on both sides is blocked: the previous setup stays.
      if (!validPeople(e.people)) return [s, []];
      return [{ ...s, people: e.people, settings: e.settings, otherLanguage: undefined }, []];

    case 'stop':
      if (s.connection === 'idle') return [s, []];
      // A failed conversation was already released and kept when it failed.
      if (s.connection === 'failed') return [{ ...s, connection: 'idle' }, []];
      return end(s, 'idle', 'stopped', s.error);

    case 'connected':
      if (s.connection !== 'connecting' && s.connection !== 'reconnecting') return [s, []];
      return [{ ...s, connection: 'open', error: undefined }, []];

    case 'connectFailed':
      if (s.connection !== 'connecting' && s.connection !== 'reconnecting') return [s, []];
      return end(s, 'failed', e.message, { kind: e.kind, message: e.message });

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
          { type: 'connect', people: s.people, settings: s.settings },
        ],
      ];
    }

    case 'audioFailed': {
      // Without a microphone there is no conversation: end it and say why.
      if (s.connection === 'idle' || s.connection === 'failed') return [s, []];
      return end(s, 'failed', e.message, { kind: e.kind, message: e.message });
    }

    case 'pressTalk': {
      // Hold-to-talk is the owner's only: the other person is recognised by voice or language.
      if (e.speaker !== 'owner' || s.connection !== 'open' || s.held !== undefined) return [s, []];
      const current = capturingUtterance(s);
      // A held button overrides detection: it takes over the speech being captured, if any.
      const [next] =
        current === undefined
          ? openUtterance(s, 'owner', 'button')
          : [patch(s, current.id, () => ({ speaker: 'owner' as const, routedBy: 'button' as const }))];
      return [{ ...next, held: 'owner' }, [{ type: 'beginTurn' }]];
    }

    case 'releaseTalk': {
      if (s.held !== e.speaker) return [s, []];
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
      next = followOther(patch(next, id, (u) => ({ source: u.source + e.text, ...routeByInput(u, s.people, e.language) })), id);
      const u = find(next, id)!;
      if (u.routedBy !== 'button' && (u.status === 'capturing' || u.status === 'translating')) {
        const others = next.utterances.filter((o) => o.id !== u.id);
        // Held microphone audio reaches the server after the reply, so the echo of a short
        // translation can arrive once it has finished playing: check the latest ones too.
        const recent = others.filter((o) => o.status === 'done').slice(-ECHO_RECENT);
        const spoken = [...others.filter((o) => o.status === 'queued' || o.status === 'speaking'), ...recent]
          .map((o) => o.translation)
          .join(' ');
        if (isEcho(u.source, spoken, s.settings.echoMatch)) return [dropEcho(next, id), []];
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
        ...routeByOutput(v, s.people, e.language),
      }));
      return [next, []];
    }

    case 'note': {
      const u = find(s, headId(s));
      if (u === undefined || u.status === 'failed') return [s, []];
      return [patch(s, u.id, (v) => ({ ...v, note: e.text })), []];
    }

    case 'sourceLanguage': {
      // Part of the model's reply, so it belongs to the utterance being answered.
      const u = find(s, headId(s));
      if (u === undefined || u.status === 'failed') return [s, []];
      return [followOther(patch(s, u.id, (v) => routeByInput(v, s.people, e.language)), u.id), []];
    }

    case 'speakerRecognised': {
      const u = find(s, e.utteranceId ?? inputOwnerId(s));
      if (!judgeable(u)) return [s, []];
      return [followOther(patch(s, u.id, () => ({ speaker: e.speaker, routedBy: 'voice' as const })), u.id), []];
    }

    case 'echoRecognised': {
      const u = find(s, e.utteranceId);
      // Once its reply is being played it is too late to drop; the transcript guard may still.
      if (!judgeable(u) || (u.status !== 'capturing' && u.status !== 'translating')) return [s, []];
      return [dropEcho(s, u.id), []];
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

    case 'mute':
      return [e.muted === !!s.muted ? s : { ...s, muted: e.muted }, []];
  }
}

/**
 * The single transition. The microphone is derived from state (`micOpen`), so starting and
 * stopping it is computed here once instead of in every case: stops go first, starts last.
 */
export function transition(s: Session, e: SessionEvent): Transition {
  const [next, stepped] = step(s, e);
  const effects = [...stepped, ...holdEffects(s, next), ...capturesEnded(s, next)];
  const was = micOpen(s);
  const now = micOpen(next);
  if (was === now) return [next, effects];
  if (now) return [next, [...effects, { type: 'startCapture' }]];
  // Pausing a hands-free stream on an open connection: flush the server's cached audio.
  const flush =
    next.connection === 'open' && next.settings.detection === 'auto' && !effects.some((x) => x.type === 'endTurn');
  return [next, [{ type: 'stopCapture' }, ...effects, ...(flush ? [{ type: 'endTurn' } as const] : [])]];
}

/** Utterances that were capturing and now are not, and were not dropped: their voice can be judged. */
function capturesEnded(s: Session, next: Session): Effect[] {
  const ended = (u: Utterance) => {
    const now = find(next, u.id)?.status;
    return u.status === 'capturing' && now !== undefined && now !== 'capturing' && now !== 'failed';
  };
  return s.utterances.filter(ended).map((u) => ({ type: 'recogniseVoice', utteranceId: u.id }));
}

function holdEffects(s: Session, next: Session): Effect[] {
  const was = replying(s);
  const now = replying(next);
  if (was === now) return [];
  return now ? [{ type: 'holdAudio', maxSeconds: next.settings.overlap.holdSeconds }] : [{ type: 'releaseAudio' }];
}
