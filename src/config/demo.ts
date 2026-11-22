// The demo conversation: what the booth shows without a microphone, a network or a key. The
// lines were spoken once by Gemini's speech model (gemini-3.8-flash-tts, 21 November 2026; the
// two people as Kore and Puck, the interpreter as Charon) and ship as 24 kHz mono WAV files.

import type { Participant } from '@/core/session';

export const DEMO_PARTICIPANTS: Participant[] = [
  { id: 'p1', name: 'English speaker', language: 'en', voice: 'Charon' },
  { id: 'p2', name: 'French speaker', language: 'fr', voice: 'Charon' },
];

export type DemoTurn = {
  /** The language spoken, which names the speaker. */
  language: string;
  source: string;
  spoken: string;
  note?: string;
  /** Bundled audio: the person, then the interpreter. */
  sourceClip: number;
  spokenClip: number;
};

export const DEMO_TURNS: readonly DemoTurn[] = [
  {
    language: 'en',
    source: 'Excuse me, where is the nearest bus stop?',
    spoken: 'Excusez-moi, où est l’arrêt d’autobus le plus proche ?',
    sourceClip: require('../../assets/demo/1-source.wav'),
    spokenClip: require('../../assets/demo/1-spoken.wav'),
  },
  {
    language: 'fr',
    source: 'Juste là, à gauche après la bibliothèque.',
    spoken: 'Right there, on the left after the library.',
    sourceClip: require('../../assets/demo/2-source.wav'),
    spokenClip: require('../../assets/demo/2-spoken.wav'),
  },
  {
    language: 'en',
    source: 'Perfect. That was a piece of cake!',
    spoken: 'Parfait. C’était un jeu d’enfant !',
    note: '« A piece of cake » veut dire très facile ; le français dit « un jeu d’enfant ».',
    sourceClip: require('../../assets/demo/3-source.wav'),
    spokenClip: require('../../assets/demo/3-spoken.wav'),
  },
  {
    language: 'fr',
    source: 'Avec plaisir. Bonne journée !',
    spoken: 'My pleasure. Have a good day!',
    sourceClip: require('../../assets/demo/4-source.wav'),
    spokenClip: require('../../assets/demo/4-spoken.wav'),
  },
];

export const DEMO_RECAP: Record<string, string> = {
  English: 'One person asked where the nearest bus stop was. The other said it is just ahead on the left, after the library. They thanked each other and said goodbye.',
  French: 'Une personne a demandé où se trouvait l’arrêt d’autobus le plus proche. L’autre a répondu qu’il est juste là, à gauche après la bibliothèque. Elles se sont remerciées et saluées.',
};

/** Pauses in the demo, ms. A script, not a measurement. */
export const DEMO_PACE = { beforeTurn: 900, thinking: 1100, afterTurn: 900 } as const;
