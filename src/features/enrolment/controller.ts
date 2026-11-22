// The enrolment runner: the one place that turns enrolment effects into microphone, model and
// storage work, and feeds results back as events. State lives in the store; this file holds
// only the microphone handle and the recordings, which are dropped as soon as they are embedded.
//
// The UI calls `begin`, `next`, `cancel` and `remove`, renders from `store` (see
// `currentSentence`, `enrolmentProgress`, `isEnrolled`) and reads `level` every frame for a
// meter. `ownerPrint` is what the conversation runtime compares voices with.

import { useSyncExternalStore } from 'react';

import { enrolmentSentences } from '@/config/enrolment';
import { ENROLMENT, VOICE_CLIP, VOICEPRINT_MODEL } from '@/config/voiceprint';
import type { Pcm } from '@/core/session';
import { createStore, type Store } from '@/core/store';
import { average, type Embedding } from '@/core/voiceprint';
import { micLevel } from '@/features/conversation/levels';
import type { AudioInput, KeyValueStorage, VoiceEmbedder } from '@/services';
import { joinPcm, voicedSamples } from '@/services/pcm';
import { ServiceError } from '@/services/types';

import { enrolmentTransition, initialEnrolment, type Enrolment, type EnrolmentEffect, type EnrolmentEvent } from './enrolment';
import { parseVoiceprint, serialiseVoiceprint, VOICEPRINT_KEY } from './saved';

export type EnrolmentController = {
  store: Store<Enrolment>;
  /** Start or redo enrolment in the owner's language. Call from a user gesture (the microphone opens). */
  begin: (language: string) => void;
  /** The owner finished reading the current sentence. */
  next: () => void;
  cancel: () => void;
  /** Delete the saved voiceprint. */
  remove: () => void;
  /** Microphone level while recording, 0..1. Not React state: read it per frame. */
  level: () => number;
  /** The saved voiceprint's embedding, for the conversation runtime. */
  ownerPrint: () => Embedding | undefined;
  dispose: () => void;
};

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const RATE = VOICEPRINT_MODEL.sampleRate;

export function createEnrolment(
  services: { voice: VoiceEmbedder; input: () => AudioInput },
  storage: KeyValueStorage,
  now: () => number = Date.now,
): EnrolmentController {
  const store = createStore(initialEnrolment);
  let input: AudioInput | null = null;
  let off: (() => void) | null = null;
  /** The sentence being recorded now, and the ones kept. */
  let recording: Pcm[] | null = null;
  let kept: Pcm[] = [];
  let level = 0;

  const recorded = () => joinPcm(recording ?? []);
  const voiced = (pcm: Pcm) => voicedSamples(pcm, VOICE_CLIP);

  function dispatch(event: EnrolmentEvent) {
    const [next, effects] = enrolmentTransition(store.get(), event);
    store.set(next);
    effects.forEach(run);
  }

  function closeMic() {
    off?.();
    off = null;
    input?.close();
    level = 0;
  }

  function run(effect: EnrolmentEffect) {
    switch (effect.type) {
      case 'openMic': {
        input ??= services.input();
        off?.();
        off = input.onChunk((pcm) => {
          level = micLevel(pcm);
          if (recording === null) return;
          // Past the cap the rest of the reading is not kept.
          if (recording.reduce((n, c) => n + c.length, 0) < ENROLMENT.maxSeconds * RATE) recording.push(pcm);
        });
        input.open().catch((err: unknown) =>
          dispatch({ type: 'micFailed', kind: err instanceof ServiceError && err.kind === 'micDenied' ? 'micDenied' : 'mic', message: message(err) }),
        );
        // Start loading the model while the owner reads.
        services.voice.load().catch(() => {});
        return;
      }
      case 'closeMic':
        closeMic();
        return;
      case 'recordSentence':
        recording = [];
        return;
      case 'keepSentence':
        kept[effect.index] = voiced(recorded());
        recording = null;
        return;
      case 'computePrint': {
        const clips = kept.slice();
        Promise.all(clips.map((clip) => services.voice.embed(clip))).then(
          (embeddings) => {
            const embedding = average(embeddings);
            if (embedding === undefined) throw new Error('no embeddings');
            dispatch({ type: 'computed', print: { embedding, model: VOICEPRINT_MODEL.id, language: effect.language, createdAt: now() } });
          },
        ).catch((err: unknown) => dispatch({ type: 'computeFailed', message: message(err) }));
        return;
      }
      case 'discardRecordings':
        recording = null;
        kept = [];
        return;
      case 'save':
        void storage.set(VOICEPRINT_KEY, serialiseVoiceprint(effect.print)).catch(() => {});
        return;
      case 'forget':
        void storage.remove(VOICEPRINT_KEY).catch(() => {});
        return;
    }
  }

  storage.get(VOICEPRINT_KEY).then(
    (raw) => dispatch({ type: 'loaded', print: parseVoiceprint(raw), available: services.voice.available }),
    () => dispatch({ type: 'loaded', available: services.voice.available }),
  );

  return {
    store,
    begin: (language) => dispatch({ type: 'begin', language, sentences: enrolmentSentences(language) }),
    next: () => dispatch({ type: 'recorded', voicedSeconds: voiced(recorded()).length / RATE }),
    cancel: () => dispatch({ type: 'cancel' }),
    remove: () => dispatch({ type: 'delete' }),
    level: () => level,
    ownerPrint: () => store.get().print?.embedding,
    dispose: () => {
      dispatch({ type: 'cancel' });
      closeMic();
    },
  };
}

/** The enrolment state for a component to render from. */
export function useEnrolment(controller: EnrolmentController): Enrolment {
  return useSyncExternalStore(controller.store.subscribe, controller.store.get, controller.store.get);
}
