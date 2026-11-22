/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { VOICEPRINT_MODEL } from '@/config/voiceprint';

import { createClipBuffer, judgeableVoice, verdictEvent } from './voice';

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
