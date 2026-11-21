// The I/O interfaces. Platform and provider code implement these; nothing outside
// src/services knows which implementation runs.

import type { Participant, Pcm, UtteranceId } from '@/core/session';

export type Unsubscribe = () => void;

/** Microphone capture as 16 kHz mono 16-bit PCM, in about 100 ms chunks. */
export interface AudioInput {
  /** Must be called from a user gesture on web. Idempotent. */
  open(): Promise<void>;
  close(): void;
  onChunk(listener: (pcm: Pcm) => void): Unsubscribe;
}

export type AudioOutputEvent =
  | { type: 'started'; utteranceId: UtteranceId }
  | { type: 'finished'; utteranceId: UtteranceId };

/** Gapless playback of 24 kHz mono 16-bit PCM, tagged by utterance. */
export interface AudioOutput {
  /** Must be called from a user gesture on web. Idempotent. */
  open(): Promise<void>;
  close(): void;
  enqueue(utteranceId: UtteranceId, pcm: Pcm): void;
  /** No more audio will arrive for this utterance; 'finished' fires once it has played. */
  finish(utteranceId: UtteranceId): void;
  /** Drop everything queued or playing. */
  stop(): void;
  /** Current output level, 0..1, for the voice visualiser. */
  level(): number;
  onEvent(listener: (e: AudioOutputEvent) => void): Unsubscribe;
}

export type TranslatorEvent =
  | { type: 'inputTranscript'; text: string }
  | { type: 'outputTranscript'; text: string }
  | { type: 'outputAudio'; pcm: Pcm }
  | { type: 'turnComplete' }
  /** The connection ended without close() being called (drop, goAway, server close). */
  | { type: 'closed'; reason: string };

/** A streaming speech-to-speech interpreter session. */
export interface Translator {
  /** Opens a session (resuming the previous one after a drop). Resolves once it is ready. */
  connect(participants: readonly Participant[]): Promise<void>;
  /** Ends the session for good; the next connect starts fresh. */
  close(): void;
  beginTurn(): void;
  sendAudio(pcm: Pcm): void;
  endTurn(): void;
  onEvent(listener: (e: TranslatorEvent) => void): Unsubscribe;
}

export type Services = {
  input: AudioInput;
  output: AudioOutput;
  translator: Translator;
};
