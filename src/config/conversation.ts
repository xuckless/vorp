// Defaults for a new conversation and the app's endpoints.

import type { People } from '@/core/session';

import { INTERPRETER_VOICE } from './voices';

/** Before anything is saved: the owner speaks English, the other person is spoken to in French. */
export const DEFAULT_PEOPLE: People = {
  owner: { language: 'en', voice: INTERPRETER_VOICE },
  other: { language: 'fr', voice: INTERPRETER_VOICE },
};

/**
 * Where the app gets a short-lived Live API token. Same origin in production (the token
 * server also serves the web build); set EXPO_PUBLIC_TOKEN_URL in development.
 */
export const TOKEN_URL = process.env.EXPO_PUBLIC_TOKEN_URL ?? '/token';

/** The same server writes recaps. */
export const RECAP_URL = TOKEN_URL.replace(/token$/, 'recap');
