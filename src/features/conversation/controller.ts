// One conversation's owners and runners, live or the demo: the runtime (session store and effect
// runner), the voice levels, and the history it archives into, with the recap written when it
// ends. Created once per mode; the screen renders from its stores.

import { DEMO_PEOPLE } from '@/config/demo';
import { languageName } from '@/config/languages';
import { DEFAULT_SETTINGS } from '@/config/policies';
import type { Role, Utterance } from '@/core/session';
import { asText, createHistory, toConversation, type History } from '@/features/history/history';
import { createDemoServices, createServices, type Services } from '@/services';

import { createLevels, type Levels } from './levels';
import { createRuntime, type Runtime } from './runtime';
import type { Boot, Mode } from './Vorp';

export type Controller = {
  runtime: Runtime;
  levels: Levels;
  history: History;
  /** Write a conversation's recap again (after it failed). */
  retryRecap: (id: string) => void;
};

export function createController(mode: Mode, boot: Boot, onEnded: (id: string) => void): Controller {
  // The demo ends itself after its last line, which archives it and shows the recap.
  const services: Services = mode === 'demo' ? createDemoServices(() => runtime.dispatch({ type: 'stop' })) : createServices();
  // The demo keeps nothing: its history lives only as long as the demo is on screen.
  const history = mode === 'demo' ? createHistory([], () => {}) : boot.history;
  const people = mode === 'demo' ? DEMO_PEOPLE : boot.setup.people;
  const settings = mode === 'demo' ? DEFAULT_SETTINGS : boot.setup.settings;

  function writeRecap(id: string) {
    const conversation = history.store.get().find((c) => c.id === id);
    if (!conversation) return;
    history.setRecap(id, { status: 'writing' });
    const languages = [...new Set([conversation.languages.owner, conversation.languages.other].map(languageName))];
    services.recap.summarise(languages, asText(conversation)).then(
      (text) => history.setRecap(id, { status: 'ready', text }),
      () => history.setRecap(id, { status: 'failed' }),
    );
  }

  const runtime = createRuntime(
    services,
    people,
    settings,
    (languages: Record<Role, string>, utterances: Utterance[]) => {
      const now = Date.now();
      const conversation = toConversation(String(now), now, languages, utterances);
      history.add(conversation);
      if (!runtime.store.get().settings.behaviours.includes('recap')) return;
      onEnded(conversation.id);
      writeRecap(conversation.id);
    },
    mode === 'demo' ? undefined : boot.enrolment.ownerPrint,
    mode === 'demo' ? undefined : boot.interpreterPrints,
  );
  return { runtime, levels: createLevels(services), history, retryRecap: writeRecap };
}
