// The pairing link: `POST /rooms` and one WebSocket per phone to `/rooms/<code>` on the token
// server (docs/pairing-protocol.md). Plain fetch and WebSocket, so one implementation serves web
// and native. The keys stay in here, in memory: the host's from `create`, the guest's from its
// welcome. While paired, a socket that closes without `ended` rejoins with the key for as long
// as the server keeps the place (`PAIR_TIMING.rejoinMs`).

import { PAIR_TIMING, ROOMS_URL } from '@/config/pairing';
import type { EndReason, Outbound, PairRole, PlaybackState, RefusalCode, WireTurnState } from '@/core/pairing';

import type { PairingLink, PairingLinkEvent } from './types';

/** The contract caps a frame at 64 KiB; audio is split on an even byte boundary. */
const MAX_FRAME_SAMPLES = 32 * 1024;

const TURN_STATES: readonly WireTurnState[] = ['talking', 'translating', 'ready', 'done', 'failed'];
const PLAYBACK_STATES: readonly PlaybackState[] = ['queued', 'playing', 'heard'];
const END_REASONS: readonly (EndReason | 'expired')[] = ['host_stopped', 'guest_stopped', 'host_left', 'guest_left', 'expired'];
const REFUSALS: readonly RefusalCode[] = ['bad_message', 'bad_key', 'not_found', 'taken', 'expired', 'host_gone', 'replaced', 'rate_limited'];

const base = () => (typeof location === 'undefined' ? undefined : location.href);

/** The room socket's address: the rooms endpoint with ws(s) for http(s). */
function socketUrl(code: string): string {
  const url = new URL(`${ROOMS_URL}/${encodeURIComponent(code)}`, base());
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
}

const str = (v: unknown): v is string => typeof v === 'string';
const oneOf = <T extends string>(v: unknown, list: readonly T[]): v is T => list.includes(v as T);

/** A server or relayed text message as a link event; anything malformed is dropped. */
export function parseMessage(text: string): PairingLinkEvent | { type: 'pong' } | { type: 'keyed'; key: string; event: PairingLinkEvent } | undefined {
  let m: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== 'object') return undefined;
    m = value as Record<string, unknown>;
  } catch {
    return undefined;
  }
  switch (m.type) {
    case 'welcome': {
      const event: PairingLinkEvent = { type: 'welcome', ...(str(m.peerLanguage) ? { peerLanguage: m.peerLanguage } : {}), ...(m.rejoined === true ? { rejoined: true } : {}) };
      return str(m.key) ? { type: 'keyed', key: m.key, event } : event;
    }
    case 'peer_joined':
      return str(m.peerLanguage) ? { type: 'peerJoined', peerLanguage: m.peerLanguage } : undefined;
    case 'peer_away':
      return { type: 'peerAway' };
    case 'peer_back':
      return { type: 'peerBack' };
    case 'pong':
      return { type: 'pong' };
    case 'ended':
      return oneOf(m.reason, END_REASONS) ? { type: 'ended', reason: m.reason } : { type: 'ended', reason: 'host_left' };
    case 'error':
      return oneOf(m.code, REFUSALS) ? { type: 'refused', code: m.code } : { type: 'refused', code: 'bad_message' };
    case 'speaking':
      return typeof m.talking === 'boolean' ? { type: 'peerSpeaking', talking: m.talking } : undefined;
    case 'turn':
      return str(m.turn) && oneOf(m.state, TURN_STATES) ? { type: 'peerTurn', turn: m.turn, state: m.state } : undefined;
    case 'caption':
      return str(m.turn) && (m.side === 'source' || m.side === 'translation') && str(m.delta)
        ? { type: 'peerCaption', turn: m.turn, side: m.side, delta: m.delta }
        : undefined;
    case 'playback':
      if (!str(m.turn) || !oneOf(m.state, PLAYBACK_STATES)) return undefined;
      return {
        type: 'peerPlayback',
        turn: m.turn,
        state: m.state,
        ...(typeof m.progress === 'number' ? { progress: Math.max(0, Math.min(1, m.progress)) } : {}),
      };
    default:
      return undefined;
  }
}

export function createPairingLink(): PairingLink {
  const listeners = new Set<(e: PairingLinkEvent) => void>();
  const emit = (e: PairingLinkEvent) => listeners.forEach((l) => l(e));

  let socket: WebSocket | null = null;
  let room: { role: PairRole; code: string; language: string } | null = null;
  let hostKey: string | undefined;
  let key: string | undefined;
  /** Past the guest's arrival: a drop now is rejoined, not the end. */
  let paired = false;
  /** Set once the room is over for this phone (ended, refused, closed, given up). */
  let over = true;
  let ping: ReturnType<typeof setInterval> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let rejoinUntil = 0;
  /** Caption pieces waiting to go, merged per turn and side (the contract's ~10 a second). */
  const captions = new Map<string, Extract<Outbound, { type: 'caption' }>>();
  let flushing: ReturnType<typeof setTimeout> | undefined;

  function write(message: object) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  function flush() {
    clearTimeout(flushing);
    flushing = undefined;
    captions.forEach((c) => write(c));
    captions.clear();
  }

  function stopTimers() {
    clearInterval(ping);
    clearTimeout(retry);
    clearTimeout(flushing);
    ping = retry = flushing = undefined;
    captions.clear();
  }

  function retire() {
    const old = socket;
    socket = null;
    if (old) {
      old.onopen = old.onmessage = old.onclose = old.onerror = null;
      if (old.readyState === WebSocket.OPEN || old.readyState === WebSocket.CONNECTING) old.close(1000);
    }
  }

  function finish() {
    over = true;
    stopTimers();
    retire();
  }

  function connect(rejoin: boolean) {
    if (room === null) return;
    const { role, code, language } = room;
    retire();
    const ws = new WebSocket(socketUrl(code));
    ws.binaryType = 'arraybuffer';
    socket = ws;
    let welcomed = false;
    ws.onopen = () => {
      // The host always says hello with its key; the guest only when it rejoins.
      const secret = role === 'host' ? hostKey : rejoin ? key : undefined;
      write({ type: 'hello', role, language, ...(secret ? { key: secret } : {}) });
      clearInterval(ping);
      ping = setInterval(() => write({ type: 'ping' }), PAIR_TIMING.pingMs);
    };
    ws.onmessage = (m) => {
      if (socket !== ws) return;
      if (typeof m.data !== 'string') {
        const buffer = m.data as ArrayBuffer;
        if (buffer.byteLength >= 2) emit({ type: 'peerAudio', pcm: new Int16Array(buffer, 0, buffer.byteLength >> 1) });
        return;
      }
      let event = parseMessage(m.data);
      if (event === undefined || event.type === 'pong') return;
      if (event.type === 'keyed') {
        key = event.key;
        event = event.event;
      }
      if (event.type === 'welcome') {
        welcomed = true;
        if (role === 'guest') paired = true;
      }
      if (event.type === 'peerJoined') paired = true;
      if (event.type === 'refused') {
        // A newer socket of ours took over; this one just retires.
        if (event.code === 'replaced') return retireOnly(ws);
        // Over the relay rate: the server treats it as a drop, and so does this phone.
        if (event.code === 'rate_limited') return;
        if (rejoin && !welcomed) {
          finish();
          return emit({ type: 'lost' });
        }
        finish();
        return emit(event);
      }
      if (event.type === 'ended') {
        finish();
        return emit(event);
      }
      emit(event);
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (socket !== ws || over) return;
      socket = null;
      clearInterval(ping);
      if (!paired) {
        finish();
        return emit({ type: 'dropped' });
      }
      if (!rejoin) {
        rejoinUntil = Date.now() + PAIR_TIMING.rejoinMs;
        emit({ type: 'rejoining' });
      }
      if (Date.now() >= rejoinUntil) {
        finish();
        return emit({ type: 'lost' });
      }
      retry = setTimeout(() => connect(true), rejoin ? PAIR_TIMING.rejoinEveryMs : 0);
    };
  }

  function retireOnly(ws: WebSocket) {
    if (socket === ws) socket = null;
    ws.onclose = ws.onmessage = null;
    ws.close(1000);
  }

  return {
    async create() {
      const res = await fetch(ROOMS_URL, { method: 'POST' });
      if (res.status !== 201) throw new Error(`rooms answered ${res.status}`);
      const body = (await res.json()) as { code?: unknown; hostKey?: unknown; expiresIn?: unknown };
      if (!str(body.code) || !str(body.hostKey)) throw new Error('rooms sent no code');
      hostKey = body.hostKey;
      return { code: body.code, expiresIn: typeof body.expiresIn === 'number' ? body.expiresIn : 600 };
    },

    open(role, code, language) {
      finish();
      room = { role, code, language };
      key = undefined;
      paired = false;
      over = false;
      connect(false);
    },

    send(message) {
      if (message.type === 'caption') {
        const k = `${message.turn}\u0000${message.side}`;
        const pending = captions.get(k);
        captions.set(k, pending ? { ...pending, delta: pending.delta + message.delta } : message);
        flushing ??= setTimeout(flush, PAIR_TIMING.captionEveryMs);
        return;
      }
      // Anything else about a turn comes after its words.
      flush();
      write(message);
    },

    sendAudio(pcm) {
      if (socket?.readyState !== WebSocket.OPEN) return;
      flush();
      for (let at = 0; at < pcm.length; at += MAX_FRAME_SAMPLES) {
        // A copy: the frame owns its bytes, whatever buffer the chunk came from.
        socket.send(pcm.slice(at, Math.min(pcm.length, at + MAX_FRAME_SAMPLES)));
      }
    },

    end() {
      flush();
      write({ type: 'end' });
      // The server answers `ended` and closes; this side lets go now and reports nothing more.
      over = true;
      const ws = socket;
      socket = null;
      stopTimers();
      if (ws) {
        ws.onmessage = ws.onclose = ws.onerror = null;
        setTimeout(() => ws.readyState === WebSocket.OPEN && ws.close(1000), 1000);
      }
    },

    close() {
      finish();
      room = null;
      hostKey = key = undefined;
    },

    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
