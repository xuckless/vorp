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

import { createVoiceJudge, NO_PRINTS, type InterpreterPrints, type VoiceJudge } from './voice';

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

/** What the session's runner needs besides the services. */
export type SessionRunnerOptions = {
  /** Called with each conversation that ends with something heard in it, and the languages spoken in it. */
  onArchive?: (languages: Record<Role, string>, utterances: Utterance[]) => void;
  /** The owner's enrolled voiceprint, if any (see features/enrolment). Without one only the echo filter uses voices. */
  ownerPrint?: () => Embedding | undefined;
  /** Vorp's own voice as learnt in earlier conversations, per interpreter voice (see ./interpreter-prints.ts). */
  interpreterPrints?: InterpreterPrints;
  /**
   * The interpreter voice this device's speaker plays, for the echo filter: the session's own
   * (one device), or the other phone's (a paired phone plays the other person's interpreter).
   */
  heardVoice?: (people: People) => string;
};

export type SessionRunner = {
  /** Run one of the session's effects. */
  run: (effect: Effect) => void;
  /** The voice judge: a paired phone tells it what the other phone's interpreter played here. */
  voice: VoiceJudge;
};

/**
 * Runs a session's effects against the services and feeds the translator's events back through
 * `dispatch`. Shared by the one-device runtime below and a paired phone's (features/pair).
 */
export function createSessionRunner(services: Services, dispatch: (event: SessionEvent) => void, options: SessionRunnerOptions = {}): SessionRunner {
  const { input, output, translator } = services;
  const { onArchive = () => {}, ownerPrint = () => undefined, interpreterPrints = NO_PRINTS, heardVoice = (p: People) => p.owner.voice } = options;
  const voice = createVoiceJudge(services.voice, ownerPrint, dispatch, interpreterPrints);
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

  function run(effect: Effect) {
    switch (effect.type) {
      case 'connect':
        voice.connected(heardVoice(effect.people));
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

  // The subscription lives as long as the runner; a closed connection is a lost one.
  translator.onEvent((e) =>
    dispatch(e.type === 'closed' ? { type: 'connectionLost', kind: e.kind, message: e.reason } : e),
  );

  return { run, voice };
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
  const store = createStore(initialSession(people, settings));
  const runner = createSessionRunner(services, (event) => dispatch(event), { onArchive, ownerPrint, interpreterPrints });

  function dispatch(event: SessionEvent) {
    const [next, effects] = transition(store.get(), event);
    store.set(next);
    effects.forEach(runner.run);
  }

  // The subscriptions live as long as the runtime; dispose only ends the conversation, so a
  // React effect that runs twice in development can restart it.
  services.output.onEvent((e) => {
    if (e.type === 'started') dispatch({ type: 'playbackStarted', utteranceId: e.utteranceId });
    else if (e.type === 'finished') dispatch({ type: 'playbackFinished', utteranceId: e.utteranceId });
  });

  return {
    store,
    dispatch,
    dispose: () => dispatch({ type: 'stop' }),
  };
}
