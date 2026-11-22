// Native does not run the voiceprint model (web is the target); routing falls back to language.

import { NO_VOICE } from './no-voice';
import type { VoiceEmbedder } from './types';

export function createVoiceEmbedder(): VoiceEmbedder {
  return NO_VOICE;
}
