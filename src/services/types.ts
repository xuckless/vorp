// The I/O interfaces. Platform and provider code implement these; nothing outside
// src/services knows which implementation runs.

import type { Participant, Pcm, SessionErrorKind, SessionSettings, UtteranceId } from '@/core/session';

export type Unsubscribe = () => void;

/** A failure a service can name, so the runner turns it into the matching session event. */
export class ServiceError extends Error {
  readonly kind: SessionErrorKind;
  constructor(kind: SessionErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = 'ServiceError';
  }
}

/** Microphone capture as 16 kHz mono 16-bit PCM, in about 100 ms chunks. */
export interface AudioInput {
  /** Must be called from a user gesture on web. Idempotent. Rejects with a ServiceError. */
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
  /** The server's voice activity detection heard speech start / stop (hands-free only). */
  | { type: 'speechStarted' }
  | { type: 'speechEnded' }
  /** `language` is the BCP-47 code the server detected, when it reports one. */
  | { type: 'inputTranscript'; text: string; language?: string; finished?: boolean }
  | { type: 'outputTranscript'; text: string; language?: string }
  /** The model's own report of the language it is interpreting from (BCP-47, a participant's). */
  | { type: 'sourceLanguage'; language: string }
  | { type: 'outputAudio'; pcm: Pcm }
  | { type: 'interrupted' }
  | { type: 'turnComplete' }
  /** The connection ended without close() being called: a drop, or goAway at the time limit. */
  | { type: 'closed'; kind: 'socket' | 'timeLimit'; reason: string };

/** A streaming speech-to-speech interpreter session. */
export interface Translator {
  /**
   * Opens a session (resuming the previous one after a drop). Resolves once it is ready;
   * rejects with a ServiceError of kind 'token' or 'socket'.
   */
  connect(participants: readonly Participant[], settings: SessionSettings): Promise<void>;
  /** Ends the session for good; the next connect starts fresh. */
  close(): void;
  /** A held talk button went down. Manual detection marks the turn start; auto does nothing. */
  beginTurn(): void;
  sendAudio(pcm: Pcm): void;
  /** End the current turn now (button released, or the hands-free stream paused). */
  endTurn(): void;
  onEvent(listener: (e: TranslatorEvent) => void): Unsubscribe;
}

export type Services = {
  input: AudioInput;
  output: AudioOutput;
  translator: Translator;
};
