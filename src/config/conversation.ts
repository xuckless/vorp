// Defaults for a new conversation and the app's endpoints.

import type { Participant } from '@/core/session';

import { INTERPRETER_VOICE } from './voices';

/** The last-used setup replaces this once settings persist (phase 5). */
export const DEFAULT_PARTICIPANTS: Participant[] = [
  { id: 'p1', name: 'English speaker', language: 'en', voice: INTERPRETER_VOICE },
  { id: 'p2', name: 'French speaker', language: 'fr', voice: INTERPRETER_VOICE },
];

/**
 * Where the app gets a short-lived Live API token. Same origin in production (the token
 * server also serves the web build); set EXPO_PUBLIC_TOKEN_URL in development.
 */
export const TOKEN_URL = process.env.EXPO_PUBLIC_TOKEN_URL ?? '/token';

/** The same server writes recaps. */
export const RECAP_URL = TOKEN_URL.replace(/token$/, 'recap');

/** The language a newly added person starts with: the first of these nobody speaks yet. */
export const NEXT_LANGUAGES = ['es', 'en', 'fr', 'de'] as const;

/** Two people must work flawlessly; three is best effort. */
export const PEOPLE_COUNTS = [2, 3] as const;
