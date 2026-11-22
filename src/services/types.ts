// The I/O interfaces. Platform and provider code implement these; nothing outside
// src/services knows which implementation runs.

import type { People, Pcm, SessionErrorKind, SessionSettings, UtteranceId } from '@/core/session';
import type { Outbound, PairEvent, PairRole } from '@/core/pairing';
import type { Embedding } from '@/core/voiceprint';

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
  | { type: 'finished'; utteranceId: UtteranceId }
  /** Audio was queued but the platform keeps playback locked (iPhone Safari without a tap). */
  | { type: 'blocked' };

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
  /** How much of an utterance's audio queued so far has played, 0..1 (0 when unknown). */
  progress(utteranceId: UtteranceId): number;
  onEvent(listener: (e: AudioOutputEvent) => void): Unsubscribe;
}

export type TranslatorEvent =
  /** The server's voice activity detection heard speech start / stop (hands-free only). */
  | { type: 'speechStarted' }
  | { type: 'speechEnded' }
  /** `language` is the BCP-47 code the server detected, when it reports one. */
  | { type: 'inputTranscript'; text: string; language?: string; finished?: boolean }
  | { type: 'outputTranscript'; text: string; language?: string }
  /** The model's own report of the language it is interpreting from (BCP-47, normalised against the languages table; any language). */
  | { type: 'sourceLanguage'; language: string }
  /** A caption-only note on the utterance being interpreted. */
  | { type: 'note'; text: string }
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
  connect(people: People, settings: SessionSettings): Promise<void>;
  /** Ends the session for good; the next connect starts fresh. */
  close(): void;
  /** A held talk button went down. Manual detection marks the turn start; auto does nothing. */
  beginTurn(): void;
  sendAudio(pcm: Pcm): void;
  /** End the current turn now (button released, or the hands-free stream paused). */
  endTurn(): void;
  onEvent(listener: (e: TranslatorEvent) => void): Unsubscribe;
}

/** Writes the recap of a finished conversation, once per language. */
export interface Recap {
  /** `languages` are names ("English"); `lines` the conversation, oldest first. Keyed by language name. */
  summarise(languages: readonly string[], lines: readonly string[]): Promise<Record<string, string>>;
}

/**
 * Speaker embeddings on the device: 16 kHz mono PCM in, a voiceprint-model embedding out. Audio
 * never leaves the device and is not kept. Web runs the model in a worker (WASM); native reports
 * itself unavailable, so language routing applies there.
 */
export interface VoiceEmbedder {
  /** Whether this platform can run the model at all. */
  readonly available: boolean;
  /** Fetch and start the model ahead of the first `embed`. Idempotent; rejects if it cannot load. */
  load(): Promise<void>;
  /** Embeds in the order called. Rejects when unavailable or the model fails. */
  embed(pcm: Pcm): Promise<Embedding>;
}

/** What the pairing socket reports: the room's own messages, and what the other phone relayed. */
export type PairingLinkEvent = Extract<
  PairEvent,
  {
    type:
      | 'welcome'
      | 'peerJoined'
      | 'peerAway'
      | 'peerBack'
      | 'ended'
      | 'refused'
      | 'dropped'
      | 'rejoining'
      | 'lost'
      | 'peerSpeaking'
      | 'peerTurn'
      | 'peerCaption'
      | 'peerAudio'
      | 'peerPlayback';
  }
>;

/**
 * One phone's link to a pairing room on the token server (docs/pairing-protocol.md). It keeps the
 * room's keys, pings, and rejoins by itself after a drop while paired; everything else is the
 * caller's.
 */
export interface PairingLink {
  /** Host: make a room. Rejects when the server refuses (busy, rate limited) or cannot be reached. */
  create(): Promise<{ code: string; expiresIn: number }>;
  /** Open the room's socket and say hello (the host with its key from `create`). */
  open(role: PairRole, code: string, language: string): void;
  send(message: Outbound): void;
  /** This phone's translated audio, 24 kHz 16-bit mono, as it arrives. */
  sendAudio(pcm: Pcm): void;
  /** Stop for both: say `end`, then close. */
  end(): void;
  /** Close without a word; nothing more is reported. */
  close(): void;
  onEvent(listener: (e: PairingLinkEvent) => void): Unsubscribe;
}

/** Keeps the screen on while it is wanted. */
export interface WakeLock {
  set(on: boolean): void;
}

/** The join and live moments: a short sound and a tap of haptics. */
export interface Cues {
  /** Inside a user gesture: get the sound ready, so later cues play on iPhone too. */
  prime(): void;
  play(kind: 'joined' | 'live'): void;
}

/** String values by key, on the device only. */
export interface KeyValueStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export type Services = {
  input: AudioInput;
  output: AudioOutput;
  translator: Translator;
  recap: Recap;
  voice: VoiceEmbedder;
};
