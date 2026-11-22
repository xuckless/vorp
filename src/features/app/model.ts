// What the screens show, derived from the owners of state (the session, enrolment, history) as
// plain data. Pure: the DOM screens (./dom) render from these values and nothing else, so they can
// cross to a web view on native, and every rule here is tested with plain sessions.

import { TONES } from '@/config/behaviours';
import { enrolmentSentences } from '@/config/enrolment';
import { LANGUAGES, languageName } from '@/config/languages';
import { VOICES } from '@/config/voices';
import {
  capturingUtterance,
  sameLanguage,
  theirLanguage,
  type People,
  type Role,
  type Session,
  type SessionErrorKind,
  type SessionEvent,
} from '@/core/session';
import { pickableLanguages, withLanguage } from '@/features/conversation/people';
import { spotlight, stageOf } from '@/features/conversation/stage';
import { currentSentence, isEnrolled, SENTENCE_COUNT, type Enrolment, type EnrolmentErrorKind, type EnrolmentStatus } from '@/features/enrolment/enrolment';
import type { Conversation } from '@/features/history/history';
import type { ThemePreference } from '@/ui/tokens';

export type Mode = 'live' | 'demo';

/** You are the owner, at the bottom; them is the other person, at the top. */
export type Who = 'you' | 'them';
const WHO: Record<Role, Who> = { owner: 'you', other: 'them' };

/** The page under the conversation. The conversation itself shows whenever one is running. */
export type Page = { name: 'start' } | { name: 'history' } | { name: 'enrol'; first?: boolean } | { name: 'transcript'; id: string };

// ---------------------------------------------------------------- the conversation

export type TalkPhase = 'listening' | 'hearing' | 'translating' | 'speaking';
/** Where the connection is. Only `live` plays the conversation. */
export type Connection = 'connecting' | 'live' | 'reconnecting' | 'problem';

export type CardModel = {
  id: string;
  /** Unknown until the speaker is routed. */
  who?: Who;
  source: string;
  translation: string;
  /** The translation has started arriving: the wave carries the card over to it. */
  revealed: boolean;
  /** Vorp is saying it now: the beam runs. */
  speaking: boolean;
};

export type TalkModel = {
  connection: Connection;
  problem?: SessionErrorKind;
  phase: TalkPhase;
  who?: Who;
  /** The line under the ring. */
  status: string;
  /** The caption card; when there is none, `quiet` is the line in its place. */
  card?: CardModel;
  quiet: string;
  /** The previous turn's translation, above the card. */
  earlier?: string;
  /** Under the card: a cultural note on it. */
  note?: string;
  /** Under the card, instead of a note: something that changed without anyone asking. */
  aside?: string;
  /** The owner is holding Hold to talk. */
  held: boolean;
  /** Hold to talk is live (not while connecting, and never in the demo). */
  canHold: boolean;
};

/** The language they are speaking, when auto-detect followed them away from the one picked. */
export function detectedLanguage(s: Session): string | undefined {
  const theirs = theirLanguage(s);
  return sameLanguage(theirs, s.people.other.language) ? undefined : theirs;
}

function statusOf(phase: TalkPhase, who: Who | undefined, s: Session, held: boolean, detected: string | undefined): string {
  switch (phase) {
    case 'listening':
      return s.settings.detection === 'manual' && !held ? 'Hold to talk' : 'Listening';
    case 'hearing':
      if (who === 'them') return detected ? `Hearing them in ${languageName(detected)}` : 'Hearing them';
      return who === 'you' ? 'Hearing you' : 'Hearing';
    case 'translating':
      return 'Translating';
    case 'speaking':
      return who === 'them' ? 'Speaking to you' : who === 'you' ? 'Speaking to them' : 'Speaking';
  }
}

/** The conversation view, or undefined when no conversation is running (or has failed). */
export function talkModel(s: Session, mode: Mode): TalkModel | undefined {
  if (s.connection === 'idle') return undefined;
  const connection: Connection = s.connection === 'open' ? 'live' : s.connection === 'failed' ? 'problem' : s.connection;
  const live = connection === 'live';
  const stage = stageOf(s);
  const phase: TalkPhase =
    stage.phase === 'off' || stage.phase === 'connecting' ? (connection === 'problem' ? 'listening' : 'translating') : stage.phase;
  const who = stage.utterance?.speaker === undefined ? undefined : WHO[stage.utterance.speaker];
  const held = s.held === 'owner';
  const detected = s.settings.autoDetect ? detectedLanguage(s) : undefined;
  const capturing = capturingUtterance(s);
  // While the owner holds the button and nothing is heard yet, the card makes way for "go ahead".
  const waitingForYou = held && (capturing === undefined || capturing.source === '');
  const { card, earlier } = spotlight(s);
  const shown = waitingForYou ? undefined : card;
  const theirs = languageName(theirLanguage(s));

  let status = statusOf(phase, who, s, held, detected);
  if (connection === 'connecting') status = 'Connecting';
  else if (connection === 'reconnecting') status = 'Reconnecting';
  else if (connection === 'problem') status = '';

  let quiet = s.settings.detection === 'manual' ? `Hold the button and speak. Vorp says it in ${theirs}.` : `Speak, and Vorp will say it in ${theirs}.`;
  if (connection === 'connecting') quiet = 'Getting ready to listen.';
  else if (waitingForYou) quiet = 'Go ahead, Vorp is listening to you.';

  const aside =
    connection === 'reconnecting'
      ? 'The connection dropped. Picking up where you left off.'
      : live && detected
        ? `They’re speaking ${languageName(detected)}, so Vorp switched from ${languageName(s.people.other.language)}.`
        : undefined;

  return {
    connection,
    ...(connection === 'problem' ? { problem: s.error?.kind ?? 'socket' } : {}),
    phase,
    ...(who ? { who } : {}),
    status,
    ...(shown
      ? {
          card: {
            id: shown.id,
            ...(shown.speaker ? { who: WHO[shown.speaker] } : {}),
            source: shown.source,
            translation: shown.translation,
            revealed: shown.translation !== '',
            speaking: shown.status === 'speaking',
          },
        }
      : {}),
    quiet,
    ...(earlier && !held && shown ? { earlier: earlier.translation || earlier.source } : {}),
    ...(shown?.note ? { note: shown.note } : {}),
    ...(aside ? { aside } : {}),
    held,
    canHold: live && mode === 'live',
  };
}

// ---------------------------------------------------------------- the setup (Start and Settings)

/** The setup as the Start page and the settings panel show it. */
export type SetupModel = {
  you: string;
  them: string;
  detect: boolean;
  voice: string;
  tone: string;
  notes: boolean;
  handsFree: boolean;
  recap: boolean;
  appearance: ThemePreference;
};

export function setupModel(s: Session, appearance: ThemePreference): SetupModel {
  const { people, settings } = s;
  return {
    you: people.owner.language,
    them: people.other.language,
    detect: settings.autoDetect,
    voice: people.owner.voice,
    tone: settings.tone,
    notes: settings.behaviours.includes('culturalNotes'),
    handsFree: settings.detection === 'auto',
    recap: settings.behaviours.includes('recap'),
    appearance,
  };
}

const withBehaviour = (ids: readonly string[], id: string, on: boolean) => (on ? [...ids.filter((x) => x !== id), id] : ids.filter((x) => x !== id));

/**
 * The `configure` event a change on Start or in Settings becomes, or undefined when nothing
 * about the session changes (an appearance change, or a language the other side speaks).
 */
export function setupEvent(s: Session, patch: Partial<SetupModel>): SessionEvent | undefined {
  let people: People | undefined = s.people;
  let settings = s.settings;
  if (patch.you !== undefined) people = people && withLanguage(people, 'owner', patch.you);
  if (patch.them !== undefined) people = people && withLanguage(people, 'other', patch.them);
  if (people === undefined) return undefined;
  if (patch.voice !== undefined) people = { owner: { ...people.owner, voice: patch.voice }, other: { ...people.other, voice: patch.voice } };
  if (patch.detect !== undefined) settings = { ...settings, autoDetect: patch.detect };
  if (patch.tone !== undefined) settings = { ...settings, tone: patch.tone };
  if (patch.handsFree !== undefined) settings = { ...settings, detection: patch.handsFree ? 'auto' : 'manual' };
  if (patch.notes !== undefined) settings = { ...settings, behaviours: withBehaviour(settings.behaviours, 'culturalNotes', patch.notes) };
  if (patch.recap !== undefined) settings = { ...settings, behaviours: withBehaviour(settings.behaviours, 'recap', patch.recap) };
  if (people === s.people && settings === s.settings) return undefined;
  return { type: 'configure', people, settings };
}

export type Choice = { value: string; label: string; detail?: string; disabled?: string };

/** Every language for a role; the other side's (any variant, see `pickableLanguages`) is greyed out with why. */
export function languageChoices(people: People, role: Role): Choice[] {
  const pickable = new Set(pickableLanguages(people, role).map((l) => l.code));
  const why = role === 'owner' ? 'They speak this' : 'You speak this';
  return LANGUAGES.map((l) => (pickable.has(l.code) ? { value: l.code, label: l.name } : { value: l.code, label: l.name, disabled: why }));
}

export const VOICE_CHOICES: Choice[] = VOICES.map((v) => ({ value: v.name, label: v.name, detail: v.character }));
export const TONE_CHOICES: Choice[] = TONES.map((t) => ({ value: t.id, label: t.label }));

// ---------------------------------------------------------------- enrolment

export type EnrolModel = {
  status: EnrolmentStatus;
  /** The sentence to read: the one being recorded, else the first one, ready to start. */
  sentence: string;
  /** 0-based, of `count`. */
  index: number;
  count: number;
  error?: EnrolmentErrorKind;
  enrolled: boolean;
};

export function enrolModel(e: Enrolment, ownerLanguage: string): EnrolModel {
  return {
    status: e.status,
    sentence: currentSentence(e) ?? enrolmentSentences(ownerLanguage)[0],
    index: e.status === 'recording' ? e.index : 0,
    count: SENTENCE_COUNT,
    ...(e.error ? { error: e.error.kind } : {}),
    enrolled: isEnrolled(e),
  };
}

// ---------------------------------------------------------------- history

export type BubbleModel = { who?: Who; source: string; translation: string; note?: string };
export type RecapModel = { status: 'none' | 'writing' | 'failed' | 'ready'; texts: { language: string; code?: string; text: string }[] };

export type HistoryItem = {
  id: string;
  /** Their language. */
  title: string;
  when: string;
  /** The first line, in the owner's language. */
  line: string;
  bubbles: BubbleModel[];
  recap: RecapModel;
};

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today, 14:02", "Yesterday, 10:47", "18 Nov, 21:15", or "18 Nov 2025, 21:15" in another year. */
export function whenText(ms: number, now: number): string {
  const d = new Date(ms);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const today = new Date(now);
  const days = Math.round((day(today) - day(d)) / 86_400_000);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  const year = d.getFullYear() === today.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}, ${time}`;
}

const codeOf = (name: string) => LANGUAGES.find((l) => l.name === name)?.code;

export function historyItem(c: Conversation, now: number): HistoryItem {
  const first = c.lines[0];
  return {
    id: c.id,
    title: languageName(c.languages.other),
    when: whenText(c.endedAt, now),
    // The owner reads the list: their own words, or what they heard in their language.
    line: first ? (first.speaker === 'other' ? first.translation || first.source : first.source) : '',
    bubbles: c.lines.map((l) => ({ ...(l.speaker ? { who: WHO[l.speaker] } : {}), source: l.source, translation: l.translation, ...(l.note ? { note: l.note } : {}) })),
    recap: {
      status: c.recap.status,
      texts: c.recap.status === 'ready' ? Object.entries(c.recap.text).map(([language, text]) => ({ language, code: codeOf(language), text })) : [],
    },
  };
}

/** The conversation as text to copy: both languages per line, then the recap. */
export function copyText(c: Conversation): string {
  const label = (speaker: Role | undefined) => (speaker === 'owner' ? 'You' : speaker === 'other' ? 'Them' : 'Someone');
  const lines = c.lines.flatMap((l) => [`${label(l.speaker)}: ${l.source}`, ...(l.translation ? [`  ${l.translation}`] : [])]);
  const recap = c.recap.status === 'ready' ? ['', ...Object.entries(c.recap.text).map(([language, text]) => `${language}: ${text}`)] : [];
  return [...lines, ...recap].join('\n');
}
