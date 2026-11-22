// The effect runner: the single place that turns effects into I/O and I/O results back
// into events. State lives in the store; this file holds only resource handles.

import {
  initialSession,
  transition,
  type Effect,
  type People,
  type Pcm,
  type Role,
  type Session,
  type SessionErrorKind,
  type SessionEvent,
  type SessionSettings,
  type Utterance,
} from '@/core/session';
import { LIVE_AUDIO } from '@/config/models';
import { createStore, type Store } from '@/core/store';
import type { Embedding } from '@/core/voiceprint';
import type { Services } from '@/services';
import { ServiceError } from '@/services/types';

import { createVoiceJudge, NO_PRINTS, type InterpreterPrints } from './voice';

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

export function createRuntime(
  services: Services,
  people: People,
  settings: SessionSettings,
  /** Called with each conversation that ends with something heard in it, and the languages spoken in it. */
  onArchive: (languages: Record<Role, string>, utterances: Utterance[]) => void = () => {},
  /** The owner's enrolled voiceprint, if any (see features/enrolment). Without one only the echo filter uses voices. */
  ownerPrint: () => Embedding | undefined = () => undefined,
  /** Vorp's own voice as learnt in earlier conversations, per interpreter voice (see ./interpreter-prints.ts). */
  interpreterPrints: InterpreterPrints = NO_PRINTS,
): Runtime {
  const { input, output, translator } = services;
  const store = createStore(initialSession(people, settings));
  const voice = createVoiceJudge(services.voice, ownerPrint, (event) => dispatch(event), interpreterPrints);
  /** The live microphone-to-translator pipe while the reducer says the microphone is open. */
  let pipe: (() => void) | null = null;

  /** Microphone audio kept back while the model replies; null when audio goes straight out. */
  let held: { chunks: Pcm[]; max: number } | null = null;

  /** Every chunk that reaches the translator is also what a voice verdict is computed from. */
  function send(pcm: Pcm) {
    translator.sendAudio(pcm);
    voice.sent(pcm);
  }

  function release() {
    held?.chunks.splice(0).forEach(send);
  }

  function dispatch(event: SessionEvent) {
    const [next, effects] = transition(store.get(), event);
    store.set(next);
    effects.forEach(run);
  }

  function run(effect: Effect) {
    switch (effect.type) {
      case 'connect':
        voice.connected(effect.people.owner.voice);
        translator.connect(effect.people, effect.settings).then(
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
          if (held === null) return send(pcm);
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
      case 'recogniseVoice':
        voice.recognise(effect.utteranceId);
        return;
      case 'beginTurn':
        translator.beginTurn();
        return;
      case 'endTurn':
        translator.endTurn();
        return;
      case 'enqueuePlayback':
        voice.played(effect.utteranceId, effect.pcm);
        output.enqueue(effect.utteranceId, effect.pcm);
        return;
      case 'finishPlayback':
        output.finish(effect.utteranceId);
        voice.finished(effect.utteranceId);
        return;
      case 'stopPlayback':
        output.stop();
        voice.stopped();
        return;
      case 'archive':
        onArchive(effect.languages, effect.utterances);
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
