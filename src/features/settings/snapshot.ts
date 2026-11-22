// The saved snapshot and how it is read back. Pure: no storage, no React Native, so it tests
// with plain data. `saved.ts` connects it to the owners and to storage.

import { BEHAVIOURS, TONES } from '@/config/behaviours';
import { DEFAULT_PEOPLE } from '@/config/conversation';
import { LANGUAGES } from '@/config/languages';
import { DEFAULT_SETTINGS } from '@/config/policies';
import { VOICES } from '@/config/voices';
import { sameLanguage, validPeople, type People, type Person, type SessionSettings } from '@/core/session';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type MotionChoice = 'system' | 'reduce';

export type Saved<Slots> = {
  people: People;
  autoDetect: boolean;
  detection: SessionSettings['detection'];
  pauseMicWhileSpeaking: boolean;
  tone: string;
  behaviours: string[];
  slots: Slots;
  theme: ThemeChoice;
  motion: MotionChoice;
};

export type Setup = { people: People; settings: SessionSettings };

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);

/** A saved person, keeping each field only if the tables still know it. */
function person(value: unknown, fallback: Person): Person {
  const p = (typeof value === 'object' && value !== null ? value : {}) as Partial<Record<keyof Person, unknown>>;
  return {
    language: LANGUAGES.some((l) => l.code === p.language) ? (p.language as string) : fallback.language,
    voice: VOICES.some((v) => v.name === p.voice) ? (p.voice as string) : fallback.voice,
  };
}

/**
 * The owner and the other person. Snapshots from before Vorp had an owner hold `participants` in
 * seat order: the first becomes the owner, the second the other person, the rest are dropped.
 */
function people(saved: { people?: unknown; participants?: unknown }): People {
  const pair = saved.people as Partial<Record<keyof People, unknown>> | undefined;
  const seats = Array.isArray(saved.participants) ? saved.participants : [];
  const [owner, other] = typeof pair === 'object' && pair !== null ? [pair.owner, pair.other] : [seats[0], seats[1]];
  const restored = { owner: person(owner, DEFAULT_PEOPLE.owner), other: person(other, DEFAULT_PEOPLE.other) };
  if (validPeople(restored)) return restored;
  // Both in one language (an older build allowed it): the other person gets the default, or
  // the first language the owner does not speak.
  const language = [DEFAULT_PEOPLE.other.language, DEFAULT_PEOPLE.owner.language, ...LANGUAGES.map((l) => l.code)].find(
    (code) => !sameLanguage(code, restored.owner.language),
  )!;
  return { ...restored, other: { ...restored.other, language } };
}

/** A stored snapshot may be from an older build: keep only what the tables still know. */
export function restore<Slots extends Record<string, string>>(
  raw: string | null,
  /** Every slot's registered implementations, and the default pick of each. */
  offered: { [S in keyof Slots]: readonly string[] },
  defaults: Slots,
): { setup: Setup; slots: Slots; theme: ThemeChoice; motion: MotionChoice } {
  let saved: Partial<Saved<Slots>> = {};
  try {
    const value: unknown = raw ? JSON.parse(raw) : {};
    if (value !== null && typeof value === 'object') saved = value;
  } catch {
    // A snapshot that does not parse is the same as none.
  }
  const slots = Object.fromEntries(Object.keys(defaults).map((slot) => [slot, oneOf(saved.slots?.[slot], offered[slot], defaults[slot])])) as Slots;
  return {
    setup: {
      people: people(saved),
      settings: {
        ...DEFAULT_SETTINGS,
        detection: oneOf(saved.detection, ['auto', 'manual'], DEFAULT_SETTINGS.detection),
        pauseMicWhileSpeaking: typeof saved.pauseMicWhileSpeaking === 'boolean' ? saved.pauseMicWhileSpeaking : DEFAULT_SETTINGS.pauseMicWhileSpeaking,
        tone: oneOf(saved.tone, TONES.map((t) => t.id), DEFAULT_SETTINGS.tone as (typeof TONES)[number]['id']),
        behaviours: Array.isArray(saved.behaviours) ? saved.behaviours.filter((id) => BEHAVIOURS.some((b) => b.id === id)) : DEFAULT_SETTINGS.behaviours,
        autoDetect: typeof saved.autoDetect === 'boolean' ? saved.autoDetect : DEFAULT_SETTINGS.autoDetect,
      },
    },
    slots,
    theme: oneOf(saved.theme, ['system', 'light', 'dark'], 'system'),
    motion: oneOf(saved.motion, ['system', 'reduce'], 'system'),
  };
}
