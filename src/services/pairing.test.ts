/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { parseMessage } from './pairing';

test('server messages become link events', () => {
  expect(parseMessage('{"type":"welcome","role":"host","expiresAt":1}')).toEqual({ type: 'welcome' });
  expect(parseMessage('{"type":"welcome","role":"guest","peerLanguage":"en-US","key":"K"}')).toEqual({
    type: 'keyed',
    key: 'K',
    event: { type: 'welcome', peerLanguage: 'en-US' },
  });
  expect(parseMessage('{"type":"welcome","role":"host","peerLanguage":"fr","rejoined":true}')).toEqual({ type: 'welcome', peerLanguage: 'fr', rejoined: true });
  expect(parseMessage('{"type":"peer_joined","peerLanguage":"fr-CA"}')).toEqual({ type: 'peerJoined', peerLanguage: 'fr-CA' });
  expect(parseMessage('{"type":"ended","reason":"guest_stopped"}')).toEqual({ type: 'ended', reason: 'guest_stopped' });
  expect(parseMessage('{"type":"error","code":"taken","message":"x"}')).toEqual({ type: 'refused', code: 'taken' });
});

test('relayed messages become the other phone’s events', () => {
  expect(parseMessage('{"type":"speaking","talking":true}')).toEqual({ type: 'peerSpeaking', talking: true });
  expect(parseMessage('{"type":"turn","turn":"h3","state":"ready"}')).toEqual({ type: 'peerTurn', turn: 'h3', state: 'ready' });
  expect(parseMessage('{"type":"caption","turn":"h3","side":"source","delta":"Where "}')).toEqual({ type: 'peerCaption', turn: 'h3', side: 'source', delta: 'Where ' });
  expect(parseMessage('{"type":"playback","turn":"h3","state":"playing","progress":1.4}')).toEqual({ type: 'peerPlayback', turn: 'h3', state: 'playing', progress: 1 });
});

test('anything malformed is dropped', () => {
  expect(parseMessage('not json')).toBeUndefined();
  expect(parseMessage('[]')).toBeUndefined();
  expect(parseMessage('{"type":"turn","turn":"h3","state":"exploded"}')).toBeUndefined();
  expect(parseMessage('{"type":"caption","turn":"h3","side":"both","delta":"x"}')).toBeUndefined();
  expect(parseMessage('{"type":"speaking"}')).toBeUndefined();
});
