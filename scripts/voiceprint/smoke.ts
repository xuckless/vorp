// By hand: run the voiceprint model on recorded speech and print cosine scores, to see what the
// thresholds in src/config/voiceprint.ts mean. Uses transformers.js's Node build on the same
// committed model files the browser loads. Not part of `bun test`.
//
//   bun run smoke:voiceprint
//
// The clips are TTS voices (gemini-3.8-flash-tts): the e2e fixtures (en.wav Kore, fr.wav Puck)
// and the demo lines (sources by Kore and Puck, translations by the interpreter voice Charon).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AutoFeatureExtractor, AutoModel, env } from '@huggingface/transformers';

import { VOICE_CLIP, VOICE_THRESHOLDS, VOICEPRINT_MODEL } from '@/config/voiceprint';
import { average, cosine, judgeVoice, type Embedding } from '@/core/voiceprint';
import { pcmToFloat, resample, voicedSamples } from '@/services/pcm';

const root = join(import.meta.dir, '..', '..');
env.allowRemoteModels = false;
env.localModelPath = join(root, 'public', 'models') + '/';

/** 16-bit mono PCM and its rate from a WAV file (the `data` chunk, wherever it sits). */
function wav(path: string): { pcm: Int16Array; rate: number } {
  const bytes = readFileSync(path);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rate = view.getUint32(24, true);
  let at = 12;
  while (at + 8 <= bytes.length) {
    const id = bytes.toString('ascii', at, at + 4);
    const size = view.getUint32(at + 4, true);
    if (id === 'data') {
      const end = Math.min(at + 8 + size, bytes.length) & ~1;
      return { pcm: new Int16Array(bytes.buffer.slice(bytes.byteOffset + at + 8, bytes.byteOffset + end)), rate };
    }
    at += 8 + size + (size & 1);
  }
  throw new Error(`no data chunk in ${path}`);
}

const extractor = await AutoFeatureExtractor.from_pretrained(VOICEPRINT_MODEL.id);
const model = await AutoModel.from_pretrained(VOICEPRINT_MODEL.id, { dtype: VOICEPRINT_MODEL.dtype });

async function embed(pcm16k: Int16Array): Promise<Embedding> {
  const voiced = voicedSamples(pcm16k, VOICE_CLIP);
  const out = await model(await extractor(pcmToFloat(voiced)));
  return Array.from(out.last_hidden_state.data as Float32Array);
}

type Clip = { name: string; voice: string; pcm: Int16Array };

function load(name: string, voice: string, path: string): Clip {
  const { pcm, rate } = wav(join(root, path));
  return { name, voice, pcm: resample(pcm, rate, VOICEPRINT_MODEL.sampleRate) };
}

const clips: Clip[] = [
  load('en.wav', 'Kore', 'scripts/e2e/fixtures/en.wav'),
  load('fr.wav', 'Puck', 'scripts/e2e/fixtures/fr.wav'),
  ...[1, 2, 3, 4].flatMap((n) => [
    load(`demo ${n}-source`, n % 2 === 1 ? 'Kore' : 'Puck', `assets/demo/${n}-source.wav`),
    load(`demo ${n}-spoken`, 'Charon', `assets/demo/${n}-spoken.wav`),
  ]),
];

const seconds = (pcm: Int16Array) => (pcm.length / VOICEPRINT_MODEL.sampleRate).toFixed(1);
const embeddings = new Map<string, Embedding>();
for (const c of clips) {
  const started = performance.now();
  embeddings.set(c.name, await embed(c.pcm));
  const voiced = voicedSamples(c.pcm, VOICE_CLIP);
  console.log(`${c.name.padEnd(16)} ${c.voice.padEnd(7)} ${seconds(c.pcm)} s, ${seconds(voiced)} s voiced, ${Math.round(performance.now() - started)} ms`);
}

console.log('\nCosine, every pair:');
const names = clips.map((c) => c.name);
console.log(''.padEnd(16) + names.map((n) => n.slice(-9).padStart(10)).join(''));
for (const a of clips) {
  console.log(a.name.padEnd(16) + clips.map((b) => cosine(embeddings.get(a.name)!, embeddings.get(b.name)!).toFixed(2).padStart(10)).join(''));
}

const same: number[] = [];
const different: number[] = [];
clips.forEach((a, i) =>
  clips.slice(i + 1).forEach((b) => (a.voice === b.voice ? same : different).push(cosine(embeddings.get(a.name)!, embeddings.get(b.name)!))),
);
const range = (xs: number[]) => `${Math.min(...xs).toFixed(2)}..${Math.max(...xs).toFixed(2)} (n=${xs.length})`;
console.log(`\nSame voice: ${range(same)}`);
console.log(`Different voices: ${range(different)}`);

// Enrol "the owner" (Kore) from two demo lines, learn the interpreter (Charon) from two
// translations, then judge every clip that was not used to build a print.
const owner = average([embeddings.get('demo 1-source')!, embeddings.get('demo 3-source')!]);
const interpreter = average([embeddings.get('demo 1-spoken')!, embeddings.get('demo 2-spoken')!]);
console.log(`\nVerdicts with owner = Kore (demo 1, 3), interpreter = Charon (demo 1, 2 spoken), thresholds ${JSON.stringify(VOICE_THRESHOLDS)}:`);
for (const name of ['en.wav', 'fr.wav', 'demo 2-source', 'demo 4-source', 'demo 3-spoken', 'demo 4-spoken']) {
  const v = judgeVoice(embeddings.get(name)!, { owner, interpreter }, VOICE_THRESHOLDS);
  const voice = clips.find((c) => c.name === name)!.voice;
  console.log(`${name.padEnd(16)} ${voice.padEnd(7)} -> ${v.kind.padEnd(7)} owner ${v.owner?.toFixed(2)}, interpreter ${v.interpreter?.toFixed(2)}`);
}
