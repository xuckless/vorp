// Fetches a short-lived Live API token from the token server. The Gemini key never
// reaches the client.

import { TOKEN_URL } from '@/config/conversation';

import { passHeaders } from './pass';

export type LiveToken = { token: string; expireTime: string };

export async function fetchLiveToken(url: string = TOKEN_URL): Promise<LiveToken> {
  const res = await fetch(url, { method: 'POST', headers: passHeaders() });
  if (!res.ok) throw new Error(`token server answered ${res.status}`);
  const body = (await res.json()) as Partial<LiveToken>;
  if (typeof body.token !== 'string') throw new Error('token server sent no token');
  return { token: body.token, expireTime: body.expireTime ?? '' };
}
