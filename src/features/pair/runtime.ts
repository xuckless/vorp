// A paired phone's effect runner: the single place that turns the pairing's effects into I/O and
// I/O results back into events. State lives in the store; this file holds only resource handles
// (the other person's audio kept until its turn plays, timers, the playback progress poll).
// This phone's interpreter session runs through the shared session runner.

import { PAIR_TIMING } from '@/config/pairing';
import { initialPairing, transition, type Pairing, type PairEffect, type PairEvent, type PairRole, type PairSetup } from '@/core/pairing';
import type { Pcm, Role, Utterance } from '@/core/session';
import { createStore, type Store } from '@/core/store';
import type { Embedding } from '@/core/voiceprint';
import { createLevels, type Levels } from '@/features/conversation/levels';
import { createSessionRunner } from '@/features/conversation/runtime';
import { NO_PRINTS, type InterpreterPrints } from '@/features/conversation/voice';
import { ServiceError, type PairServices } from '@/services/types';

export type PairRuntimeOptions = {
  /** Host: keep the conversation (History, and the recap if it is on). */
  onArchive?: (languages: Record<Role, string>, utterances: Utterance[]) => void;
  ownerPrint?: () => Embedding | undefined;
  interpreterPrints?: InterpreterPrints;
  /** Guest: go to the landing page, in this language. */
  onLeave?: (language: string) => void;
};

export type PairRuntime = {
  store: Store<Pairing>;
  dispatch: (event: PairEvent) => void;
  levels: Levels;
  /**
   * Ends the room for both if one is running and lets its resources go. The runtime stays usable,
   * so a React effect that runs twice in development can start again.
   */
  dispose: () => void;
};

export function createPairRuntime(services: PairServices, role: PairRole, setup: PairSetup, code: string | undefined, options: PairRuntimeOptions = {}): PairRuntime {
  const { input, output, link, wake, cues } = services;
  const store = createStore(initialPairing(role, setup, code));
  const session = createSessionRunner(services, (event) => dispatch({ type: 'own', event }), {
    ownerPrint: options.ownerPrint,
    interpreterPrints: options.interpreterPrints ?? NO_PRINTS,
    // The speaker here plays the other phone's interpreter.
    heardVoice: (people) => people.other.voice,
  });
  const kept = new Map<string, Pcm[]>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let poll: { turn: string; timer: ReturnType<typeof setInterval> } | null = null;

  function dispatch(event: PairEvent) {
    const [next, effects] = transition(store.get(), event, PAIR_TIMING);
    store.set(next);
    effects.forEach(run);
  }

  function play(turn: string, pcm: Pcm) {
    session.voice.played(turn, pcm);
    output.enqueue(turn, pcm);
  }

  function stopPoll() {
    if (poll) clearInterval(poll.timer);
    poll = null;
  }

  function run(effect: PairEffect) {
    switch (effect.type) {
      case 'own':
        session.run(effect.effect);
        return;
      case 'openAudio':
        // All three start synchronously inside the tap: the microphone, the speaker, the cues.
        cues.prime();
        Promise.all([input.open(), output.open()]).then(
          () => dispatch({ type: 'audioOpened' }),
          (err: unknown) => dispatch({ type: 'audioFailed', kind: err instanceof ServiceError && err.kind === 'micDenied' ? 'micDenied' : 'mic' }),
        );
        return;
      case 'createRoom': {
        const room = effect.room;
        link.create().then(
          ({ code: made, expiresIn }) => dispatch({ type: 'roomCreated', room, code: made, expiresIn, at: Date.now() }),
          () => dispatch({ type: 'roomFailed', room }),
        );
        return;
      }
      case 'connectRoom':
        link.open(effect.role, effect.code, effect.language);
        return;
      case 'send':
        link.send(effect.message);
        return;
      case 'sendAudio':
        link.sendAudio(effect.pcm);
        return;
      case 'endRoom':
        link.end();
        return;
      case 'closeRoom':
        link.close();
        return;
      case 'keepIncoming': {
        const list = kept.get(effect.turn) ?? [];
        list.push(effect.pcm);
        kept.set(effect.turn, list);
        return;
      }
      case 'playIncoming': {
        const turn = effect.turn;
        kept.get(turn)?.forEach((pcm) => play(turn, pcm));
        kept.delete(turn);
        stopPoll();
        poll = {
          turn,
          timer: setInterval(() => {
            const progress = Math.round(output.progress(turn) * 100) / 100;
            if (progress > 0) dispatch({ type: 'incomingProgress', turn, progress });
          }, PAIR_TIMING.progressEveryMs),
        };
        return;
      }
      case 'enqueueIncoming':
        play(effect.turn, effect.pcm);
        return;
      case 'finishIncoming':
        output.finish(effect.turn);
        session.voice.finished(effect.turn);
        return;
      case 'dropIncoming':
        kept.delete(effect.turn);
        return;
      case 'stopIncoming':
        stopPoll();
        kept.clear();
        output.stop();
        session.voice.stopped();
        return;
      case 'timer': {
        const { what, room } = effect;
        const timer = setTimeout(() => {
          timers.delete(timer);
          dispatch({ type: 'timer', what, room });
        }, effect.ms);
        timers.add(timer);
        return;
      }
      case 'keepAwake':
        wake.set(effect.on);
        return;
      case 'cue':
        cues.play(effect.kind);
        return;
      case 'unlockSound':
        void output.open().catch(() => {});
        return;
      case 'leave':
        options.onLeave?.(effect.language);
        return;
      case 'archive':
        options.onArchive?.(effect.languages, effect.utterances);
        return;
    }
  }

  link.onEvent(dispatch);
  output.onEvent((e) => {
    if (e.type === 'blocked') return dispatch({ type: 'soundBlocked' });
    if (e.type !== 'finished') return;
    if (poll?.turn === e.utteranceId) stopPoll();
    dispatch({ type: 'incomingFinished', turn: e.utteranceId });
  });

  const levels = createLevels(services);

  return {
    store,
    dispatch,
    levels,
    dispose() {
      dispatch({ type: 'stop' });
      timers.forEach(clearTimeout);
      timers.clear();
      stopPoll();
      levels.dispose();
      link.close();
      wake.set(false);
    },
  };
}
