// The effect runner: the single place that turns effects into I/O and I/O results back
// into events. State lives in the store; this file holds only resource handles.

import {
  initialSession,
  transition,
  type Effect,
  type Participant,
  type Pcm,
  type Session,
  type SessionErrorKind,
  type SessionEvent,
  type SessionSettings,
} from '@/core/session';
import { LIVE_AUDIO } from '@/config/models';
import { createStore, type Store } from '@/core/store';
import type { Services } from '@/services';
import { ServiceError } from '@/services/types';

export type Runtime = {
  store: Store<Session>;
  dispatch: (event: SessionEvent) => void;
  dispose: () => void;
};

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The kind a service named, or the fallback for errors no service classified. */
function kindOf<K extends SessionErrorKind>(err: unknown, allowed: readonly K[], fallback: K): K {
  return err instanceof ServiceError && (allowed as readonly SessionErrorKind[]).includes(err.kind) ? (err.kind as K) : fallback;
}

export function createRuntime(services: Services, participants: Participant[], settings: SessionSettings): Runtime {
  const { input, output, translator } = services;
  const store = createStore(initialSession(participants, settings));
  /** The live microphone-to-translator pipe while the reducer says the microphone is open. */
  let pipe: (() => void) | null = null;

  /** Microphone audio kept back while the model replies; null when audio goes straight out. */
  let held: { chunks: Pcm[]; max: number } | null = null;

  function release() {
    held?.chunks.splice(0).forEach((pcm) => translator.sendAudio(pcm));
  }

  function dispatch(event: SessionEvent) {
    const [next, effects] = transition(store.get(), event);
    store.set(next);
    effects.forEach(run);
  }

  function run(effect: Effect) {
    switch (effect.type) {
      case 'connect':
        translator.connect(effect.participants, effect.settings).then(
          () => dispatch({ type: 'connected' }),
          (err: unknown) =>
            dispatch({ type: 'connectFailed', kind: kindOf(err, ['token', 'socket'], 'socket'), message: message(err) }),
        );
        return;
      case 'disconnect':
        translator.close();
        return;
      case 'openAudio':
        // Both opens start synchronously inside the user gesture.
        Promise.all([input.open(), output.open()]).catch((err: unknown) =>
          dispatch({ type: 'audioFailed', kind: kindOf(err, ['micDenied', 'mic'], 'mic'), message: `audio: ${message(err)}` }),
        );
        return;
      case 'closeAudio':
        input.close();
        output.close();
        return;
      case 'startCapture':
        pipe?.();
        pipe = input.onChunk((pcm) => {
          if (held === null) return translator.sendAudio(pcm);
          held.chunks.push(pcm);
          if (held.chunks.length > held.max) release();
        });
        return;
      case 'stopCapture':
        pipe?.();
        pipe = null;
        if (held !== null) held.chunks = [];
        return;
      case 'holdAudio':
        held ??= { chunks: [], max: (effect.maxSeconds * 1000) / LIVE_AUDIO.inputChunkMs };
        return;
      case 'releaseAudio':
        release();
        held = null;
        return;
      case 'beginTurn':
        translator.beginTurn();
        return;
      case 'endTurn':
        translator.endTurn();
        return;
      case 'enqueuePlayback':
        output.enqueue(effect.utteranceId, effect.pcm);
        return;
      case 'finishPlayback':
        output.finish(effect.utteranceId);
        return;
      case 'stopPlayback':
        output.stop();
        return;
    }
  }

  // The subscriptions live as long as the runtime; dispose only ends the conversation, so a
  // React effect that runs twice in development can restart it.
  translator.onEvent((e) =>
    dispatch(e.type === 'closed' ? { type: 'connectionLost', kind: e.kind, message: e.reason } : e),
  );
  output.onEvent((e) =>
    dispatch(
      e.type === 'started'
        ? { type: 'playbackStarted', utteranceId: e.utteranceId }
        : { type: 'playbackFinished', utteranceId: e.utteranceId },
    ),
  );

  return {
    store,
    dispatch,
    dispose: () => dispatch({ type: 'stop' }),
  };
}
