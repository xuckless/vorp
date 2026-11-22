// The owner's voiceprint on the device: one JSON value holding the embedding and what made it.
// Never audio. Pure parsing, so it tests with plain data.

import { VOICEPRINT_MODEL } from '@/config/voiceprint';

import type { OwnerVoiceprint } from './enrolment';

export const VOICEPRINT_KEY = 'vorp.voiceprint.v1';

/** A stored voiceprint, if it is one this build can use: same model, right length, real numbers. */
export function parseVoiceprint(raw: string | null): OwnerVoiceprint | undefined {
  if (!raw) return undefined;
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof OwnerVoiceprint, unknown>>;
    const embedding = v.embedding;
    if (v.model !== VOICEPRINT_MODEL.id) return undefined;
    if (!Array.isArray(embedding) || embedding.length !== VOICEPRINT_MODEL.dimensions) return undefined;
    if (!embedding.every((x) => typeof x === 'number' && Number.isFinite(x))) return undefined;
    return {
      embedding,
      model: v.model,
      language: typeof v.language === 'string' ? v.language : '',
      createdAt: typeof v.createdAt === 'number' ? v.createdAt : 0,
    };
  } catch {
    return undefined;
  }
}

export function serialiseVoiceprint(print: OwnerVoiceprint): string {
  return JSON.stringify({ embedding: print.embedding, model: print.model, language: print.language, createdAt: print.createdAt });
}
