// Gemini Live implementation of Translator, on the official @google/genai SDK (browser build).
// One session, one interpreter voice, manual turns (push-to-talk sends activityStart/End).
// Every connect fetches a fresh single-use token; after a drop it resumes with the last
// session-resumption handle.

import { GoogleGenAI, Modality, type LiveServerMessage, type Session as LiveSession } from '@google/genai';

import { INTERPRETER_MODEL, LIVE_API_VERSION, LIVE_AUDIO } from '@/config/models';
import { interpreterPrompt } from '@/config/prompts';
import { INTERPRETER_VOICE } from '@/config/voices';

import { base64ToPcm, pcmToBase64 } from './pcm';
import { fetchLiveToken } from './token';
import type { Translator, TranslatorEvent } from './types';

export function createTranslator(): Translator {
  const listeners = new Set<(e: TranslatorEvent) => void>();
  let live: LiveSession | null = null;
  /** Bumped on every connect and close, so callbacks from an old socket are ignored. */
  let generation = 0;
  let resumeHandle: string | undefined;

  const emit = (e: TranslatorEvent) => listeners.forEach((l) => l(e));

  function dropCurrent() {
    const old = live;
    live = null;
    old?.close();
  }

  function handle(msg: LiveServerMessage, mine: number, ready: () => void) {
    if (mine !== generation) return;
    if (msg.setupComplete) ready();
    const update = msg.sessionResumptionUpdate;
    if (update?.resumable && update.newHandle) resumeHandle = update.newHandle;

    const content = msg.serverContent;
    if (content) {
      if (content.inputTranscription?.text) emit({ type: 'inputTranscript', text: content.inputTranscription.text });
      if (content.outputTranscription?.text) emit({ type: 'outputTranscript', text: content.outputTranscription.text });
      for (const part of content.modelTurn?.parts ?? []) {
        const data = part.inlineData?.data;
        if (data && part.inlineData?.mimeType?.startsWith('audio/')) emit({ type: 'outputAudio', pcm: base64ToPcm(data) });
      }
      if (content.turnComplete) emit({ type: 'turnComplete' });
    }

    if (msg.goAway) {
      // The server is about to end this connection; reconnect now with the resumption handle.
      generation++;
      dropCurrent();
      emit({ type: 'closed', reason: `goAway (${msg.goAway.timeLeft ?? 'soon'})` });
    }
  }

  return {
    async connect(participants) {
      const mine = ++generation;
      dropCurrent();
      const { token } = await fetchLiveToken();
      if (mine !== generation) throw new Error('superseded');

      const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: LIVE_API_VERSION } });
      let ready!: () => void;
      let fail!: (err: Error) => void;
      const setup = new Promise<void>((resolve, reject) => {
        ready = resolve;
        fail = reject;
      });

      const session = await ai.live.connect({
        model: INTERPRETER_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: interpreterPrompt(participants),
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: INTERPRETER_VOICE } } },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
          contextWindowCompression: { slidingWindow: {} },
          sessionResumption: { handle: resumeHandle },
        },
        callbacks: {
          onmessage: (msg) => handle(msg, mine, ready),
          onerror: (e) => {
            if (mine === generation) fail(new Error(e.message || 'Live socket error'));
          },
          onclose: (e) => {
            if (mine !== generation) return;
            const reason = e.reason || `socket closed (${e.code})`;
            fail(new Error(reason));
            live = null;
            emit({ type: 'closed', reason });
          },
        },
      });
      if (mine !== generation) {
        session.close();
        throw new Error('superseded');
      }
      live = session;
      await setup;
    },

    close() {
      generation++;
      resumeHandle = undefined;
      dropCurrent();
    },

    beginTurn() {
      live?.sendRealtimeInput({ activityStart: {} });
    },

    sendAudio(pcm) {
      live?.sendRealtimeInput({ audio: { data: pcmToBase64(pcm), mimeType: LIVE_AUDIO.inputMimeType } });
    },

    endTurn() {
      live?.sendRealtimeInput({ activityEnd: {} });
    },

    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
