// Past conversations, on this device only. One owner: this store. Text only; audio is never kept.

import { createStore, type Store } from '@/core/store';
import { wasHeard, type Participant, type Utterance } from '@/core/session';
import type { KeyValueStorage } from '@/services';

export type Line = { speakerId?: string; source: string; translation: string; note?: string };

/** A recap is being written, has arrived (by language name), or could not be written. */
export type RecapState = { status: 'none' } | { status: 'writing' } | { status: 'failed' } | { status: 'ready'; text: Record<string, string> };

export type Conversation = {
  id: string;
  endedAt: number;
  /** Seat order, with the language each person spoke. */
  participants: { id: string; language: string }[];
  lines: Line[];
  recap: RecapState;
};

const KEY = 'vorp.history.v1';
/** Older conversations fall off the end. */
export const HISTORY_LIMIT = 50;

export function toConversation(id: string, endedAt: number, participants: readonly Participant[], utterances: readonly Utterance[]): Conversation {
  return {
    id,
    endedAt,
    participants: participants.map((p) => ({ id: p.id, language: p.language })),
    lines: utterances
      .filter(wasHeard)
      .map((u) => ({ speakerId: u.speakerId, source: u.source, translation: u.translation, ...(u.note ? { note: u.note } : {}) })),
    recap: { status: 'none' },
  };
}

/** The conversation as plain text, for the recap prompt, copying and sharing. */
export function asText(c: Pick<Conversation, 'lines'>): string[] {
  return c.lines.map((l) => (l.translation ? `${l.source} / ${l.translation}` : l.source));
}

export const added = (list: readonly Conversation[], c: Conversation): Conversation[] => [c, ...list].slice(0, HISTORY_LIMIT);
export const removed = (list: readonly Conversation[], id: string): Conversation[] => list.filter((c) => c.id !== id);
export const recapped = (list: readonly Conversation[], id: string, recap: RecapState): Conversation[] =>
  list.map((c) => (c.id === id ? { ...c, recap } : c));

function parse(raw: string | null): Conversation[] {
  try {
    const value: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(value)) return [];
    // A recap still being written when the app closed never arrived.
    return (value as Conversation[]).map((c) => (c.recap.status === 'writing' ? { ...c, recap: { status: 'failed' } } : c));
  } catch {
    return [];
  }
}

export type History = {
  store: Store<Conversation[]>;
  add: (c: Conversation) => void;
  remove: (id: string) => void;
  setRecap: (id: string, recap: RecapState) => void;
};

/** A history over `initial`, calling `save` with every new list. */
export function createHistory(initial: Conversation[], save: (list: Conversation[]) => void): History {
  const store = createStore<Conversation[]>(initial);
  const update = (next: Conversation[]) => {
    store.set(next);
    save(next);
  };
  return {
    store,
    add: (c) => update(added(store.get(), c)),
    remove: (id) => update(removed(store.get(), id)),
    setRecap: (id, recap) => update(recapped(store.get(), id, recap)),
  };
}

export async function loadHistory(storage: KeyValueStorage): Promise<History> {
  return createHistory(parse(await storage.get(KEY).catch(() => null)), (list) => void storage.set(KEY, JSON.stringify(list)).catch(() => {}));
}
