// The one place that picks implementations. Metro resolves the .web / .native files.

import { createAudioInput } from './audio-input';
import { createAudioOutput } from './audio-output';
import { createCues } from './cues';
import { createPairingLink } from './pairing';
import { createRecap } from './recap';
import { createTranslator } from './translator';
import type { AudioInput, PairServices, Services, VoiceEmbedder } from './types';
import { createVoiceEmbedder } from './voice-embedder';
import { createWakeLock } from './wake-lock';

export { createDemoServices } from './demo';
export { createStorage } from './storage';
export type { AudioInput, KeyValueStorage, PairServices, Services, VoiceEmbedder } from './types';

/** One embedder per page: the model is loaded once and shared by enrolment and conversations. */
let voice: VoiceEmbedder | null = null;

export function voiceEmbedder(): VoiceEmbedder {
  return (voice ??= createVoiceEmbedder());
}

export function createServices(): Services {
  return { input: createAudioInput(), output: createAudioOutput(), translator: createTranslator(), recap: createRecap(), voice: voiceEmbedder() };
}

/** What enrolment needs: the shared embedder, and a microphone opened only when it records. */
export function createEnrolmentServices(): { voice: VoiceEmbedder; input: () => AudioInput } {
  return { voice: voiceEmbedder(), input: createAudioInput };
}

/** The host's side of Pair by QR: the app's own kind of services, with the room's. */
export function createHostPairServices(): PairServices {
  return {
    input: createAudioInput(),
    output: createAudioOutput(),
    translator: createTranslator(),
    voice: voiceEmbedder(),
    link: createPairingLink(),
    wake: createWakeLock(),
    cues: createCues(),
  };
}
