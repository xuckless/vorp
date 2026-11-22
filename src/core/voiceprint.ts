// Voiceprints: speaker embeddings, how they are averaged and how a new one is judged. Pure, no
// I/O; the model that produces embeddings sits behind `VoiceEmbedder` in src/services.

import type { Role } from './session';

/** A speaker embedding: a fixed-length vector from the voiceprint model. Plain numbers, so it stores as JSON. */
export type Embedding = readonly number[];

/** The voices a captured utterance is compared with: the owner's (after enrolment) and the interpreter's own. */
export type VoicePrints = { owner?: Embedding; interpreter?: Embedding };

/**
 * Cosine scores that decide a verdict. Data from `src/config/voiceprint.ts`; provisional until
 * tuned by hand on the owner's devices.
 */
export type VoiceThresholds = {
  /** At or above this similarity to the owner's print, the speaker is the owner. */
  owner: number;
  /** At or below this similarity to the owner's print, the speaker is the other person. In between is unsure. */
  other: number;
  /** At or above this similarity to the interpreter's print, and closer to it than to the owner's, it is Vorp's own voice. */
  echo: number;
};

/**
 * What a voice says about an utterance. 'echo': Vorp heard itself. 'unsure': nothing to say, so
 * language routing applies. Scores are kept for logs and tuning.
 */
export type VoiceVerdict = { kind: Role | 'echo' | 'unsure'; owner?: number; interpreter?: number };

export function norm(v: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

/** The vector scaled to unit length; a zero vector stays zero. */
export function normalise(v: ArrayLike<number>): number[] {
  const n = norm(v);
  return Array.from(v, (x) => (n === 0 ? 0 : x / n));
}

/** Cosine similarity, -1..1; 0 when either vector is zero or the lengths differ. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  const n = norm(a) * norm(b);
  return n === 0 ? 0 : dot / n;
}

/**
 * One print from several embeddings of the same voice: the mean of the unit vectors, at unit
 * length, so a long clip does not outweigh a short one. Undefined for no embeddings.
 */
export function average(embeddings: readonly ArrayLike<number>[]): Embedding | undefined {
  if (embeddings.length === 0) return undefined;
  const size = embeddings[0].length;
  if (embeddings.some((e) => e.length !== size)) return undefined;
  const sum = new Array<number>(size).fill(0);
  for (const e of embeddings) {
    const unit = normalise(e);
    for (let i = 0; i < size; i++) sum[i] += unit[i];
  }
  return normalise(sum);
}

/**
 * Who spoke, from an utterance's embedding. Vorp's own voice wins first, when it is closer to
 * the interpreter's print than to the owner's and above the echo threshold. Then the owner's
 * print decides, with an unsure band between the two thresholds. Without an owner's print only
 * an echo can be named.
 */
export function judgeVoice(embedding: ArrayLike<number>, prints: VoicePrints, t: VoiceThresholds): VoiceVerdict {
  const owner = prints.owner === undefined ? undefined : cosine(embedding, prints.owner);
  const interpreter = prints.interpreter === undefined ? undefined : cosine(embedding, prints.interpreter);
  const scores = { owner, interpreter };
  if (interpreter !== undefined && interpreter >= t.echo && interpreter > (owner ?? -1)) return { kind: 'echo', ...scores };
  if (owner === undefined) return { kind: 'unsure', ...scores };
  if (owner >= t.owner) return { kind: 'owner', ...scores };
  if (owner <= t.other) return { kind: 'other', ...scores };
  return { kind: 'unsure', ...scores };
}
