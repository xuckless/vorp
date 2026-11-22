// Conversation policies and feature flags as data. The reducer reads the chosen rows through
// SessionSettings; nothing branches on a row's presence.

import type { OverlapPolicy, SessionSettings, TurnDetection } from '@/core/session';

/**
 * What new speech does to a translation being spoken. 'queue': Vorp finishes the current
 * translation while capturing the next, then speaks it in order. Ducking and barge-in are
 * future rows (after the hackathon).
 */
export const OVERLAP_POLICIES = [
  { id: 'queue', speechDuringPlayback: 'queue', holdSeconds: 20 },
] as const satisfies readonly OverlapPolicy[];

export type OverlapPolicyId = (typeof OVERLAP_POLICIES)[number]['id'];

export const FLAGS = {
  /** Emergency switch for rooms where echo cancellation fails: deaf while Vorp speaks. */
  pauseMicWhileSpeaking: false,
} as const;

/** Hands-free by default; 'manual' is push-to-talk only, for noisy rooms. */
export const TURN_DETECTION: TurnDetection = 'auto';

/** Share of a captured transcript's words found in the spoken translation that marks an echo. */
export const ECHO_MATCH = 0.6;

const overlap = (id: OverlapPolicyId): OverlapPolicy => OVERLAP_POLICIES.find((p) => p.id === id)!;

export const DEFAULT_SETTINGS: SessionSettings = {
  detection: TURN_DETECTION,
  overlap: overlap('queue'),
  pauseMicWhileSpeaking: FLAGS.pauseMicWhileSpeaking,
  echoMatch: ECHO_MATCH,
};
