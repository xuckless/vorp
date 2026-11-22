// What the app remembers between visits. The owners stay where they are (the session owns the
// setup, the slot registry its choices, the tokens the theme and motion preferences); this
// module only snapshots them to storage and puts a snapshot back at start.

import type { Session } from '@/core/session';
import type { Store } from '@/core/store';
import type { KeyValueStorage } from '@/services';
import { DEFAULT_SLOTS, implementationIds, slotChoices, type SlotChoices, type SlotName } from '@/ui/slots';
import { motionPreference, themePreference } from '@/ui/tokens';

import { restore, type Saved, type Setup } from './snapshot';

export type { Setup } from './snapshot';

const KEY = 'vorp.settings.v1';
const SLOTS = Object.keys(DEFAULT_SLOTS) as SlotName[];

/** Reads the snapshot, hands the look back to its owners, and returns the setup for the session. */
export async function loadSetup(storage: KeyValueStorage): Promise<Setup> {
  const offered = Object.fromEntries(SLOTS.map((slot): [SlotName, readonly string[]] => [slot, implementationIds(slot)])) as Record<SlotName, readonly string[]>;
  const { setup, slots, theme, motion } = restore<SlotChoices>(await storage.get(KEY).catch(() => null), offered, DEFAULT_SLOTS);
  slotChoices.set(slots);
  themePreference.set(theme);
  motionPreference.set(motion);
  return setup;
}

/** Saves a snapshot whenever one of the owners changes. Returns the unsubscribe. */
export function keepSaved(storage: KeyValueStorage, session: Store<Session>): () => void {
  let last = '';
  const save = () => {
    const { people, settings } = session.get();
    const saved: Saved<SlotChoices> = {
      people,
      autoDetect: settings.autoDetect,
      detection: settings.detection,
      pauseMicWhileSpeaking: settings.pauseMicWhileSpeaking,
      tone: settings.tone,
      behaviours: [...settings.behaviours],
      slots: slotChoices.get(),
      theme: themePreference.get(),
      motion: motionPreference.get(),
    };
    const next = JSON.stringify(saved);
    if (next === last) return;
    last = next;
    void storage.set(KEY, next).catch(() => {});
  };
  const offs = [session.subscribe(save), slotChoices.subscribe(save), themePreference.subscribe(save), motionPreference.subscribe(save)];
  return () => offs.forEach((off) => off());
}
