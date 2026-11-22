// Web microphone capture: getUserMedia with echo cancellation, an AudioWorklet that
// downsamples to 16 kHz and posts 16-bit PCM chunks of about 100 ms.

import { LIVE_AUDIO } from '@/config/models';
import type { Pcm } from '@/core/session';

import { ServiceError, type AudioInput } from './types';

const PROCESSOR = 'vorp-pcm-capture';

// Runs on the audio thread. Box-filter decimation: average the input samples that fall in
// each output sample's window. Enough for speech going to a recogniser.
const WORKLET_SOURCE = `
class PcmCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { targetRate, chunkSamples } = options.processorOptions;
    this.step = sampleRate / targetRate;
    this.size = chunkSamples;
    this.chunk = new Int16Array(this.size);
    this.filled = 0;
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      this.sum += channel[i];
      this.count++;
      this.phase += 1;
      if (this.phase >= this.step) {
        this.phase -= this.step;
        const v = Math.max(-1, Math.min(1, this.sum / this.count));
        this.sum = 0;
        this.count = 0;
        this.chunk[this.filled++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        if (this.filled === this.size) {
          // Transferring detaches the buffer (its length becomes 0), so the size is kept apart.
          this.port.postMessage(this.chunk, [this.chunk.buffer]);
          this.chunk = new Int16Array(this.size);
          this.filled = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('${PROCESSOR}', PcmCapture);
`;

type Open = { context: AudioContext; stream: MediaStream; node: AudioWorkletNode };

export function createAudioInput(): AudioInput {
  const listeners = new Set<(pcm: Pcm) => void>();
  let opening: Promise<Open> | null = null;

  async function start(context: AudioContext): Promise<Open> {
    // The context is created synchronously by open() so it stays inside the user gesture.
    const stream = await navigator.mediaDevices
      .getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      })
      .catch((err: unknown) => {
        const name = err instanceof Error ? err.name : '';
        const denied = name === 'NotAllowedError' || name === 'SecurityError';
        throw new ServiceError(denied ? 'micDenied' : 'mic', err instanceof Error ? err.message : String(err));
      });
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
    try {
      await context.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const node = new AudioWorkletNode(context, PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
      processorOptions: {
        targetRate: LIVE_AUDIO.inputSampleRate,
        chunkSamples: (LIVE_AUDIO.inputSampleRate * LIVE_AUDIO.inputChunkMs) / 1000,
      },
    });
    node.port.onmessage = (e: MessageEvent<Int16Array>) => listeners.forEach((l) => l(e.data));
    context.createMediaStreamSource(stream).connect(node);
    await context.resume();
    return { context, stream, node };
  }

  return {
    open() {
      if (opening === null) {
        const context = new AudioContext();
        opening = start(context).catch((err: unknown) => {
          void context.close();
          opening = null;
          throw err;
        });
      }
      return opening.then(() => undefined);
    },
    close() {
      const current = opening;
      opening = null;
      void current?.then(({ context, stream, node }) => {
        node.port.onmessage = null;
        node.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        void context.close();
      });
    },
    onChunk(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
