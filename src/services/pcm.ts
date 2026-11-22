// PCM <-> base64 for the Live API wire format (little-endian 16-bit samples).

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63] + '==';
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + '=';
  }
  return out;
}

const LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

export function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)];
    const b = LOOKUP[clean.charCodeAt(i + 1)];
    const c = i + 2 < clean.length ? LOOKUP[clean.charCodeAt(i + 2)] : 0;
    const d = i + 3 < clean.length ? LOOKUP[clean.charCodeAt(i + 3)] : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < out.length) out[o++] = n >> 16;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

function littleEndian(): boolean {
  return new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
}

export function pcmToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < pcm.length; i++) view.setInt16(i * 2, pcm[i], true);
  return bytesToBase64(bytes);
}

export function base64ToPcm(text: string): Int16Array {
  const bytes = base64ToBytes(text);
  const n = bytes.length >> 1;
  if (littleEndian()) return new Int16Array(bytes.buffer, 0, n);
  const view = new DataView(bytes.buffer);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = view.getInt16(i * 2, true);
  return out;
}

/**
 * Linear-interpolation resampling of 16-bit PCM, for example the interpreter's 24 kHz output to
 * the 16 kHz the voiceprint model takes. Speech energy sits well below both Nyquist limits.
 */
export function resample(pcm: Int16Array, from: number, to: number): Int16Array {
  if (from === to || pcm.length === 0) return pcm.slice();
  const out = new Int16Array(Math.floor((pcm.length * to) / from));
  const step = from / to;
  for (let i = 0; i < out.length; i++) {
    const at = i * step;
    const j = Math.floor(at);
    const next = j + 1 < pcm.length ? pcm[j + 1] : pcm[j];
    out[i] = Math.round(pcm[j] + (next - pcm[j]) * (at - j));
  }
  return out;
}

export type VoicedOptions = {
  /** Frame length in samples. */
  frame: number;
  /** A frame is kept if its RMS is at least this share of the loudest frame's... */
  relative: number;
  /** ...and at least this absolute RMS (0..1 of full scale). */
  floor: number;
};

/**
 * The frames that carry a voice, joined: quiet frames (pauses, the silence the server waits for
 * before ending a turn) are left out so they do not dilute a speaker embedding. Not a turn
 * detector; turns stay the server's.
 */
export function voicedSamples(pcm: Int16Array, { frame, relative, floor }: VoicedOptions): Int16Array {
  const frames = Math.floor(pcm.length / frame);
  const rms = new Float64Array(frames);
  let loudest = 0;
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * frame; i < (f + 1) * frame; i++) sum += pcm[i] * pcm[i];
    rms[f] = Math.sqrt(sum / frame) / 0x8000;
    loudest = Math.max(loudest, rms[f]);
  }
  const gate = Math.max(floor, loudest * relative);
  const kept: number[] = [];
  for (let f = 0; f < frames; f++) if (rms[f] >= gate && rms[f] > 0) kept.push(f);
  const out = new Int16Array(kept.length * frame);
  kept.forEach((f, k) => out.set(pcm.subarray(f * frame, (f + 1) * frame), k * frame));
  return out;
}

/** 16-bit PCM as floats in -1..1, the form the voiceprint model's feature extractor takes. */
export function pcmToFloat(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 0x8000;
  return out;
}

/** Concatenate chunks into one buffer. */
export function joinPcm(chunks: readonly Int16Array[]): Int16Array {
  const out = new Int16Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
