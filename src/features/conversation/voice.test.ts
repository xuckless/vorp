/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { LIVE_AUDIO } from '@/config/models';
import { VOICEPRINT_MODEL } from '@/config/voiceprint';
import type { SessionEvent } from '@/core/session';
import type { VoiceEmbedder } from '@/services/types';

import { createInterpreterPrints, parseInterpreterPrints, serialiseInterpreterPrints } from './interpreter-prints';
import { createClipBuffer, createVoiceJudge, judgeableVoice, verdictEvent } from './voice';

test('the clip buffer returns what arrived since the last take, at most its size', () => {
  const clips = createClipBuffer(4);
  clips.push(new Int16Array([1, 2]));
  clips.push(new Int16Array([3]));
  expect(Array.from(clips.take())).toEqual([1, 2, 3]);
  expect(clips.take()).toHaveLength(0);
  [1, 2, 3, 4, 5, 6].forEach((x) => clips.push(new Int16Array([x])));
  expect(Array.from(clips.take())).toEqual([3, 4, 5, 6]);
});

test('under the minimum of voice there is nothing to judge', () => {
  const second = VOICEPRINT_MODEL.sampleRate;
  expect(judgeableVoice(new Int16Array(second).fill(5000))).toBeUndefined();
  expect(judgeableVoice(new Int16Array(2 * second).fill(5000))).toHaveLength(2 * second);
  // Silence does not count as voice.
  expect(judgeableVoice(new Int16Array(4 * second))).toBeUndefined();
});

test('verdicts become events; unsure sends nothing', () => {
  expect(verdictEvent({ kind: 'owner' }, 'u1')).toEqual({ type: 'speakerRecognised', speaker: 'owner', utteranceId: 'u1' });
  expect(verdictEvent({ kind: 'other' }, 'u1')).toEqual({ type: 'speakerRecognised', speaker: 'other', utteranceId: 'u1' });
  expect(verdictEvent({ kind: 'echo' }, 'u2')).toEqual({ type: 'echoRecognised', utteranceId: 'u2' });
  expect(verdictEvent({ kind: 'unsure' }, 'u1')).toBeUndefined();
});

// Vorp's own voice, remembered per interpreter voice.

const DIMS = VOICEPRINT_MODEL.dimensions;
const vector = (seed: number) => Array.from({ length: DIMS }, (_, i) => Math.sin(i * seed + seed));
/** An embedder that answers every clip with the same embedding. */
const embedder = (embedding: number[]): VoiceEmbedder => ({ available: true, load: () => Promise.resolve(), embed: () => Promise.resolve(embedding) });
const voiced = (seconds: number, rate: number) => new Int16Array(Math.round(seconds * rate)).fill(5000);
const flush = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

test('a remembered interpreter print names an echo from the first reply', async () => {
  const vorp = vector(1);
  const events: SessionEvent[] = [];
  const prints = createInterpreterPrints({ Charon: [vorp] }, () => {});
  const judge = createVoiceJudge(embedder(vorp), () => undefined, (e) => events.push(e), prints);
  judge.connected('Charon');
  judge.sent(voiced(2, VOICEPRINT_MODEL.sampleRate));
  judge.recognise('u1');
  await flush();
  expect(events).toEqual([{ type: 'echoRecognised', utteranceId: 'u1' }]);
});

test('another interpreter voice does not use that print', async () => {
  const events: SessionEvent[] = [];
  const prints = createInterpreterPrints({ Charon: [vector(1)] }, () => {});
  const judge = createVoiceJudge(embedder(vector(1)), () => undefined, (e) => events.push(e), prints);
  judge.connected('Kore');
  judge.sent(voiced(2, VOICEPRINT_MODEL.sampleRate));
  judge.recognise('u1');
  await flush();
  expect(events).toEqual([]);
});

test('what is learnt from a played reply is kept for its voice', async () => {
  const saved: string[] = [];
  const prints = createInterpreterPrints({}, (raw) => saved.push(raw));
  const judge = createVoiceJudge(embedder(vector(2)), () => undefined, () => {}, prints);
  judge.connected('Puck');
  judge.played('u1', voiced(3, LIVE_AUDIO.outputSampleRate));
  judge.finished('u1');
  await flush();
  expect(prints.get('Puck')).toEqual([vector(2)]);
  expect(parseInterpreterPrints(saved[saved.length - 1])).toEqual({ Puck: [vector(2)] });
});

test('stored prints from another model or of the wrong size are not used', () => {
  const good = serialiseInterpreterPrints({ Charon: [vector(1)] });
  expect(parseInterpreterPrints(good)).toEqual({ Charon: [vector(1)] });
  expect(parseInterpreterPrints(JSON.stringify({ model: 'other', voices: { Charon: [vector(1)] } }))).toEqual({});
  expect(parseInterpreterPrints(JSON.stringify({ model: VOICEPRINT_MODEL.id, voices: { Charon: [[1, 2, 3]] } }))).toEqual({});
  expect(parseInterpreterPrints('not json')).toEqual({});
  expect(parseInterpreterPrints(null)).toEqual({});
});
