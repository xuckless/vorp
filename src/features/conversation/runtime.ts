// The effect runner: the single place that turns effects into I/O and I/O results back
// into events. State lives in the store; this file holds only resource handles.

import {
  initialSession,
  transition,
  type Effect,
  type Participant,
  type Session,
  type SessionEvent,
} from '@/core/session';
import { createStore, type Store } from '@/core/store';
import type { Services } from '@/services';

export type Runtime = {
  store: Store<Session>;
  dispatch: (event: SessionEvent) => void;
  dispose: () => void;
};

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function createRuntime(services: Services, participants: Participant[]): Runtime {
  const { input, output, translator } = services;
  const store = createStore(initialSession(participants));
  /** The live microphone-to-translator pipe while someone holds a talk button. */
  let pipe: (() => void) | null = null;

  function dispatch(event: SessionEvent) {
    const [next, effects] = transition(store.get(), event);
    store.set(next);
    effects.forEach(run);
  }

  function run(effect: Effect) {
    switch (effect.type) {
      case 'connect':
        translator.connect(effect.participants).then(
          () => dispatch({ type: 'connected' }),
          (err: unknown) => dispatch({ type: 'connectFailed', error: message(err) }),
        );
        return;
      case 'disconnect':
        translator.close();
        return;
      case 'openAudio':
        // Both opens start synchronously inside the user gesture.
        Promise.all([input.open(), output.open()]).catch((err: unknown) =>
          dispatch({ type: 'captureFailed', error: `audio: ${message(err)}` }),
        );
        return;
      case 'closeAudio':
        input.close();
        output.close();
        return;
      case 'startCapture':
        pipe?.();
        pipe = input.onChunk((pcm) => translator.sendAudio(pcm));
        return;
      case 'stopCapture':
        pipe?.();
        pipe = null;
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
    dispatch(e.type === 'closed' ? { type: 'connectionLost', reason: e.reason } : e),
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
