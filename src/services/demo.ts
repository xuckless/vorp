// The demo's services: the same interfaces, fed by a script instead of a microphone and Gemini.
// The real audio output plays the interpreter, so the ring and the avatar follow a real voice;
// a second output plays the two people, and its audio doubles as the "microphone".

import { Asset } from 'expo-asset';

import { DEMO_PACE, DEMO_RECAP, DEMO_TURNS, type DemoTurn } from '@/config/demo';
import { LIVE_AUDIO } from '@/config/models';
import type { Pcm } from '@/core/session';

import { createAudioOutput } from './audio-output';
import { NO_VOICE } from './no-voice';
import type { Services, TranslatorEvent } from './types';

const WAV_HEADER_BYTES = 44;
/** The clips' sample rate; also the rate the output plays at. */
const RATE = LIVE_AUDIO.outputSampleRate;

async function clip(module: number): Promise<Pcm> {
  const asset = Asset.fromModule(module);
  const bytes = await (await fetch(asset.uri)).arrayBuffer();
  // Only the samples the header declares: anything after them in the file is not audio.
  const declared = new DataView(bytes).getUint32(WAV_HEADER_BYTES - 4, true);
  const length = Math.min(declared, bytes.byteLength - WAV_HEADER_BYTES) & ~1;
  return new Int16Array(bytes.slice(WAV_HEADER_BYTES, WAV_HEADER_BYTES + length));
}

const seconds = (pcm: Pcm) => pcm.length / RATE;

export function createDemoServices(
  /** Called once the last line has been spoken, so the conversation can end and show its recap. */
  onFinished: () => void,
  turns: readonly DemoTurn[] = DEMO_TURNS,
): Services {
  const output = createAudioOutput();
  const people = createAudioOutput();
  const micListeners = new Set<(pcm: Pcm) => void>();
  const listeners = new Set<(e: TranslatorEvent) => void>();
  /** Bumped by connect and close; a script from an older run stops at its next step. */
  let run = 0;

  const emit = (e: TranslatorEvent) => listeners.forEach((l) => l(e));
  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  async function play(mine: number) {
    const live = () => mine === run;
    for (const turn of turns) {
      const [source, spoken] = await Promise.all([clip(turn.sourceClip), clip(turn.spokenClip)]);
      await wait(DEMO_PACE.beforeTurn);
      if (!live()) return;

      // The person speaks: their clip plays, and the words arrive as they are said.
      emit({ type: 'speechStarted' });
      const id = `demo-${turn.sourceClip}`;
      people.enqueue(id, source);
      people.finish(id);
      const words = turn.source.split(' ');
      const chunk = Math.round((RATE * LIVE_AUDIO.inputChunkMs) / 1000);
      const chunks = Math.ceil(source.length / chunk);
      let said = 0;
      for (let i = 0; i < chunks && live(); i++) {
        const slice = source.subarray(i * chunk, (i + 1) * chunk);
        micListeners.forEach((l) => l(slice));
        const due = Math.min(words.length, Math.ceil(((i + 1) / chunks) * words.length));
        if (due > said) emit({ type: 'inputTranscript', text: (said === 0 ? '' : ' ') + words.slice(said, due).join(' ') });
        said = due;
        await wait(LIVE_AUDIO.inputChunkMs);
      }
      if (!live()) return;
      micListeners.forEach((l) => l(new Int16Array(chunk)));
      emit({ type: 'speechEnded' });
      emit({ type: 'sourceLanguage', language: turn.language });
      if (turn.note) emit({ type: 'note', text: turn.note });

      // The interpreter thinks, then speaks.
      await wait(DEMO_PACE.thinking);
      if (!live()) return;
      emit({ type: 'outputTranscript', text: turn.spoken });
      emit({ type: 'outputAudio', pcm: spoken });
      emit({ type: 'turnComplete' });
      await wait(seconds(spoken) * 1000 + DEMO_PACE.afterTurn);
      if (!live()) return;
    }
    onFinished();
  }

  return {
    input: {
      open: () => people.open(),
      close: () => people.close(),
      onChunk(listener) {
        micListeners.add(listener);
        return () => micListeners.delete(listener);
      },
    },
    output,
    translator: {
      async connect() {
        void play(++run);
      },
      close() {
        run++;
        people.stop();
      },
      beginTurn() {},
      sendAudio() {},
      endTurn() {},
      onEvent(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    recap: { summarise: async () => DEMO_RECAP },
    // The script names its speakers by language; the demo does not load the voiceprint model.
    voice: NO_VOICE,
  };
}
