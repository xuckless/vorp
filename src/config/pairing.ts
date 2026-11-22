// Pair by QR: where things live and how long the moments last. The wire contract is
// docs/pairing-protocol.md; the server enforces the room limits (10-minute codes, 60 s rejoin).

import type { SessionSettings } from '@/core/session';

import { TOKEN_URL } from './conversation';
import { INTERPRETER_VOICE } from './voices';

/**
 * Where a guest lands after a session: the product landing page (`landing/index.html`, published
 * on its own). The guest goes to `LANDING_URL?from=session&lang=<their language>`.
 *
 * PLACEHOLDER (owner, 22 November 2026: GitHub Pages or Cloudflare Pages, undecided). Set
 * EXPO_PUBLIC_LANDING_URL, or change this one value, once the page is published.
 */
export const LANDING_URL = process.env.EXPO_PUBLIC_LANDING_URL ?? 'https://xuckless.github.io/vorp/';

/** The landing page's address for a guest who just finished a conversation. */
export const landingFor = (language: string) => `${LANDING_URL}?from=session&lang=${encodeURIComponent(language)}`;

/** `POST` makes a room; `WS <ROOMS_URL>/<code>` is a phone's socket. Same server as the token. */
export const ROOMS_URL = TOKEN_URL.replace(/token$/, 'rooms');

/** The path a guest opens, after the app's origin: the QR code says `<origin>/join/<code>`. */
export const JOIN_PATH = '/join/';

/**
 * The web app's origin, for the QR code: where the page runs (the token server serves it in
 * production), or EXPO_PUBLIC_APP_URL where there is no page origin (native).
 */
export const appOrigin = () => process.env.EXPO_PUBLIC_APP_URL ?? (typeof location === 'undefined' ? '' : location.origin);

export const PAIR_TIMING = {
  /** The host's "They're in" moment before the conversation shows (the design's 1.9 s). */
  joinedMs: 1900,
  /** The guest's "Thanks for talking" before the landing page (the design's 2.6 s). */
  doneMs: 2600,
  /** The booth loop: the host's end card counts down this long to a fresh code. */
  boothSeconds: 6,
  /** The contract: a ping every 15 s, so the server notices an expired code or an absent peer. */
  pingMs: 15_000,
  /** A dropped socket keeps trying to rejoin for as long as the server holds its place. */
  rejoinMs: 60_000,
  /** Between rejoin attempts. */
  rejoinEveryMs: 1500,
  /** The contract: `playback playing` at most 4 times a second. */
  progressEveryMs: 250,
  /** The contract: about 10 caption messages a second per side at most; pieces in between are merged. */
  captionEveryMs: 100,
} as const;

/**
 * The guest has no settings: its phone interprets in the default voice. The host knows it, so its
 * echo filter learns that voice; the guest learns the host's voice afresh (it keeps nothing).
 */
export const GUEST_VOICE = INTERPRETER_VOICE;

/**
 * Whether the guest's phone runs Vorp's voice filter (the on-device voiceprint model, about 21 MB
 * of model and WASM, fetched once the conversation shows). The host always does. Mic and speaker
 * taking turns and the transcript guard work without it.
 */
export const GUEST_VOICE_FILTER = true;

/**
 * A paired phone's session settings from the owner's: the paired prompt row (one direction, the
 * other phone left alone), and no auto-detect (the other person's language is known).
 */
export const pairedSettings = (settings: SessionSettings): SessionSettings => ({ ...settings, prompt: 'paired', autoDetect: false });
