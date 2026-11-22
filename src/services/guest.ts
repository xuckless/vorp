// The guest's services (Pair by QR), kept apart from ./index.ts so the guest's page does not load
// the Gemini Live SDK before it translates: the translator is fetched (by `loadTranslator`) when it
// first connects. The
// voiceprint model loads only once the conversation runs, and only with `voiceFilter`.

import { createAudioInput } from './audio-input';
import { createAudioOutput } from './audio-output';
import { createCues } from './cues';
import { NO_VOICE } from './no-voice';
import { createPairingLink } from './pairing';
import { createLazyTranslator } from './translator-lazy';
import type { PairServices, Translator } from './types';
import { createVoiceEmbedder } from './voice-embedder';
import { createWakeLock } from './wake-lock';

export function createGuestPairServices(voiceFilter: boolean, loadTranslator: () => Promise<{ createTranslator: () => Translator }>): PairServices {
  return {
    input: createAudioInput(),
    output: createAudioOutput(),
    translator: createLazyTranslator(loadTranslator),
    voice: voiceFilter ? createVoiceEmbedder() : NO_VOICE,
    link: createPairingLink(),
    wake: createWakeLock(),
    cues: createCues(),
  };
}
