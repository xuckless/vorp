// The embedder for where the voiceprint model does not run (native, the demo): unavailable, so
// no voice verdict is ever sent and language routing applies.

import type { VoiceEmbedder } from './types';

const unavailable = () => Promise.reject(new Error('Voice recognition is not available here'));

export const NO_VOICE: VoiceEmbedder = { available: false, load: unavailable, embed: unavailable };
