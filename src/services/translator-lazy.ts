// A Translator whose implementation (the Gemini Live SDK) is fetched only when it first connects,
// so a page that may never translate (the guest's language page) does not load it up front.

import type { Translator, TranslatorEvent } from './types';

export function createLazyTranslator(load: () => Promise<{ createTranslator: () => Translator }> = () => import('./translator')): Translator {
  const listeners = new Set<(e: TranslatorEvent) => void>();
  let real: Translator | null = null;
  let loading: Promise<Translator> | null = null;

  const ready = () =>
    (loading ??= load().then(({ createTranslator }) => {
      real = createTranslator();
      real.onEvent((e) => listeners.forEach((l) => l(e)));
      return real;
    }));

  return {
    async connect(people, settings) {
      return (await ready()).connect(people, settings);
    },
    close: () => real?.close(),
    beginTurn: () => real?.beginTurn(),
    sendAudio: (pcm) => real?.sendAudio(pcm),
    endTurn: () => real?.endTurn(),
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
