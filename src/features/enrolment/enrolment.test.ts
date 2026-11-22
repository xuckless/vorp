/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { VOICEPRINT_MODEL } from '@/config/voiceprint';

import {
  currentSentence,
  enrolmentProgress,
  enrolmentTransition,
  initialEnrolment,
  isEnrolled,
  needsEnrolment,
  type Enrolment,
  type EnrolmentEffect,
  type EnrolmentEvent,
  type OwnerVoiceprint,
} from './enrolment';
import { parseVoiceprint, serialiseVoiceprint } from './saved';

const sentences = ['One.', 'Two.', 'Three.'];
const print: OwnerVoiceprint = { embedding: [1, 0], model: VOICEPRINT_MODEL.id, language: 'en', createdAt: 5 };

function run(events: EnrolmentEvent[], from: Enrolment = initialEnrolment): [Enrolment, EnrolmentEffect[][]] {
  const log: EnrolmentEffect[][] = [];
  const state = events.reduce((s, e) => {
    const [next, effects] = enrolmentTransition(s, e);
    log.push(effects);
    return next;
  }, from);
  return [state, log];
}

const types = (effects: EnrolmentEffect[]) => effects.map((e) => e.type);
const loaded: EnrolmentEvent = { type: 'loaded', available: true };
const begin: EnrolmentEvent = { type: 'begin', language: 'en', sentences };
const good: EnrolmentEvent = { type: 'recorded', voicedSeconds: 4 };

test('first launch: nothing saved, so enrolment is needed', () => {
  const [s] = run([loaded]);
  expect(s.status).toBe('notEnrolled');
  expect(needsEnrolment(s)).toBe(true);
  expect(isEnrolled(s)).toBe(false);
});

test('a saved voiceprint is enrolled; native cannot enrol at all', () => {
  expect(run([{ type: 'loaded', print, available: true }])[0].status).toBe('enrolled');
  const [native] = run([{ type: 'loaded', available: false }, begin]);
  expect(native.status).toBe('unavailable');
  expect(needsEnrolment(native)).toBe(false);
});

test('three sentences in order, then computing, then enrolled and saved', () => {
  const [s, log] = run([loaded, begin, good, good, good, { type: 'computed', print }]);
  expect(types(log[1])).toEqual(['discardRecordings', 'openMic', 'recordSentence']);
  expect(log[2]).toEqual([{ type: 'keepSentence', index: 0 }, { type: 'recordSentence', index: 1 }]);
  expect(log[4]).toEqual([{ type: 'keepSentence', index: 2 }, { type: 'closeMic' }, { type: 'computePrint', language: 'en' }]);
  expect(log[5]).toEqual([{ type: 'discardRecordings' }, { type: 'save', print }]);
  expect(s.status).toBe('enrolled');
  expect(s.print).toEqual(print);
});

test('the view model: the sentence to read and how far along', () => {
  const [first] = run([loaded, begin]);
  expect(currentSentence(first)).toBe('One.');
  expect(enrolmentProgress(first)).toBe(0);
  const [third] = run([good, good], first);
  expect(currentSentence(third)).toBe('Three.');
  expect(enrolmentProgress(third)).toBeCloseTo(2 / 3);
  const [computing] = run([good], third);
  expect(currentSentence(computing)).toBeUndefined();
  expect(enrolmentProgress(computing)).toBe(1);
});

test('too little voice asks for the same sentence again', () => {
  const [s, log] = run([loaded, begin, { type: 'recorded', voicedSeconds: 0.5 }]);
  expect(s).toMatchObject({ status: 'recording', index: 0, error: { kind: 'tooShort' } });
  expect(log[2]).toEqual([{ type: 'recordSentence', index: 0 }]);
  expect(run([good], s)[0].error).toBeUndefined();
});

test('redoing keeps the old voiceprint until the new one replaces it, also when it fails', () => {
  const enrolled = run([{ type: 'loaded', print, available: true }])[0];
  const [failed] = run([begin, good, good, good, { type: 'computeFailed', message: 'wasm' }], enrolled);
  expect(failed).toMatchObject({ status: 'failed', print, error: { kind: 'model', message: 'wasm' } });
  expect(isEnrolled(failed)).toBe(true);
  const [cancelled, log] = run([begin, { type: 'cancel' }], enrolled);
  expect(cancelled.status).toBe('enrolled');
  expect(types(log[1])).toEqual(['closeMic', 'discardRecordings']);
});

test('a microphone failure ends the recording and says why', () => {
  const [s, log] = run([loaded, begin, { type: 'micFailed', kind: 'micDenied', message: 'denied' }]);
  expect(s).toMatchObject({ status: 'failed', error: { kind: 'micDenied' } });
  expect(types(log[2])).toEqual(['closeMic', 'discardRecordings']);
});

test('delete forgets the voiceprint; not while recording', () => {
  const enrolled = run([{ type: 'loaded', print, available: true }])[0];
  const [s, log] = run([{ type: 'delete' }], enrolled);
  expect(s.status).toBe('notEnrolled');
  expect(s.print).toBeUndefined();
  expect(log[0]).toEqual([{ type: 'forget' }]);
  const [recording] = run([begin, { type: 'delete' }], enrolled);
  expect(recording.print).toEqual(print);
});

test('late or out-of-place events change nothing', () => {
  const [s] = run([loaded]);
  expect(run([good, { type: 'computed', print }, { type: 'computeFailed', message: 'x' }], s)[0]).toEqual(s);
  expect(run([begin], initialEnrolment)[0]).toEqual(initialEnrolment);
});

test('the stored voiceprint is the embedding only, and only one this model made', () => {
  const embedding = Array.from({ length: VOICEPRINT_MODEL.dimensions }, (_, i) => i / 256);
  const saved: OwnerVoiceprint = { embedding, model: VOICEPRINT_MODEL.id, language: 'fr', createdAt: 7 };
  const raw = serialiseVoiceprint(saved);
  expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['createdAt', 'embedding', 'language', 'model']);
  expect(parseVoiceprint(raw)).toEqual(saved);
  expect(parseVoiceprint(serialiseVoiceprint({ ...saved, model: 'another' }))).toBeUndefined();
  expect(parseVoiceprint(serialiseVoiceprint({ ...saved, embedding: [1, 2] }))).toBeUndefined();
  expect(parseVoiceprint('{')).toBeUndefined();
  expect(parseVoiceprint(null)).toBeUndefined();
});
