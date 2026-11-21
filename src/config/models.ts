// Gemini Live API models and wire constants. From the docs spike on 21 November 2026
// (aistudio.google.com/docs/live-api, /docs/models, /docs/live-api/capabilities).
// Feature code reads ids from here, never from string literals.

export type LiveModelKind = 'conversational' | 'translate';

export type LiveModel = {
  id: string;
  label: string;
  kind: LiveModelKind;
  note: string;
};

export const LIVE_MODELS = [
  {
    id: 'gemini-3.8-live',
    label: 'Gemini 3.8 Live',
    kind: 'conversational',
    note: 'Default Live model for low-latency voice agents. Follows a system instruction, so it can act as a two-way interpreter in one session.',
  },
  {
    id: 'gemini-3.8-live-extended-thinking',
    label: 'Gemini 3.8 Live Extended Thinking',
    kind: 'conversational',
    note: 'Adds background reasoning; turnComplete does not mean idle. Too slow for interpreting.',
  },
  {
    id: 'gemini-3.5-live-translate-preview',
    label: 'Gemini 3.5 Live Translate (preview)',
    kind: 'translate',
    note: 'Dedicated speech-to-speech translation. One target language per session, no voice selection, no tools. Two-way needs one session per target language.',
  },
  {
    id: 'gemini-3.1-flash-live-preview',
    label: 'Gemini 3.1 Flash Live (legacy preview)',
    kind: 'conversational',
    note: 'Legacy; Google recommends 3.8 Live.',
  },
] as const satisfies readonly LiveModel[];

export type LiveModelId = (typeof LIVE_MODELS)[number]['id'];

/** The model the interpreter session uses. */
export const INTERPRETER_MODEL: LiveModelId = 'gemini-3.8-live';

/** Ephemeral tokens only work with v1beta. */
export const LIVE_API_VERSION = 'v1beta';

/** Raw 16-bit little-endian mono PCM both ways. */
export const LIVE_AUDIO = {
  inputSampleRate: 16000,
  inputMimeType: 'audio/pcm;rate=16000',
  outputSampleRate: 24000,
  /** The docs recommend sending audio in chunks of about 100 ms. */
  inputChunkMs: 100,
} as const;

/**
 * Server voice activity detection for hands-free turns (docs: capabilities, "Understanding VAD
 * parameters"). 500–800 ms of silence is the recommended end of turn; the server's own default
 * is about 800 ms. Sensitivities stay at the server default (HIGH on the Gemini API).
 * Tune by hand in the noisy-room test (phase 7).
 */
export const LIVE_VAD = {
  silenceDurationMs: 700,
  // prefixPaddingMs stays at the server default: the guide calls it look-back audio before
  // speech, the SDK reference calls it speech required before start is committed.
} as const;

/** Limits from the session-management docs. Not enforced by tests. */
export const LIVE_LIMITS = {
  /** Audio-only session without context compression. */
  sessionMinutes: 15,
  /** A single WebSocket connection; resumption carries the session across. */
  connectionMinutes: 10,
  /** A resumption handle stays valid this long after a connection ends. */
  resumptionHandleHours: 2,
  /** Native audio models. */
  contextWindowTokens: 128_000,
} as const;
