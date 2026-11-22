/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { EMPTY_TURN, endsReply, observe, type ModelTurn } from './model-turn';

/** Feeds messages through the tracker and returns which turnCompletes are passed on. */
function run(messages: (Partial<ModelTurn> | 'turnComplete')[]): boolean[] {
  let turn = EMPTY_TURN;
  const passed: boolean[] = [];
  for (const m of messages) {
    if (m === 'turnComplete') {
      passed.push(endsReply(turn));
      turn = EMPTY_TURN;
    } else turn = observe(turn, m);
  }
  return passed;
}

test('a tool-call turn is swallowed and the reply after it passes', () => {
  expect(run([{ toolCall: true }, 'turnComplete', { output: true }, 'turnComplete'])).toEqual([false, true]);
});

test('a plain reply passes', () => {
  expect(run([{ output: true }, 'turnComplete'])).toEqual([true]);
});

test('a tool call without its own turnComplete does not swallow the reply', () => {
  // A global counter would owe one swallow here and eat the reply's turnComplete.
  expect(run([{ toolCall: true }, { output: true }, 'turnComplete'])).toEqual([true]);
});

test('silence after a tool-call turn does not swallow the next reply', () => {
  // report_language for noise, then the model says nothing; the next utterance's reply ends.
  expect(
    run([{ toolCall: true }, 'turnComplete', { toolCall: true }, 'turnComplete', { output: true }, 'turnComplete']),
  ).toEqual([false, false, true]);
});

test('two tool calls in one turn are swallowed once', () => {
  expect(run([{ toolCall: true }, { toolCall: true }, 'turnComplete', { output: true }, 'turnComplete'])).toEqual([
    false,
    true,
  ]);
});

test('a tool call inside a turn with output ends the reply', () => {
  expect(run([{ output: true }, { toolCall: true }, 'turnComplete'])).toEqual([true]);
});

test('an empty turn passes', () => {
  expect(run(['turnComplete'])).toEqual([true]);
});
