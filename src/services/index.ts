// The one place that picks implementations. Metro resolves the .web / .native files.

import { createAudioInput } from './audio-input';
import { createAudioOutput } from './audio-output';
import { createRecap } from './recap';
import { createTranslator } from './translator';
import type { AudioInput, Services, VoiceEmbedder } from './types';
import { createVoiceEmbedder } from './voice-embedder';

export { createDemoServices } from './demo';
export { createStorage } from './storage';
export type { AudioInput, KeyValueStorage, Services, VoiceEmbedder } from './types';

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
