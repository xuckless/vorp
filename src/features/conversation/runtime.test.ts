/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { DEFAULT_PARTICIPANTS } from '@/config/conversation';
import { DEFAULT_SETTINGS } from '@/config/policies';
import type { SessionSettings } from '@/core/session';
import {
  ServiceError,
  type AudioInput,
  type AudioOutput,
  type AudioOutputEvent,
  type Services,
  type Translator,
  type TranslatorEvent,
} from '@/services/types';

import { createRuntime } from './runtime';

// In-memory fakes record calls and let the test push events, standing in for the devices
// and the network.
const MANUAL: SessionSettings = { ...DEFAULT_SETTINGS, detection: 'manual' };
const settle = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

function fakes(failures: { input?: Error; connect?: Error } = {}) {
  const calls: string[] = [];
  let chunk: ((pcm: Int16Array) => void) | undefined;
  let translatorEvent: ((e: TranslatorEvent) => void) | undefined;
  let outputEvent: ((e: AudioOutputEvent) => void) | undefined;

  const input: AudioInput = {
    open: async () => {
      calls.push('input.open');
      if (failures.input) throw failures.input;
    },
    close: () => void calls.push('input.close'),
    onChunk: (l) => {
      chunk = l;
      return () => {
        chunk = undefined;
      };
    },
  };
  const output: AudioOutput = {
    open: async () => void calls.push('output.open'),
    close: () => void calls.push('output.close'),
    enqueue: (id) => void calls.push(`output.enqueue ${id}`),
    finish: (id) => void calls.push(`output.finish ${id}`),
    stop: () => void calls.push('output.stop'),
    level: () => 0,
    onEvent: (l) => {
      outputEvent = l;
      return () => {};
    },
  };
  const translator: Translator = {
    connect: async (_participants, settings) => {
      calls.push(`translator.connect ${settings.detection}`);
      if (failures.connect) throw failures.connect;
    },
    close: () => void calls.push('translator.close'),
    beginTurn: () => void calls.push('translator.beginTurn'),
    sendAudio: (pcm) => void calls.push(`translator.sendAudio ${pcm.length}`),
    endTurn: () => void calls.push('translator.endTurn'),
    onEvent: (l) => {
      translatorEvent = l;
      return () => {};
    },
  };
  const services: Services = { input, output, translator, recap: { summarise: async () => ({}) } };
  return {
    services,
    calls,
    mic: (pcm: Int16Array) => chunk?.(pcm),
    server: (e: TranslatorEvent) => translatorEvent?.(e),
    speaker: (e: AudioOutputEvent) => outputEvent?.(e),
  };
}

test('one push-to-talk turn runs through the services and back into the store', async () => {
  const f = fakes();
  const rt = createRuntime(f.services, DEFAULT_PARTICIPANTS, MANUAL);
  const [en] = DEFAULT_PARTICIPANTS;

  rt.dispatch({ type: 'start' });
  await settle();
  expect(rt.store.get().connection).toBe('open');

  f.mic(new Int16Array(10)); // not talking yet: dropped
  rt.dispatch({ type: 'pressTalk', speakerId: en.id });
  f.mic(new Int16Array(1600));
  f.server({ type: 'inputTranscript', text: 'Hello' });
  rt.dispatch({ type: 'releaseTalk', speakerId: en.id });
  f.mic(new Int16Array(10)); // released: dropped
  f.server({ type: 'outputTranscript', text: 'Bonjour' });
  f.server({ type: 'outputAudio', pcm: new Int16Array(2400) });
  f.speaker({ type: 'started', utteranceId: 'u1' });
  f.server({ type: 'turnComplete' });
  f.speaker({ type: 'finished', utteranceId: 'u1' });

  expect(rt.store.get().utterances).toEqual([
    { id: 'u1', speakerId: en.id, routedBy: 'button', status: 'done', source: 'Hello', translation: 'Bonjour' },
  ]);
  expect(f.calls).toEqual([
    'input.open',
    'output.open',
    'translator.connect manual',
    'translator.beginTurn',
    'translator.sendAudio 1600',
    'translator.endTurn',
    'output.enqueue u1',
    'output.finish u1',
  ]);
});

test('a dropped connection reconnects through a fresh connect', async () => {
  const f = fakes();
  const rt = createRuntime(f.services, DEFAULT_PARTICIPANTS, DEFAULT_SETTINGS);
  rt.dispatch({ type: 'start' });
  await settle();
  f.server({ type: 'closed', kind: 'timeLimit', reason: 'goAway' });
  expect(rt.store.get().connection).toBe('reconnecting');
  await settle();
  expect(rt.store.get().connection).toBe('open');
  expect(f.calls.filter((c) => c.startsWith('translator.connect'))).toHaveLength(2);
});

test('hands-free: the microphone streams from connect, the server ends the turn', async () => {
  const f = fakes();
  const rt = createRuntime(f.services, DEFAULT_PARTICIPANTS, DEFAULT_SETTINGS);
  rt.dispatch({ type: 'start' });
  await settle();
  f.mic(new Int16Array(1600));
  f.server({ type: 'speechStarted' });
  f.server({ type: 'inputTranscript', text: 'Bonjour à tous', language: 'fr' });
  f.server({ type: 'speechEnded' });
  f.server({ type: 'outputAudio', pcm: new Int16Array(2400) });
  // Still listening while the translation is produced: the model is not, so the audio is held.
  f.mic(new Int16Array(1600));
  f.mic(new Int16Array(1600));
  expect(rt.store.get().utterances[0]).toMatchObject({ speakerId: 'p2', status: 'queued' });
  expect(f.calls).toEqual(['input.open', 'output.open', 'translator.connect auto', 'translator.sendAudio 1600', 'output.enqueue u1']);

  // The reply is complete: what was held goes out, in order, and the microphone is live again.
  f.server({ type: 'turnComplete' });
  f.mic(new Int16Array(1600));
  expect(f.calls.slice(5)).toEqual([
    'output.finish u1',
    'translator.sendAudio 1600',
    'translator.sendAudio 1600',
    'translator.sendAudio 1600',
  ]);
});

test('service errors arrive as typed session errors', async () => {
  const denied = fakes({ input: new ServiceError('micDenied', 'Permission denied') });
  const a = createRuntime(denied.services, DEFAULT_PARTICIPANTS, DEFAULT_SETTINGS);
  a.dispatch({ type: 'start' });
  await settle();
  expect(a.store.get().error?.kind).toBe('micDenied');
  expect(a.store.get().connection).toBe('failed');

  const token = fakes({ connect: new ServiceError('token', 'token server answered 503') });
  const b = createRuntime(token.services, DEFAULT_PARTICIPANTS, DEFAULT_SETTINGS);
  b.dispatch({ type: 'start' });
  await settle();
  expect(b.store.get().error).toEqual({ kind: 'token', message: 'token server answered 503' });

  const unknown = fakes({ connect: new Error('boom') });
  const c = createRuntime(unknown.services, DEFAULT_PARTICIPANTS, DEFAULT_SETTINGS);
  c.dispatch({ type: 'start' });
  await settle();
  expect(c.store.get().error?.kind).toBe('socket');
});
