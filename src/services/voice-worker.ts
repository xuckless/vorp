// The voiceprint model in a Web Worker, so feature extraction and inference never block audio
// or the UI. Not part of the app bundle: `scripts/voiceprint/assets.ts` builds it to
// `public/voiceprint/worker.js`, next to the transformers.js build it imports at runtime.
//
// transformers.js (Apache-2.0) runs WeSpeakerFeatureExtractor (80-dim Kaldi fbank) and the
// ONNX model on ONNX Runtime Web's CPU (WASM) backend. Every file comes from our own origin:
// remote models are off, and the WASM paths are set before the first session.

import type { VoiceWorkerReply, VoiceWorkerRequest } from './voice-protocol';

/** The library's types; its code is loaded at runtime from our origin, not bundled. */
type Transformers = typeof import('@huggingface/transformers');

type Init = Extract<VoiceWorkerRequest, { type: 'init' }>;
type Model = { extract: InstanceType<Transformers['FeatureExtractor']>; model: InstanceType<Transformers['PreTrainedModel']> };

// The worker's global scope, typed by hand: the app's lib is DOM, not WebWorker.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<VoiceWorkerRequest>) => void) | null;
  postMessage(message: VoiceWorkerReply, transfer?: Transferable[]): void;
  crossOriginIsolated?: boolean;
};

let loading: Promise<Model> | null = null;
/** One embedding at a time, in the order asked. */
let queue: Promise<unknown> = Promise.resolve();

async function load(init: Init): Promise<Model> {
  const lib = (await import(/* runtime URL, same origin */ init.library)) as Transformers;
  const { env } = lib;
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = init.modelRoot;
  const wasm = env.backends.onnx.wasm!;
  wasm.wasmPaths = init.wasm;
  // Threads need cross-origin isolation; without it ONNX Runtime would fall back with a warning.
  wasm.numThreads = scope.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  const [extract, model] = await Promise.all([
    lib.AutoFeatureExtractor.from_pretrained(init.model),
    lib.AutoModel.from_pretrained(init.model, { dtype: init.dtype, device: 'wasm' }),
  ]);
  return { extract, model };
}

async function embed({ extract, model }: Model, samples: Float32Array): Promise<Float32Array> {
  const out = await model(await extract(samples));
  return new Float32Array(out.last_hidden_state.data as Float32Array);
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

scope.onmessage = ({ data }) => {
  if (data.type === 'init') {
    loading ??= load(data);
    loading.then(
      () => scope.postMessage({ type: 'ready' }),
      (err: unknown) => scope.postMessage({ type: 'loadFailed', message: message(err) }),
    );
    return;
  }
  const { id, samples } = data;
  queue = queue.then(async () => {
    try {
      if (loading === null) throw new Error('not initialised');
      const embedding = await embed(await loading, samples);
      scope.postMessage({ type: 'embedding', id, embedding }, [embedding.buffer]);
    } catch (err) {
      scope.postMessage({ type: 'embedFailed', id, message: message(err) });
    }
  });
};
