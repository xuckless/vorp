/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { DEFAULT_PARTICIPANTS } from '@/config/conversation';
import type { AudioInput, AudioOutput, AudioOutputEvent, Services, Translator, TranslatorEvent } from '@/services/types';

import { createRuntime } from './runtime';

// In-memory fakes record calls and let the test push events, standing in for the devices
// and the network.
function fakes() {
  const calls: string[] = [];
  let chunk: ((pcm: Int16Array) => void) | undefined;
  let translatorEvent: ((e: TranslatorEvent) => void) | undefined;
  let outputEvent: ((e: AudioOutputEvent) => void) | undefined;

  const input: AudioInput = {
    open: async () => void calls.push('input.open'),
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
    connect: async () => void calls.push('translator.connect'),
    close: () => void calls.push('translator.close'),
    beginTurn: () => void calls.push('translator.beginTurn'),
    sendAudio: (pcm) => void calls.push(`translator.sendAudio ${pcm.length}`),
    endTurn: () => void calls.push('translator.endTurn'),
    onEvent: (l) => {
      translatorEvent = l;
      return () => {};
    },
  };
  const services: Services = { input, output, translator };
  return {
    services,
    calls,
    mic: (pcm: Int16Array) => chunk?.(pcm),
    server: (e: TranslatorEvent) => translatorEvent?.(e),
    speaker: (e: AudioOutputEvent) => outputEvent?.(e),
  };
}

test('one turn runs through the services and back into the store', async () => {
  const f = fakes();
  const rt = createRuntime(f.services, DEFAULT_PARTICIPANTS);
  const [en] = DEFAULT_PARTICIPANTS;

  rt.dispatch({ type: 'start' });
  await Promise.resolve();
  await Promise.resolve();
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
    { id: 'u1', speakerId: en.id, status: 'done', source: 'Hello', translation: 'Bonjour' },
  ]);
  expect(f.calls).toEqual([
    'input.open',
    'output.open',
    'translator.connect',
    'translator.beginTurn',
    'translator.sendAudio 1600',
    'translator.endTurn',
    'output.enqueue u1',
    'output.finish u1',
  ]);
});

test('a dropped connection reconnects through a fresh connect', async () => {
  const f = fakes();
  const rt = createRuntime(f.services, DEFAULT_PARTICIPANTS);
  rt.dispatch({ type: 'start' });
  await Promise.resolve();
  await Promise.resolve();
  f.server({ type: 'closed', reason: 'goAway' });
  expect(rt.store.get().connection).toBe('reconnecting');
  await Promise.resolve();
  await Promise.resolve();
  expect(rt.store.get().connection).toBe('open');
  expect(f.calls.filter((c) => c === 'translator.connect')).toHaveLength(2);
});
