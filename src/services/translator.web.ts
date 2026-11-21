// Gemini Live implementation of Translator, on the official @google/genai SDK (browser build).
// One session, one interpreter voice. Hands-free ('auto') keeps the server's voice activity
// detection on with NO_INTERRUPTION, so new speech never cuts off a translation; a held
// button ends its turn early with audioStreamEnd (the docs' "hybrid VAD"). 'manual' turns
// detection off and marks every turn with activityStart / activityEnd.
// Every connect fetches a fresh single-use token; after a drop it resumes with the last
// session-resumption handle.

import {
  ActivityHandling,
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
  type RealtimeInputConfig,
  type Session as LiveSession,
} from '@google/genai';

import { INTERPRETER_MODEL, LIVE_API_VERSION, LIVE_AUDIO, LIVE_VAD } from '@/config/models';
import { interpreterPrompt } from '@/config/prompts';
import { INTERPRETER_VOICE } from '@/config/voices';
import type { SessionSettings, TurnDetection } from '@/core/session';

import { base64ToPcm, pcmToBase64 } from './pcm';
import { fetchLiveToken } from './token';
import { ServiceError, type Translator, type TranslatorEvent } from './types';

const ACTIVITY_HANDLING: Record<SessionSettings['overlap']['speechDuringPlayback'], ActivityHandling> = {
  queue: ActivityHandling.NO_INTERRUPTION,
};

function realtimeInput(settings: SessionSettings): RealtimeInputConfig {
  return {
    automaticActivityDetection:
      settings.detection === 'manual' ? { disabled: true } : { disabled: false, ...LIVE_VAD },
    activityHandling: ACTIVITY_HANDLING[settings.overlap.speechDuringPlayback],
  };
}

/** The docs name the field `type`; the SDK types call it `voiceActivityType`. Read both. */
function voiceActivity(msg: LiveServerMessage): string | undefined {
  const v = msg.voiceActivity as { type?: string; voiceActivityType?: string } | undefined;
  return v?.voiceActivityType ?? v?.type;
}

export function createTranslator(): Translator {
  const listeners = new Set<(e: TranslatorEvent) => void>();
  let live: LiveSession | null = null;
  /** Bumped on every connect and close, so callbacks from an old socket are ignored. */
  let generation = 0;
  let resumeHandle: string | undefined;
  let detection: TurnDetection = 'auto';

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

    const activity = voiceActivity(msg);
    if (activity === 'ACTIVITY_START') emit({ type: 'speechStarted' });

    const content = msg.serverContent;
    if (content) {
      const input = content.inputTranscription;
      if (input?.text || input?.finished) {
        emit({ type: 'inputTranscript', text: input.text ?? '', language: input.languageCode, finished: input.finished });
      }
      const output = content.outputTranscription;
      if (output?.text) emit({ type: 'outputTranscript', text: output.text, language: output.languageCode });
      for (const part of content.modelTurn?.parts ?? []) {
        const data = part.inlineData?.data;
        if (data && part.inlineData?.mimeType?.startsWith('audio/')) emit({ type: 'outputAudio', pcm: base64ToPcm(data) });
      }
      if (content.interrupted) emit({ type: 'interrupted' });
      if (content.turnComplete) emit({ type: 'turnComplete' });
    }

    if (activity === 'ACTIVITY_END') emit({ type: 'speechEnded' });

    if (msg.goAway) {
      // The connection's time limit is near; reconnect now with the resumption handle.
      generation++;
      dropCurrent();
      emit({ type: 'closed', kind: 'timeLimit', reason: `connection time limit (goAway, ${msg.goAway.timeLeft ?? 'soon'})` });
    }
  }

  return {
    async connect(participants, settings) {
      const mine = ++generation;
      dropCurrent();
      detection = settings.detection;
      const token = await fetchLiveToken().then(
        (t) => t.token,
        (err: unknown) => {
          throw new ServiceError('token', err instanceof Error ? err.message : String(err));
        },
      );
      if (mine !== generation) throw new ServiceError('socket', 'superseded');

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
          // The participants' languages as hints; the transcript reports the detected one.
          inputAudioTranscription: { languageCodes: [...new Set(participants.map((p) => p.language))] },
          outputAudioTranscription: {},
          realtimeInputConfig: realtimeInput(settings),
          contextWindowCompression: { slidingWindow: {} },
          sessionResumption: { handle: resumeHandle },
        },
        callbacks: {
          onmessage: (msg) => handle(msg, mine, ready),
          onerror: (e) => {
            if (mine === generation) fail(new ServiceError('socket', e.message || 'Live socket error'));
          },
          onclose: (e) => {
            if (mine !== generation) return;
            const reason = e.reason || `socket closed (${e.code})`;
            fail(new ServiceError('socket', reason));
            live = null;
            emit({ type: 'closed', kind: 'socket', reason });
          },
        },
      });
      if (mine !== generation) {
        session.close();
        throw new ServiceError('socket', 'superseded');
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
      if (detection === 'manual') live?.sendRealtimeInput({ activityStart: {} });
    },

    sendAudio(pcm) {
      live?.sendRealtimeInput({ audio: { data: pcmToBase64(pcm), mimeType: LIVE_AUDIO.inputMimeType } });
    },

    endTurn() {
      // With automatic detection on, audioStreamEnd finalizes the turn at once and flushes
      // cached audio; activity signals are only for manual detection.
      live?.sendRealtimeInput(detection === 'manual' ? { activityEnd: {} } : { audioStreamEnd: true });
    },

    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
