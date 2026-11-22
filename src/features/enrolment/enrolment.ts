// Voice enrolment as one enum and one pure transition. The owner reads three sentences in their
// own language; each recording's embedding is averaged into the owner's voiceprint, which is
// kept on the device (the embedding only, never audio). It can be redone and deleted.
//
//   loading → notEnrolled | enrolled | unavailable
//   notEnrolled | enrolled | failed → recording (sentence 1..3) → computing → enrolled | failed
//
// Audio stays in the controller (`controller.ts`); the reducer sees only how much voice a
// recording held, and asks for audio work through effects.

import { ENROLMENT } from '@/config/voiceprint';
import type { Embedding } from '@/core/voiceprint';

/** What is kept on the device after enrolment. */
export type OwnerVoiceprint = {
  embedding: Embedding;
  /** The model that made it; a print from another model is not comparable and is discarded. */
  model: string;
  /** The language the sentences were read in. */
  language: string;
  /** When it was made, ms since the epoch. */
  createdAt: number;
};

export type EnrolmentStatus =
  /** Reading the saved voiceprint. */
  | 'loading'
  /** This platform cannot run the voiceprint model (native): language routing only. */
  | 'unavailable'
  | 'notEnrolled'
  /** The owner is reading sentence `index`. */
  | 'recording'
  /** The three recordings are being turned into a voiceprint. */
  | 'computing'
  | 'enrolled'
  | 'failed';

export type EnrolmentErrorKind =
  /** The last recording held too little voice: the same sentence is asked for again. */
  | 'tooShort'
  | 'micDenied'
  | 'mic'
  /** The voiceprint model could not load or run. */
  | 'model';

export type EnrolmentError = { kind: EnrolmentErrorKind; message: string };

export type Enrolment = {
  status: EnrolmentStatus;
  /** The saved voiceprint. Kept while enrolment is redone, until a new one replaces it. */
  print?: OwnerVoiceprint;
  /** The language being enrolled in and its sentences (from `config/enrolment.ts`). */
  language?: string;
  sentences: readonly string[];
  /** The sentence being read, 0-based. */
  index: number;
  error?: EnrolmentError;
};

export type EnrolmentEvent =
  | { type: 'loaded'; print?: OwnerVoiceprint; available: boolean }
  /** Start (or redo) enrolment. */
  | { type: 'begin'; language: string; sentences: readonly string[] }
  /** The owner finished reading the current sentence; `voicedSeconds` is how much voice it held. */
  | { type: 'recorded'; voicedSeconds: number }
  | { type: 'computed'; print: OwnerVoiceprint }
  | { type: 'computeFailed'; message: string }
  | { type: 'micFailed'; kind: 'micDenied' | 'mic'; message: string }
  | { type: 'cancel' }
  /** Delete the saved voiceprint. */
  | { type: 'delete' };

export type EnrolmentEffect =
  | { type: 'openMic' }
  | { type: 'closeMic' }
  /** Start a fresh recording for this sentence, dropping any unkept audio. */
  | { type: 'recordSentence'; index: number }
  /** Keep the recording just made as this sentence's. */
  | { type: 'keepSentence'; index: number }
  /** Embed the kept recordings, average them, and answer `computed` or `computeFailed`. */
  | { type: 'computePrint'; language: string }
  /** Drop every recording (cancelled, failed or done). */
  | { type: 'discardRecordings' }
  | { type: 'save'; print: OwnerVoiceprint }
  | { type: 'forget' };

export type EnrolmentTransition = [Enrolment, EnrolmentEffect[]];

export const SENTENCE_COUNT = 3;

export const initialEnrolment: Enrolment = { status: 'loading', sentences: [], index: 0 };

/** Whether a voiceprint is saved, whatever is happening now. */
export function isEnrolled(e: Enrolment): boolean {
  return e.print !== undefined;
}

/** First launch: the platform can enrol and nothing is saved yet. */
export function needsEnrolment(e: Enrolment): boolean {
  return e.status === 'notEnrolled';
}

/** The sentence to read now, while recording. */
export function currentSentence(e: Enrolment): string | undefined {
  return e.status === 'recording' ? e.sentences[e.index] : undefined;
}

/** Share of the sentences recorded, 0..1. */
export function enrolmentProgress(e: Enrolment): number {
  if (e.status === 'computing' || e.status === 'enrolled') return 1;
  return e.status === 'recording' ? e.index / SENTENCE_COUNT : 0;
}

/** The resting status: what the state is when nothing is in progress. */
const rest = (e: Enrolment): EnrolmentStatus => (e.print === undefined ? 'notEnrolled' : 'enrolled');

const busy = (e: Enrolment) => e.status === 'recording' || e.status === 'computing';

export function enrolmentTransition(e: Enrolment, ev: EnrolmentEvent): EnrolmentTransition {
  switch (ev.type) {
    case 'loaded': {
      if (e.status !== 'loading') return [e, []];
      const next = { ...e, print: ev.print };
      return [{ ...next, status: ev.available ? rest(next) : 'unavailable' }, []];
    }

    case 'begin':
      if (e.status === 'loading' || e.status === 'unavailable' || busy(e) || ev.sentences.length < SENTENCE_COUNT) return [e, []];
      return [
        { ...e, status: 'recording', language: ev.language, sentences: ev.sentences.slice(0, SENTENCE_COUNT), index: 0, error: undefined },
        [{ type: 'discardRecordings' }, { type: 'openMic' }, { type: 'recordSentence', index: 0 }],
      ];

    case 'recorded': {
      if (e.status !== 'recording') return [e, []];
      if (ev.voicedSeconds < ENROLMENT.minSeconds) {
        const message = `Heard ${ev.voicedSeconds.toFixed(1)} s of voice, need ${ENROLMENT.minSeconds} s`;
        return [{ ...e, error: { kind: 'tooShort', message } }, [{ type: 'recordSentence', index: e.index }]];
      }
      const kept: EnrolmentEffect = { type: 'keepSentence', index: e.index };
      if (e.index + 1 < SENTENCE_COUNT) {
        return [{ ...e, index: e.index + 1, error: undefined }, [kept, { type: 'recordSentence', index: e.index + 1 }]];
      }
      return [
        { ...e, status: 'computing', error: undefined },
        [kept, { type: 'closeMic' }, { type: 'computePrint', language: e.language ?? '' }],
      ];
    }

    case 'computed':
      if (e.status !== 'computing') return [e, []];
      return [{ ...e, status: 'enrolled', print: ev.print, error: undefined }, [{ type: 'discardRecordings' }, { type: 'save', print: ev.print }]];

    case 'computeFailed':
      if (e.status !== 'computing') return [e, []];
      // A voiceprint saved before stays in use.
      return [{ ...e, status: 'failed', error: { kind: 'model', message: ev.message } }, [{ type: 'discardRecordings' }]];

    case 'micFailed':
      if (e.status !== 'recording') return [e, []];
      return [{ ...e, status: 'failed', error: { kind: ev.kind, message: ev.message } }, [{ type: 'closeMic' }, { type: 'discardRecordings' }]];

    case 'cancel':
      if (!busy(e) && e.status !== 'failed') return [e, []];
      return [
        { ...e, status: rest(e), index: 0, error: undefined },
        e.status === 'recording' ? [{ type: 'closeMic' }, { type: 'discardRecordings' }] : [{ type: 'discardRecordings' }],
      ];

    case 'delete':
      if (e.status === 'loading' || e.status === 'unavailable' || busy(e)) return [e, []];
      return [{ ...e, status: 'notEnrolled', print: undefined, error: undefined }, [{ type: 'forget' }]];
  }
}
