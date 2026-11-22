// Speaker recognition and the voice echo filter, for the effect runner. Holds only audio
// buffers and the interpreter's learnt print; verdicts go back to the session as events.
//
// - Every chunk the runner sends to the translator is kept (the last `VOICE_CLIP.maxSeconds`).
//   When the session says a capture ended (`recogniseVoice`), the audio sent since the previous
//   one is that utterance's: its pauses are dropped, and if enough voice is left it is embedded
//   and judged against the owner's print and Vorp's own.
// - Vorp's own voice is learnt from the translations it plays (24 kHz, resampled to 16 kHz):
//   the first `INTERPRETER_PRINT.clips` long enough are averaged into the interpreter's print.
//
// Nothing here is stored; the owner's print comes from enrolment through `ownerPrint`.

import { INTERPRETER_PRINT, VOICE_CLIP, VOICE_THRESHOLDS, VOICEPRINT_MODEL } from '@/config/voiceprint';
import { LIVE_AUDIO } from '@/config/models';
import type { Pcm, SessionEvent, UtteranceId } from '@/core/session';
import { average, judgeVoice, type Embedding, type VoiceVerdict } from '@/core/voiceprint';
import { joinPcm, resample, voicedSamples } from '@/services/pcm';
import type { VoiceEmbedder } from '@/services';

/** A rolling buffer of sent audio; `take` returns what arrived since the last take (at most `max` samples). */
export function createClipBuffer(max: number) {
  let chunks: Pcm[] = [];
  let length = 0;
  return {
    push(pcm: Pcm) {
      chunks.push(pcm);
      length += pcm.length;
      while (chunks.length > 1 && length - chunks[0].length >= max) length -= chunks.shift()!.length;
    },
    take(): Pcm {
      const all = joinPcm(chunks);
      chunks = [];
      length = 0;
      return all.length > max ? all.subarray(all.length - max) : all;
    },
    clear() {
      chunks = [];
      length = 0;
    },
  };
}

/** Enough voice to judge: at least `VOICE_CLIP.minSeconds` once pauses are dropped. Undefined otherwise. */
export function judgeableVoice(pcm: Pcm): Pcm | undefined {
  const voiced = voicedSamples(pcm, VOICE_CLIP);
  return voiced.length >= VOICE_CLIP.minSeconds * VOICEPRINT_MODEL.sampleRate ? voiced : undefined;
}

/** The session event a verdict becomes, if any: an unsure verdict sends nothing. */
export function verdictEvent(verdict: VoiceVerdict, utteranceId: UtteranceId): SessionEvent | undefined {
  switch (verdict.kind) {
    case 'echo':
      return { type: 'echoRecognised', utteranceId };
    case 'owner':
    case 'other':
      return { type: 'speakerRecognised', speaker: verdict.kind, utteranceId };
    case 'unsure':
      return undefined;
  }
}

export type VoiceJudge = ReturnType<typeof createVoiceJudge>;

export function createVoiceJudge(
  voice: VoiceEmbedder,
  /** The owner's enrolled voiceprint, if any; read at each verdict. */
  ownerPrint: () => Embedding | undefined,
  dispatch: (event: SessionEvent) => void,
) {
  const sent = createClipBuffer(VOICE_CLIP.maxSeconds * VOICEPRINT_MODEL.sampleRate);
  const spoken = new Map<UtteranceId, Pcm[]>();
  let interpreter: Embedding[] = [];
  /** The interpreter voice the learnt print belongs to. */
  let interpreterVoice: string | undefined;
  let warned = false;

  const warn = (err: unknown) => {
    // Recognition is an extra: without it language routing applies. Say so once.
    if (!warned) console.warn('Voice recognition is off:', err instanceof Error ? err.message : err);
    warned = true;
  };
  const learning = () => voice.available && interpreter.length < INTERPRETER_PRINT.clips;

  return {
    /** A conversation is starting with this interpreter voice: start loading the model. */
    connected(voiceName: string) {
      if (voiceName !== interpreterVoice) interpreter = [];
      interpreterVoice = voiceName;
      if (voice.available) voice.load().catch(warn);
    },
    /** Microphone audio that went to the translator. */
    sent(pcm: Pcm) {
      sent.push(pcm);
    },
    /** An utterance's capture ended: judge the audio sent since the previous one. */
    recognise(utteranceId: UtteranceId) {
      const clip = judgeableVoice(sent.take());
      const prints = () => ({ owner: ownerPrint(), interpreter: average(interpreter) });
      if (clip === undefined || !voice.available) return;
      const before = prints();
      if (before.owner === undefined && before.interpreter === undefined && !learning()) return;
      voice.embed(clip).then((embedding) => {
        // Read the prints now: one learnt from an earlier translation may have just arrived.
        const event = verdictEvent(judgeVoice(embedding, prints(), VOICE_THRESHOLDS), utteranceId);
        if (event) dispatch(event);
      }, warn);
    },
    /** Interpreter audio about to be played. */
    played(utteranceId: UtteranceId, pcm: Pcm) {
      if (!learning()) return;
      const list = spoken.get(utteranceId) ?? [];
      list.push(pcm);
      spoken.set(utteranceId, list);
    },
    /** No more interpreter audio for this utterance: learn Vorp's voice from it. */
    finished(utteranceId: UtteranceId) {
      const list = spoken.get(utteranceId);
      spoken.delete(utteranceId);
      if (list === undefined || !learning()) return;
      const clip = judgeableVoice(resample(joinPcm(list), LIVE_AUDIO.outputSampleRate, VOICEPRINT_MODEL.sampleRate));
      if (clip === undefined) return;
      const voiceName = interpreterVoice;
      voice.embed(clip).then((embedding) => {
        if (voiceName === interpreterVoice && learning()) interpreter = [...interpreter, embedding];
      }, warn);
    },
    /** Playback was dropped or the conversation ended. */
    stopped() {
      spoken.clear();
      sent.clear();
    },
  };
}
