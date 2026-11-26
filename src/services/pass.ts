// What this device shows the token server (`X-API-Key`): the booth's host secret, kept on the
// device, or, on a visitor's phone, its room's guest key while it is paired (from `welcome`, in
// memory only). The one owner of both; the token, recap and rooms calls read `passHeaders()`.

import { HOST_PARAM, HOST_PASS_KEY } from '@/config/booth';

import type { KeyValueStorage } from './types';

let host: string | undefined;
let guest: string | undefined;

/** The header for a call to the token server, if this device has a pass. */
export const passHeaders = (): Record<string, string> => {
  const key = host ?? guest;
  return key ? { 'X-API-Key': key } : {};
};

/** The pairing link sets it on the guest's welcome and clears it when the room is over. */
export const setGuestPass = (key: string | undefined) => {
  guest = key;
};

/**
 * Whether this device is a booth host: a secret in the page's address (`?host=`) is kept and taken
 * out of the address, so it is not shown or shared; otherwise the one kept before is used.
 */
export async function loadHostPass(storage: KeyValueStorage): Promise<boolean> {
  const fromUrl = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get(HOST_PARAM);
  if (fromUrl) {
    await storage.set(HOST_PASS_KEY, fromUrl);
    const url = new URL(location.href);
    url.searchParams.delete(HOST_PARAM);
    history.replaceState(history.state, '', url);
  }
  host = fromUrl || ((await storage.get(HOST_PASS_KEY)) ?? undefined);
  return host !== undefined;
}
