// Web speaker embeddings: the voiceprint model runs in a module Web Worker (`voice-worker.ts`,
// built to `public/voiceprint/worker.js`) on ONNX Runtime's WASM backend. The worker, the
// library, the WASM and the model are all fetched from our own origin. Loading starts on the
// first `load` or `embed`; a failed load is retried on the next call.

import { VOICEPRINT_ASSETS, VOICEPRINT_MODEL } from '@/config/voiceprint';
import type { Pcm } from '@/core/session';
import type { Embedding } from '@/core/voiceprint';

import { pcmToFloat } from './pcm';
import type { VoiceEmbedder } from './types';
import type { VoiceWorkerReply, VoiceWorkerRequest } from './voice-protocol';

type Pending = { resolve: (e: Embedding) => void; reject: (err: Error) => void };

export function createVoiceEmbedder(): VoiceEmbedder {
  const available = typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined' && typeof location !== 'undefined';
  const pending = new Map<number, Pending>();
  let worker: Worker | null = null;
  let ready: Promise<void> | null = null;
  let nextId = 1;

  const url = (file: string, root: string = VOICEPRINT_ASSETS.runtimeRoot) => new URL(root + file, location.href).href;

  function fail(err: Error) {
    pending.forEach((p) => p.reject(err));
    pending.clear();
    worker?.terminate();
    worker = null;
    ready = null;
  }

  function start(): Promise<void> {
    if (!available) return Promise.reject(new Error('Voice recognition needs Web Workers and WebAssembly'));
    if (ready !== null) return ready;
    const w = new Worker(url(VOICEPRINT_ASSETS.worker), { type: 'module' });
    worker = w;
    ready = new Promise<void>((resolve, reject) => {
      w.onmessage = ({ data }: MessageEvent<VoiceWorkerReply>) => {
        switch (data.type) {
          case 'ready':
            resolve();
            return;
          case 'loadFailed':
            reject(new Error(data.message));
            fail(new Error(data.message));
            return;
          case 'embedding':
            pending.get(data.id)?.resolve(Array.from(data.embedding));
            pending.delete(data.id);
            return;
          case 'embedFailed':
            pending.get(data.id)?.reject(new Error(data.message));
            pending.delete(data.id);
            return;
        }
      };
      w.onerror = (e) => {
        const err = new Error(e.message || 'The voice worker failed');
        reject(err);
        fail(err);
      };
    });
    const init: VoiceWorkerRequest = {
      type: 'init',
      library: url(VOICEPRINT_ASSETS.library),
      modelRoot: new URL(VOICEPRINT_ASSETS.modelRoot, location.href).href,
      wasm: { mjs: url(VOICEPRINT_ASSETS.wasm.mjs), wasm: url(VOICEPRINT_ASSETS.wasm.wasm) },
      model: VOICEPRINT_MODEL.id,
      dtype: VOICEPRINT_MODEL.dtype,
    };
    w.postMessage(init);
    return ready;
  }

  return {
    available,
    load: start,
    async embed(pcm: Pcm) {
      await start();
      const id = nextId++;
      const samples = pcmToFloat(pcm);
      return new Promise<Embedding>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const request: VoiceWorkerRequest = { type: 'embed', id, samples };
        worker!.postMessage(request, [samples.buffer]);
      });
    },
  };
}
