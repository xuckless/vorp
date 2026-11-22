/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { DEFAULT_PEOPLE } from '@/config/conversation';
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
  type VoiceEmbedder,
} from '@/services/types';
import { NO_VOICE } from '@/services/no-voice';

import { createRuntime } from './runtime';

// In-memory fakes record calls and let the test push events, standing in for the devices
// and the network.
const MANUAL: SessionSettings = { ...DEFAULT_SETTINGS, detection: 'manual' };
const settle = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

function fakes(failures: { input?: Error; connect?: Error } = {}, voice: VoiceEmbedder = NO_VOICE) {
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
    progress: () => 0,
    onEvent: (l) => {
      outputEvent = l;
      return () => {};
    },
  };
  const translator: Translator = {
    connect: async (_people, settings) => {
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
  const services: Services = { input, output, translator, recap: { summarise: async () => ({}) }, voice };
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
  const rt = createRuntime(f.services, DEFAULT_PEOPLE, MANUAL);

  rt.dispatch({ type: 'start' });
  await settle();
  expect(rt.store.get().connection).toBe('open');

  f.mic(new Int16Array(10)); // not talking yet: dropped
  rt.dispatch({ type: 'pressTalk', speaker: 'owner' });
  f.mic(new Int16Array(1600));
  f.server({ type: 'inputTranscript', text: 'Hello' });
  rt.dispatch({ type: 'releaseTalk', speaker: 'owner' });
  f.mic(new Int16Array(10)); // released: dropped
  f.server({ type: 'outputTranscript', text: 'Bonjour' });
  f.server({ type: 'outputAudio', pcm: new Int16Array(2400) });
  f.speaker({ type: 'started', utteranceId: 'u1' });
  f.server({ type: 'turnComplete' });
  f.speaker({ type: 'finished', utteranceId: 'u1' });

  expect(rt.store.get().utterances).toEqual([
    { id: 'u1', speaker: 'owner', routedBy: 'button', status: 'done', source: 'Hello', translation: 'Bonjour' },
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
  const rt = createRuntime(f.services, DEFAULT_PEOPLE, DEFAULT_SETTINGS);
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
  const rt = createRuntime(f.services, DEFAULT_PEOPLE, DEFAULT_SETTINGS);
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
  expect(rt.store.get().utterances[0]).toMatchObject({ speaker: 'other', status: 'queued' });
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
  const a = createRuntime(denied.services, DEFAULT_PEOPLE, DEFAULT_SETTINGS);
  a.dispatch({ type: 'start' });
  await settle();
  expect(a.store.get().error?.kind).toBe('micDenied');
  expect(a.store.get().connection).toBe('failed');

  const token = fakes({ connect: new ServiceError('token', 'token server answered 503') });
  const b = createRuntime(token.services, DEFAULT_PEOPLE, DEFAULT_SETTINGS);
  b.dispatch({ type: 'start' });
  await settle();
  expect(b.store.get().error).toEqual({ kind: 'token', message: 'token server answered 503' });

  const unknown = fakes({ connect: new Error('boom') });
  const c = createRuntime(unknown.services, DEFAULT_PEOPLE, DEFAULT_SETTINGS);
  c.dispatch({ type: 'start' });
  await settle();
  expect(c.store.get().error?.kind).toBe('socket');
});

describe('voices', () => {
  // A stand-in model: the sample value names the voice. The owner speaks at 8000, the other
  // person at -8000, and Vorp at 5000.
  const VOICES: Record<number, number[]> = { 8000: [1, 0, 0], [-8000]: [0, 1, 0], 5000: [0, 0, 1] };
  const voice: VoiceEmbedder = { available: true, load: async () => {}, embed: async (pcm) => VOICES[pcm[0]] };
  const owner = () => [1, 0, 0];
  /** Seconds of microphone audio at 16 kHz in 100 ms chunks. */
  const speak = (f: ReturnType<typeof fakes>, seconds: number, value: number) => {
    for (let i = 0; i < seconds * 10; i++) f.mic(new Int16Array(1600).fill(value));
  };
  const turn = (f: ReturnType<typeof fakes>, text: string, language?: string) => {
    f.server({ type: 'speechStarted' });
    f.server({ type: 'inputTranscript', text, language });
    f.server({ type: 'speechEnded' });
  };

  test("the owner's voice names the speaker over the detected language", async () => {
    const f = fakes({}, voice);
    const rt = createRuntime(f.services, DEFAULT_PEOPLE, DEFAULT_SETTINGS, undefined, owner);
    rt.dispatch({ type: 'start' });
    await settle();
    speak(f, 2, 8000);
    turn(f, 'Bonjour', 'fr');
    await settle();
    expect(rt.store.get().utterances[0]).toMatchObject({ speaker: 'owner', routedBy: 'voice' });
  });

  test('too little voice to judge, or no owner enrolled: the language decides', async () => {
    const short = fakes({}, voice);
    const a = createRuntime(short.services, DEFAULT_PEOPLE, DEFAULT_SETTINGS, undefined, owner);
    a.dispatch({ type: 'start' });
    await settle();
    speak(short, 1, 8000);
    turn(short, 'Bonjour', 'fr');
    await settle();
    expect(a.store.get().utterances[0]).toMatchObject({ speaker: 'other', routedBy: 'language' });

    const none = fakes({}, voice);
    const b = createRuntime(none.services, DEFAULT_PEOPLE, DEFAULT_SETTINGS);
    b.dispatch({ type: 'start' });
    await settle();
    speak(none, 2, 8000);
    turn(none, 'Bonjour', 'fr');
    await settle();
    expect(b.store.get().utterances[0]).toMatchObject({ speaker: 'other', routedBy: 'language' });
  });

  test("Vorp learns its own voice from what it plays and drops it when the microphone hears it", async () => {
    const f = fakes({}, voice);
    const rt = createRuntime(f.services, DEFAULT_PEOPLE, DEFAULT_SETTINGS, undefined, owner);
    rt.dispatch({ type: 'start' });
    await settle();
    speak(f, 2, -8000);
    turn(f, 'Hola amigo', 'es');
    // The translation: 2.5 s of Vorp's voice at 24 kHz.
    f.server({ type: 'outputAudio', pcm: new Int16Array(60000).fill(5000) });
    f.server({ type: 'turnComplete' });
    await settle();
    speak(f, 2, 5000);
    turn(f, 'Hello friend');
    await settle();
    expect(rt.store.get().utterances.map((u) => [u.speaker, u.routedBy, u.status, u.error])).toEqual([
      ['other', 'voice', 'queued', undefined],
      [undefined, 'language', 'failed', 'echo'],
    ]);
  });
});
