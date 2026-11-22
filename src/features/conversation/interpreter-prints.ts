// Vorp's own voice on the device, per interpreter voice: the embeddings learnt from the first
// replies it played (see ./voice.ts), so the echo filter works from the first reply of the next
// conversation. Embeddings only, never audio. Separate from the owner's voiceprint: deleting that
// one (Settings › Your voice) never touches these.

import { INTERPRETER_PRINT, VOICEPRINT_MODEL } from '@/config/voiceprint';
import type { Embedding } from '@/core/voiceprint';
import type { KeyValueStorage } from '@/services';

import type { InterpreterPrints } from './voice';

export const INTERPRETER_PRINTS_KEY = 'vorp.interpreterPrints.v1';

type Prints = Record<string, Embedding[]>;

const isEmbedding = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length === VOICEPRINT_MODEL.dimensions && v.every((x) => typeof x === 'number' && Number.isFinite(x));

/** The stored prints this build can use: same model, right length, real numbers, at most the clips needed. */
export function parseInterpreterPrints(raw: string | null): Prints {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as { model?: unknown; voices?: unknown };
    if (v.model !== VOICEPRINT_MODEL.id || typeof v.voices !== 'object' || v.voices === null) return {};
    const out: Prints = {};
    for (const [name, list] of Object.entries(v.voices as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      const kept = list.filter(isEmbedding).slice(0, INTERPRETER_PRINT.clips);
      if (kept.length > 0) out[name] = kept;
    }
    return out;
  } catch {
    return {};
  }
}

export function serialiseInterpreterPrints(prints: Prints): string {
  return JSON.stringify({ model: VOICEPRINT_MODEL.id, voices: prints });
}

/** The prints held in memory (the judge reads them synchronously), written through to storage. */
export function createInterpreterPrints(initial: Prints, save: (raw: string) => void): InterpreterPrints {
  let prints = initial;
  return {
    get: (voiceName) => prints[voiceName] ?? [],
    set: (voiceName, embeddings) => {
      prints = { ...prints, [voiceName]: embeddings.slice(0, INTERPRETER_PRINT.clips) };
      save(serialiseInterpreterPrints(prints));
    },
  };
}

export async function loadInterpreterPrints(storage: KeyValueStorage): Promise<InterpreterPrints> {
  const raw = await storage.get(INTERPRETER_PRINTS_KEY).catch(() => null);
  return createInterpreterPrints(parseInterpreterPrints(raw), (next) => void storage.set(INTERPRETER_PRINTS_KEY, next).catch(() => {}));
}
