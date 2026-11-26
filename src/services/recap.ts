// Asks the token server for a recap. The server holds the key and calls a text model.

import { RECAP_URL } from '@/config/conversation';

import { passHeaders } from './pass';
import type { Recap } from './types';

export function createRecap(url: string = RECAP_URL): Recap {
  return {
    async summarise(languages, lines) {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...passHeaders() }, body: JSON.stringify({ languages, lines }) });
      if (!res.ok) throw new Error(`recap server answered ${res.status}`);
      const body = (await res.json()) as { recap?: unknown };
      // The model's answer is itself a JSON object: language name to recap.
      const recap: unknown = typeof body.recap === 'string' ? JSON.parse(body.recap) : body.recap;
      if (recap === null || typeof recap !== 'object') throw new Error('recap server sent no recap');
      return Object.fromEntries(Object.entries(recap).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    },
  };
}
