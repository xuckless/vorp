// A Translator whose implementation (the Gemini Live SDK) is fetched only when it first connects,
// so a page that may never translate (the guest's language page) does not load it up front.

import { ServiceError, type Translator, type TranslatorEvent } from './types';

export function createLazyTranslator(load: () => Promise<{ createTranslator: () => Translator }>): Translator {
  const listeners = new Set<(e: TranslatorEvent) => void>();
  let real: Translator | null = null;
  let loading: Promise<Translator> | null = null;
  let generation = 0;

  const ready = () =>
    (loading ??= load().then(
      ({ createTranslator }) => {
        real = createTranslator();
        real.onEvent((e) => listeners.forEach((l) => l(e)));
        return real;
      },
      (err: unknown) => {
        loading = null;
        throw err;
      },
    ));

  return {
    async connect(people, settings) {
      const mine = ++generation;
      const translator = await ready();
      if (mine !== generation) throw new ServiceError('socket', 'superseded');
      return translator.connect(people, settings);
    },
    close() {
      generation++;
      real?.close();
    },
    beginTurn: () => real?.beginTurn(),
    sendAudio: (pcm) => real?.sendAudio(pcm),
    endTurn: () => real?.endTurn(),
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
