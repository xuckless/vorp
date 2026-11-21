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
