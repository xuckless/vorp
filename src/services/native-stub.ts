// Native audio and translator implementations arrive in phase 6. Until then every native
// entry point throws, so a native build fails loudly instead of silently doing nothing.

export function notImplemented(what: string): never {
  throw new Error(`${what} is not implemented on native yet`);
}
