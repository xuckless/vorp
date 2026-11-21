// Web playback: each PCM chunk becomes an AudioBuffer scheduled right after the previous
// one, so playback is gapless. An AnalyserNode taps the output level.

import { LIVE_AUDIO } from '@/config/models';
import type { UtteranceId } from '@/core/session';

import type { AudioOutput, AudioOutputEvent } from './types';

/** Scheduling slack so the first chunk does not start in the past. */
const LEAD_SECONDS = 0.05;

type Track = { pending: number; finishing: boolean; started: boolean };

export function createAudioOutput(): AudioOutput {
  const listeners = new Set<(e: AudioOutputEvent) => void>();
  const tracks = new Map<UtteranceId, Track>();
  const sources = new Set<AudioBufferSourceNode>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let context: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let samples: Float32Array<ArrayBuffer> | null = null;
  let playhead = 0;

  const emit = (e: AudioOutputEvent) => listeners.forEach((l) => l(e));

  function settle(id: UtteranceId) {
    const track = tracks.get(id);
    if (track && track.finishing && track.pending === 0) {
      tracks.delete(id);
      emit({ type: 'finished', utteranceId: id });
    }
  }

  function ensure(): AudioContext {
    if (context === null) {
      context = new AudioContext();
      analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      samples = new Float32Array(analyser.fftSize);
      analyser.connect(context.destination);
      playhead = 0;
    }
    return context;
  }

  function stop() {
    sources.forEach((s) => {
      s.onended = null;
      s.stop();
    });
    sources.clear();
    timers.forEach(clearTimeout);
    timers.clear();
    tracks.clear();
    playhead = 0;
  }

  return {
    async open() {
      await ensure().resume();
    },
    close() {
      stop();
      void context?.close();
      context = null;
      analyser = null;
      samples = null;
    },
    enqueue(utteranceId, pcm) {
      const ctx = ensure();
      const buffer = ctx.createBuffer(1, pcm.length, LIVE_AUDIO.outputSampleRate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(analyser!);
      const at = Math.max(playhead, ctx.currentTime + LEAD_SECONDS);
      playhead = at + buffer.duration;

      const track = tracks.get(utteranceId) ?? { pending: 0, finishing: false, started: false };
      tracks.set(utteranceId, track);
      track.pending++;
      if (!track.started) {
        track.started = true;
        const timer = setTimeout(
          () => {
            timers.delete(timer);
            emit({ type: 'started', utteranceId });
          },
          (at - ctx.currentTime) * 1000,
        );
        timers.add(timer);
      }
      source.onended = () => {
        sources.delete(source);
        track.pending--;
        settle(utteranceId);
      };
      sources.add(source);
      source.start(at);
    },
    finish(utteranceId) {
      const track = tracks.get(utteranceId);
      if (track === undefined) {
        emit({ type: 'finished', utteranceId });
        return;
      }
      track.finishing = true;
      settle(utteranceId);
    },
    stop,
    level() {
      if (analyser === null || samples === null) return 0;
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const v of samples) sum += v * v;
      return Math.min(1, Math.sqrt(sum / samples.length) * 2);
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
