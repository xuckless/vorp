// The conversation as one state value and one pure transition function.
// No React, no I/O, no imports from other folders.

export type ParticipantId = string;
export type UtteranceId = string;

export type Participant = {
  id: ParticipantId;
  name: string;
  /** BCP-47 code from the languages table. */
  language: string;
  /** Voice name from the voices table. One interpreter voice is used for now. */
  voice: string;
};

export type UtteranceStatus = 'capturing' | 'translating' | 'queued' | 'speaking' | 'done' | 'failed';

export type Utterance = {
  id: UtteranceId;
  speakerId: ParticipantId;
  status: UtteranceStatus;
  /** What the speaker said (input transcript). */
  source: string;
  /** What the interpreter said (output transcript). */
  translation: string;
  error?: string;
};

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'failed';

export type Session = {
  participants: Participant[];
  connection: ConnectionStatus;
  /** Oldest first. */
  utterances: Utterance[];
  /**
   * Utterances whose turn has been sent and whose response has not completed, oldest first.
   * The model answers turns in order, so the head owns every incoming response message.
   */
  awaitingResponse: UtteranceId[];
  nextId: number;
  error?: string;
};

/** Audio as 16-bit PCM samples; the effect runner moves it, the reducer only routes it. */
export type Pcm = Int16Array;

export type SessionEvent =
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'connected' }
  | { type: 'connectFailed'; error: string }
  | { type: 'connectionLost'; reason: string }
  | { type: 'pressTalk'; speakerId: ParticipantId }
  | { type: 'releaseTalk'; speakerId: ParticipantId }
  | { type: 'captureFailed'; error: string }
  | { type: 'inputTranscript'; text: string }
  | { type: 'outputTranscript'; text: string }
  | { type: 'outputAudio'; pcm: Pcm }
  | { type: 'turnComplete' }
  | { type: 'playbackStarted'; utteranceId: UtteranceId }
  | { type: 'playbackFinished'; utteranceId: UtteranceId };

export type Effect =
  | { type: 'connect'; participants: Participant[] }
  | { type: 'disconnect' }
  | { type: 'openAudio' }
  | { type: 'closeAudio' }
  | { type: 'startCapture'; utteranceId: UtteranceId }
  | { type: 'stopCapture' }
  | { type: 'beginTurn' }
  | { type: 'endTurn' }
  | { type: 'enqueuePlayback'; utteranceId: UtteranceId; pcm: Pcm }
  | { type: 'finishPlayback'; utteranceId: UtteranceId }
  | { type: 'stopPlayback' };

export type Transition = [Session, Effect[]];

export function initialSession(participants: Participant[]): Session {
  return { participants, connection: 'idle', utterances: [], awaitingResponse: [], nextId: 1 };
}

export const ACTIVE_STATUSES: readonly UtteranceStatus[] = ['capturing', 'translating', 'queued', 'speaking'];

export function capturingUtterance(s: Session): Utterance | undefined {
  return s.utterances.find((u) => u.status === 'capturing');
}

function respondingId(s: Session): UtteranceId | undefined {
  return s.awaitingResponse[0];
}

function patch(s: Session, id: UtteranceId, f: (u: Utterance) => Partial<Utterance>): Session {
  return { ...s, utterances: s.utterances.map((u) => (u.id === id ? { ...u, ...f(u) } : u)) };
}

function find(s: Session, id: UtteranceId | undefined): Utterance | undefined {
  return id === undefined ? undefined : s.utterances.find((u) => u.id === id);
}

/** Fail every utterance that is still in flight, for example when the connection drops. */
function failInFlight(s: Session, error: string): Session {
  return {
    ...s,
    awaitingResponse: [],
    utterances: s.utterances.map((u) => (ACTIVE_STATUSES.includes(u.status) ? { ...u, status: 'failed', error } : u)),
  };
}

export function transition(s: Session, e: SessionEvent): Transition {
  switch (e.type) {
    case 'start':
      if (s.connection === 'connecting' || s.connection === 'open' || s.connection === 'reconnecting') return [s, []];
      // openAudio runs inside the user gesture that sent 'start', which browsers require.
      return [
        { ...s, connection: 'connecting', error: undefined },
        [{ type: 'openAudio' }, { type: 'connect', participants: s.participants }],
      ];

    case 'stop': {
      const captured = capturingUtterance(s) !== undefined;
      const effects: Effect[] = [
        ...(captured ? [{ type: 'stopCapture' } as const] : []),
        { type: 'stopPlayback' },
        { type: 'disconnect' },
        { type: 'closeAudio' },
      ];
      return [{ ...failInFlight(s, 'stopped'), connection: 'idle' }, effects];
    }

    case 'connected':
      if (s.connection !== 'connecting' && s.connection !== 'reconnecting') return [s, []];
      return [{ ...s, connection: 'open', error: undefined }, []];

    case 'connectFailed':
      if (s.connection !== 'connecting' && s.connection !== 'reconnecting') return [s, []];
      return [{ ...s, connection: 'failed', error: e.error }, []];

    case 'connectionLost': {
      // Only an open connection reconnects by itself; a failed reconnect ends in 'failed'.
      if (s.connection !== 'open') return [s, []];
      const captured = capturingUtterance(s) !== undefined;
      // In-flight responses do not survive the old connection; audio already queued still plays.
      const partial = s.awaitingResponse.filter((id) => {
        const status = find(s, id)?.status;
        return status === 'queued' || status === 'speaking';
      });
      const effects: Effect[] = [
        ...(captured ? [{ type: 'stopCapture' } as const] : []),
        ...partial.map((utteranceId) => ({ type: 'finishPlayback', utteranceId }) as const),
        { type: 'connect', participants: s.participants },
      ];
      const lost = s.utterances
        .filter((u) => u.status === 'capturing' || u.status === 'translating')
        .map((u) => u.id);
      const next = lost.reduce((acc, id) => patch(acc, id, () => ({ status: 'failed', error: e.reason })), s);
      return [{ ...next, connection: 'reconnecting', awaitingResponse: [] }, effects];
    }

    case 'pressTalk': {
      if (s.connection !== 'open') return [s, []];
      if (!s.participants.some((p) => p.id === e.speakerId)) return [s, []];
      if (capturingUtterance(s) !== undefined) return [s, []];
      const id = `u${s.nextId}`;
      const utterance: Utterance = { id, speakerId: e.speakerId, status: 'capturing', source: '', translation: '' };
      return [
        {
          ...s,
          nextId: s.nextId + 1,
          utterances: [...s.utterances, utterance],
          awaitingResponse: [...s.awaitingResponse, id],
        },
        [{ type: 'beginTurn' }, { type: 'startCapture', utteranceId: id }],
      ];
    }

    case 'releaseTalk': {
      const u = capturingUtterance(s);
      if (u === undefined || u.speakerId !== e.speakerId) return [s, []];
      return [patch(s, u.id, () => ({ status: 'translating' })), [{ type: 'stopCapture' }, { type: 'endTurn' }]];
    }

    case 'captureFailed': {
      const u = capturingUtterance(s);
      if (u === undefined) return [{ ...s, error: e.error }, []];
      const next = patch(s, u.id, () => ({ status: 'failed', error: e.error }));
      return [
        { ...next, error: e.error, awaitingResponse: s.awaitingResponse.filter((id) => id !== u.id) },
        [{ type: 'stopCapture' }, { type: 'endTurn' }],
      ];
    }

    case 'inputTranscript': {
      const id = respondingId(s);
      if (id === undefined) return [s, []];
      return [patch(s, id, (u) => ({ source: u.source + e.text })), []];
    }

    case 'outputTranscript': {
      const id = respondingId(s);
      if (id === undefined) return [s, []];
      return [patch(s, id, (u) => ({ translation: u.translation + e.text })), []];
    }

    case 'outputAudio': {
      const u = find(s, respondingId(s));
      if (u === undefined) return [s, []];
      const next = u.status === 'translating' ? patch(s, u.id, () => ({ status: 'queued' })) : s;
      return [next, [{ type: 'enqueuePlayback', utteranceId: u.id, pcm: e.pcm }]];
    }

    case 'turnComplete': {
      const u = find(s, respondingId(s));
      if (u === undefined) return [s, []];
      const rest = { ...s, awaitingResponse: s.awaitingResponse.slice(1) };
      switch (u.status) {
        case 'queued':
        case 'speaking':
          return [rest, [{ type: 'finishPlayback', utteranceId: u.id }]];
        case 'translating': {
          // The model answered without audio (for example, it heard nothing).
          const status = u.translation === '' ? 'failed' : 'done';
          const error = status === 'failed' ? 'no translation' : undefined;
          return [patch(rest, u.id, () => ({ status, error })), []];
        }
        default:
          // A turn completed while still capturing (should not happen with manual turns): keep waiting.
          return [s, []];
      }
    }

    case 'playbackStarted': {
      const u = find(s, e.utteranceId);
      if (u === undefined || u.status !== 'queued') return [s, []];
      return [patch(s, u.id, () => ({ status: 'speaking' })), []];
    }

    case 'playbackFinished': {
      const u = find(s, e.utteranceId);
      if (u === undefined || (u.status !== 'queued' && u.status !== 'speaking')) return [s, []];
      return [patch(s, u.id, () => ({ status: 'done' })), []];
    }
  }
}
