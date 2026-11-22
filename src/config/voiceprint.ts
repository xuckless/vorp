// On-device speaker recognition: the voiceprint model, where its files are served from, and the
// thresholds that turn a cosine score into a verdict. Data; the code that reads it is in
// src/services (the embedder) and src/features (enrolment, the effect runner).
//
// Model: WeSpeaker ResNet34-LM trained on VoxCeleb, ONNX export by onnx-community, 8-bit
// quantised (`onnx/model_quantized.onnx`, 6.7 MB). Weights are CC-BY-4.0 (owner-approved licence
// exception, see AGENTS.md and THIRD_PARTY_NOTICES.md). The files ship with the web build under
// `public/models/` and are fetched from our own origin; nothing is requested from Hugging Face or
// a CDN at runtime.

import type { VoiceThresholds } from '@/core/voiceprint';

export const VOICEPRINT_MODEL = {
  /** Hugging Face repository id; also the folder under `localModelPath`. */
  id: 'onnx-community/wespeaker-voxceleb-resnet34-LM',
  /** The Hugging Face commit the files were downloaded from, 21 November 2026. */
  revision: '6a61a1833ff2583aabeba044f5c8221f00b67ceb',
  /** transformers.js dtype: 'q8' loads `onnx/model_quantized.onnx`. */
  dtype: 'q8',
  /** The model's input rate: 16 kHz mono, 80-dim Kaldi fbank (WeSpeakerFeatureExtractor). */
  sampleRate: 16000,
  /** Length of the embedding (`last_hidden_state`, [1, 256]). */
  dimensions: 256,
} as const;

/**
 * Same-origin paths of the files the browser loads. `modelRoot` holds the committed model files
 * (`public/models/`); `runtimeRoot` the worker, transformers.js and the ONNX Runtime WASM, copied
 * there from node_modules by `scripts/voiceprint/assets.ts` (`bun run voiceprint:assets`).
 */
export const VOICEPRINT_ASSETS = {
  modelRoot: '/models/',
  runtimeRoot: '/voiceprint/',
  worker: 'worker.js',
  library: 'transformers.min.js',
  /** The plain SIMD build: CPU only, no WebGPU needed, smallest of ONNX Runtime's WASM files. */
  wasm: { mjs: 'ort-wasm-simd-threaded.mjs', wasm: 'ort-wasm-simd-threaded.wasm' },
} as const;

/**
 * Cosine thresholds, PROVISIONAL: set from the smoke test on TTS voices
 * (`bun run smoke:voiceprint`, 21 November 2026) and to be tuned by hand on the owner's devices
 * with real voices and rooms. No test asserts them.
 */
export const VOICE_THRESHOLDS: VoiceThresholds = {
  // The smoke test's prints (two clips each) scored 0.52 for a third clip of the same voice and
  // at most 0.16 for other voices; single clips of one voice ranged 0.08..0.49, so short
  // utterances will often land in the unsure band.
  owner: 0.4,
  other: 0.25,
  // Translations by the interpreter voice scored 0.43..0.48 against its print, the other TTS
  // voices at most 0.30. Dropping a person's real speech is worse than missing an echo (the
  // transcript guard still runs), so this errs high.
  echo: 0.4,
};

/** How much of an utterance's audio is judged. */
export const VOICE_CLIP = {
  /** Shorter voiced audio is too little to judge: nothing is sent and language routing applies. */
  minSeconds: 1.5,
  /** Only the last this-many seconds of the audio sent since the previous utterance are kept. */
  maxSeconds: 8,
  /** Energy gate that drops pauses before embedding (see `voicedSamples`). 20 ms frames at 16 kHz. */
  frame: 320,
  relative: 0.02,
  floor: 0.002,
} as const;

/** Enrolment: the owner reads three sentences in their own language. */
export const ENROLMENT = {
  /** A recording with less voiced audio than this is asked for again. */
  minSeconds: 2,
  /** A recording stops growing past this; the rest is not kept. */
  maxSeconds: 12,
} as const;

/** Vorp's own voice, learnt from what it plays, for the echo filter. */
export const INTERPRETER_PRINT = {
  /** Embeddings of this many spoken translations are averaged; later ones are not needed. */
  clips: 5,
} as const;
