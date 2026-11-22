// What the stage shows, derived from the session. Pure; the screen renders from this.

import { capturingUtterance, playbackQueue, targetLanguages, type Session, type Utterance } from '@/core/session';

export type StagePhase = 'off' | 'connecting' | 'listening' | 'hearing' | 'translating' | 'speaking';

export type Stage = {
  phase: StagePhase;
  /** The utterance the phase is about: being heard, translated or spoken. */
  utterance?: Utterance;
  /** Where its speaker sits, -1 left … 1 right; 0 when nobody is active. */
  direction: number;
  /** The language being spoken to (speaking) or heard (hearing), as a BCP-47 code. */
  language?: string;
};

function seat(s: Session, u: Utterance | undefined): number {
  const index = s.participants.findIndex((p) => p.id === u?.speakerId);
  if (index < 0 || s.participants.length < 2) return 0;
  return (index / (s.participants.length - 1)) * 2 - 1;
}

export function stageOf(s: Session): Stage {
  if (s.connection === 'idle' || s.connection === 'failed') return { phase: 'off', direction: 0 };
  if (s.connection !== 'open') return { phase: 'connecting', direction: 0 };
  const queue = playbackQueue(s);
  const speaking = queue.find((u) => u.status === 'speaking');
  // The interpreter leans toward the listener while it speaks, toward the speaker while it hears.
  if (speaking) return { phase: 'speaking', utterance: speaking, direction: -seat(s, speaking), language: targetLanguages(s, speaking)[0] };
  const hearing = capturingUtterance(s);
  if (hearing) return { phase: 'hearing', utterance: hearing, direction: seat(s, hearing), language: hearing.language };
  if (queue.length > 0) return { phase: 'translating', utterance: queue[0], direction: 0 };
  return { phase: 'listening', direction: 0 };
}

/** The utterances worth showing as captions, oldest first: heard, and not dropped as echo or noise. */
export function captions(s: Session): Utterance[] {
  return s.utterances.filter((u) => u.source !== '' && u.status !== 'failed');
}
