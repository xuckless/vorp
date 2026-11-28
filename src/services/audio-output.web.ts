// Web playback: each PCM chunk becomes an AudioBuffer scheduled right after the previous
// one, so playback is gapless. An AnalyserNode taps the output level. A context the browser
// keeps suspended (iPhone Safari, outside a tap) is reported once as 'blocked'; the next `open`
// from a tap resumes it.

import { LIVE_AUDIO } from '@/config/models';
import type { UtteranceId } from '@/core/session';

import type { AudioOutput, AudioOutputEvent } from './types';

/** Scheduling slack so the first chunk does not start in the past. */
const LEAD_SECONDS = 0.05;

/** `from`: when its first chunk plays, on the context's clock; `seconds`: how much is queued. */
type Track = { pending: number; finishing: boolean; started: boolean; from: number; seconds: number };

export function createAudioOutput(): AudioOutput {
  const listeners = new Set<(e: AudioOutputEvent) => void>();
  const tracks = new Map<UtteranceId, Track>();
  const sources = new Set<AudioBufferSourceNode>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let context: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let samples: Float32Array<ArrayBuffer> | null = null;
  let playhead = 0;
  /** 'blocked' was reported for the current suspension. */
  let blocked = false;
  /** Progress of tracks that finished, kept until the next stop so a late read still sees 1. */
  const finished = new Set<UtteranceId>();

  const emit = (e: AudioOutputEvent) => listeners.forEach((l) => l(e));

  function settle(id: UtteranceId) {
    const track = tracks.get(id);
    if (track && track.finishing && track.pending === 0) {
      tracks.delete(id);
      finished.add(id);
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
      try {
        s.stop();
      } catch {
        // Already stopped.
      }
    });
    sources.clear();
    timers.forEach(clearTimeout);
    timers.clear();
    tracks.clear();
    finished.clear();
    playhead = 0;
  }

  return {
    async open() {
      const ctx = ensure();
      await ctx.resume();
      blocked = false;
    },
    close() {
      stop();
      void context?.close();
      context = null;
      analyser = null;
      samples = null;
      blocked = false;
    },
    enqueue(utteranceId, pcm) {
      if (pcm.length === 0) return;
      const ctx = ensure();
      const buffer = ctx.createBuffer(1, pcm.length, LIVE_AUDIO.outputSampleRate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(analyser!);
      const at = Math.max(playhead, ctx.currentTime + LEAD_SECONDS);
      playhead = at + buffer.duration;

      const track = tracks.get(utteranceId) ?? { pending: 0, finishing: false, started: false, from: at, seconds: 0 };
      tracks.set(utteranceId, track);
      track.pending++;
      track.seconds += buffer.duration;
      if (ctx.state !== 'running' && !blocked) {
        blocked = true;
        emit({ type: 'blocked' });
      }
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
    progress(utteranceId) {
      if (finished.has(utteranceId)) return 1;
      const track = tracks.get(utteranceId);
      if (track === undefined || context === null || track.seconds === 0) return 0;
      return Math.max(0, Math.min(1, (context.currentTime - track.from) / track.seconds));
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
