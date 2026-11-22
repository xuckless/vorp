// Messages between the web embedder and its worker (`voice-worker.ts`). Types only.

import type { VOICEPRINT_MODEL } from '@/config/voiceprint';

export type VoiceWorkerRequest =
  | {
      type: 'init';
      /** Absolute URLs, all on our own origin. */
      library: string;
      modelRoot: string;
      wasm: { mjs: string; wasm: string };
      model: string;
      dtype: (typeof VOICEPRINT_MODEL)['dtype'];
    }
  /** 16 kHz mono samples in -1..1. */
  | { type: 'embed'; id: number; samples: Float32Array };

export type VoiceWorkerReply =
  | { type: 'ready' }
  | { type: 'loadFailed'; message: string }
  | { type: 'embedding'; id: number; embedding: Float32Array }
  | { type: 'embedFailed'; id: number; message: string };
