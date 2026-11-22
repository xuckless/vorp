// Live audio levels for the voice visualiser, 0..1: the microphone's from its PCM chunks, the
// interpreter's from the output tap. Read by getters every frame; nothing here is React state.

import type { Services } from '@/services';

/** Speech sits well below full scale; this brings a normal voice to about 0.5. */
const MIC_GAIN = 5;

export type Levels = { mic: () => number; out: () => number; dispose: () => void };

export function createLevels({ input, output }: Services): Levels {
  let mic = 0;
  const off = input.onChunk((pcm) => {
    let sum = 0;
    for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
    // A soft ceiling: a loud voice approaches the top instead of pinning the ring at it.
    mic = Math.tanh((Math.sqrt(sum / pcm.length) / 0x8000) * MIC_GAIN);
  });
  return { mic: () => mic, out: () => output.level(), dispose: off };
}
