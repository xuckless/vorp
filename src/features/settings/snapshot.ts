// The saved snapshot and how it is read back. Pure: no storage, no React Native, so it tests
// with plain data. `saved.ts` connects it to the owners and to storage.

import { BEHAVIOURS, TONES } from '@/config/behaviours';
import { DEFAULT_PARTICIPANTS } from '@/config/conversation';
import { LANGUAGES } from '@/config/languages';
import { DEFAULT_SETTINGS } from '@/config/policies';
import { VOICES } from '@/config/voices';
import type { Participant, SessionSettings } from '@/core/session';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type MotionChoice = 'system' | 'reduce';

export type Saved<Slots> = {
  participants: Participant[];
  detection: SessionSettings['detection'];
  pauseMicWhileSpeaking: boolean;
  tone: string;
  behaviours: string[];
  slots: Slots;
  theme: ThemeChoice;
  motion: MotionChoice;
};

export type Setup = { participants: Participant[]; settings: SessionSettings };

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);

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
  const people = Array.isArray(saved.participants)
    ? saved.participants.filter((p) => LANGUAGES.some((l) => l.code === p?.language) && VOICES.some((v) => v.name === p?.voice))
    : [];
  const slots = Object.fromEntries(Object.keys(defaults).map((slot) => [slot, oneOf(saved.slots?.[slot], offered[slot], defaults[slot])])) as Slots;
  return {
    setup: {
      participants: people.length >= 2 ? people : DEFAULT_PARTICIPANTS,
      settings: {
        ...DEFAULT_SETTINGS,
        detection: oneOf(saved.detection, ['auto', 'manual'], DEFAULT_SETTINGS.detection),
        pauseMicWhileSpeaking: typeof saved.pauseMicWhileSpeaking === 'boolean' ? saved.pauseMicWhileSpeaking : DEFAULT_SETTINGS.pauseMicWhileSpeaking,
        tone: oneOf(saved.tone, TONES.map((t) => t.id), DEFAULT_SETTINGS.tone as (typeof TONES)[number]['id']),
        behaviours: Array.isArray(saved.behaviours) ? saved.behaviours.filter((id) => BEHAVIOURS.some((b) => b.id === id)) : DEFAULT_SETTINGS.behaviours,
      },
    },
    slots,
    theme: oneOf(saved.theme, ['system', 'light', 'dark'], 'system'),
    motion: oneOf(saved.motion, ['system', 'reduce'], 'system'),
  };
}
