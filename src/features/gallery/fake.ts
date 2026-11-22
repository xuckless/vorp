// Fake data for the gallery: a synthetic speech level and a scripted conversation, both pure
// functions of time, so the page needs no microphone and no network.

import type { AgentAvatarState, VoiceState } from '@/ui/slots';

/**
 * A speech-like level, 0..1: syllables at about 4 Hz under word swells, with a pause at the
 * end of every 7 s phrase.
 */
export function speech(t: number): number {
  const phrase = ((t % 7) + 7) % 7;
  if (phrase > 5) return 0;
  const syllable = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 4.2);
  const word = 0.55 + 0.45 * Math.sin(t * Math.PI * 2 * 0.7 + 0.4);
  const grain = 0.88 + 0.12 * Math.sin(t * 29.3);
  const edge = Math.min(1, phrase / 0.3, (5 - phrase) / 0.4);
  return Math.max(0, Math.min(1, syllable ** 1.5 * word * grain * edge));
}

type Step = { voice: VoiceState; avatar: AgentAvatarState; seconds: number };

/** One turn of an interpreted conversation, repeated. */
export const SCRIPT: readonly Step[] = [
  { voice: 'listening', avatar: 'idle', seconds: 5 },
  { voice: 'processing', avatar: 'working', seconds: 2.5 },
  { voice: 'speaking', avatar: 'working', seconds: 4.5 },
  { voice: 'idle', avatar: 'sleeping', seconds: 2 },
];

const LENGTH = SCRIPT.reduce((sum, s) => sum + s.seconds, 0);

/** The step at `t` seconds, and how long it has run. */
export function scriptAt(t: number): Step & { index: number; elapsed: number } {
  let at = ((t % LENGTH) + LENGTH) % LENGTH;
  for (const [index, step] of SCRIPT.entries()) {
    if (at < step.seconds) return { ...step, index, elapsed: at };
    at -= step.seconds;
  }
  return { ...SCRIPT[0], index: 0, elapsed: 0 };
}

export const CAPTION = { original: 'Excuse me, where is the train station?', translation: 'Pardon, où est la gare ?' };
