// Past conversations, on this device only. One owner: this store. Text only; audio is never kept.

import { createStore, type Store } from '@/core/store';
import { isPlaceholder, wasHeard, type Role, type Utterance } from '@/core/session';
import type { KeyValueStorage } from '@/services';

export type Line = { speaker?: Role; source: string; translation: string; note?: string };

/** A recap is being written, has arrived (by language name), or could not be written. */
export type RecapState = { status: 'none' } | { status: 'writing' } | { status: 'failed' } | { status: 'ready'; text: Record<string, string> };

export type Conversation = {
  id: string;
  endedAt: number;
  /** The language each person spoke: the owner's, and the other person's last one. */
  languages: Record<Role, string>;
  lines: Line[];
  recap: RecapState;
};

const KEY = 'vorp.history.v1';
/** Older conversations fall off the end. */
export const HISTORY_LIMIT = 50;

export function toConversation(id: string, endedAt: number, languages: Record<Role, string>, utterances: readonly Utterance[]): Conversation {
  return {
    id,
    endedAt,
    languages: { ...languages },
    lines: utterances
      .filter(wasHeard)
      .map((u) => ({ ...(u.speaker ? { speaker: u.speaker } : {}), source: u.source, translation: u.translation, ...(u.note ? { note: u.note } : {}) })),
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

const RECAP_STATUSES: readonly string[] = ['none', 'writing', 'failed', 'ready'];

type Stored = Record<string, unknown>;
const isObject = (v: unknown): v is Stored => typeof v === 'object' && v !== null;

/**
 * Entries saved before Vorp had an owner list `participants` in seat order and name speakers by
 * id: the first seat becomes the owner, the second the other person. Lines that are stage
 * directions ("<no speech>{pause}") were kept by older builds and are dropped here.
 */
function upgrade(c: Stored): Stored {
  const seats = Array.isArray(c.participants) ? c.participants.filter(isObject) : [];
  const role = (id: unknown): Role | undefined =>
    typeof id !== 'string' ? undefined : id === seats[0]?.id ? 'owner' : id === seats[1]?.id ? 'other' : undefined;
  const languages =
    isObject(c.languages) ? c.languages : seats.length >= 2 ? { owner: seats[0].language, other: seats[1].language } : undefined;
  const lines = Array.isArray(c.lines)
    ? c.lines
        .filter((l): l is Stored => isObject(l) && typeof l.source === 'string' && typeof l.translation === 'string' && !isPlaceholder(l.translation))
        .map(({ speakerId, speaker, ...l }) => {
          const who = speaker ?? role(speakerId);
          return who === 'owner' || who === 'other' ? { ...l, speaker: who } : l;
        })
    : c.lines;
  const { participants: _, ...rest } = c;
  return { ...rest, languages, lines };
}

/** The shape a stored entry needs to be shown; one bad entry must not cost the rest. */
function isConversation(v: unknown): v is Conversation {
  if (!isObject(v)) return false;
  const c = v;
  const recap = c.recap as Record<string, unknown> | null | undefined;
  const languages = c.languages as Record<string, unknown> | undefined;
  return (
    typeof c.id === 'string' &&
    typeof c.endedAt === 'number' &&
    isObject(languages) &&
    typeof languages.owner === 'string' &&
    typeof languages.other === 'string' &&
    Array.isArray(c.lines) &&
    typeof recap === 'object' &&
    recap !== null &&
    RECAP_STATUSES.includes(recap.status as string) &&
    (recap.status !== 'ready' || (typeof recap.text === 'object' && recap.text !== null))
  );
}

function parse(raw: string | null): Conversation[] {
  let value: unknown;
  try {
    value = raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  // A recap still being written when the app closed never arrived.
  return value.map((c) => (isObject(c) ? upgrade(c) : c)).filter(isConversation).map((c) => (c.recap.status === 'writing' ? { ...c, recap: { status: 'failed' } } : c));
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
