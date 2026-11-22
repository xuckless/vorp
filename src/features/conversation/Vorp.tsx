// The app's shell: reads what was saved, then shows the app. The demo is the same stage with
// scripted services, so switching to it is a remount with a different set of services. Which page
// is open lives here, above that remount, so leaving the demo can land on History.

import { Suspense, use, useState } from 'react';
import { View } from 'react-native';

import { AppScreen } from '@/features/app/AppScreen';
import type { Page } from '@/features/app/model';
import { createEnrolment, type EnrolmentController } from '@/features/enrolment/controller';
import { parsePrompted, PROMPTED_KEY } from '@/features/enrolment/saved';
import { loadHistory, type History } from '@/features/history/history';
import { loadSetup, type Setup } from '@/features/settings/saved';
import { createEnrolmentServices, createStorage, type KeyValueStorage } from '@/services';
import { useTheme } from '@/ui/tokens';

import { loadInterpreterPrints } from './interpreter-prints';
import type { InterpreterPrints } from './voice';

export type Mode = 'live' | 'demo';
/**
 * `enrolment` owns the owner's voiceprint; the UI drives it, the live runtime reads it.
 * `interpreterPrints` is Vorp's own voice as learnt, for the echo filter. `prompted`: the first
 * launch voice setup prompt was already answered.
 */
export type Boot = {
  storage: KeyValueStorage;
  history: History;
  setup: Setup;
  enrolment: EnrolmentController;
  interpreterPrints: InterpreterPrints;
  prompted: boolean;
};

async function boot(): Promise<Boot> {
  const storage = createStorage();
  const enrolment = createEnrolment(createEnrolmentServices(), storage);
  const [history, setup, interpreterPrints, prompted] = await Promise.all([
    loadHistory(storage),
    loadSetup(storage),
    loadInterpreterPrints(storage),
    storage.get(PROMPTED_KEY).then(parsePrompted, () => false),
  ]);
  return { storage, history, setup, enrolment, interpreterPrints, prompted };
}

/** Read once per page load. */
let booting: Promise<Boot> | null = null;

function Loaded() {
  const loaded = use((booting ??= boot()));
  // `autostart` is true only when the demo was chosen by a tap, which is the gesture audio needs.
  const [{ mode, autostart }, setMode] = useState<{ mode: Mode; autostart: boolean }>({ mode: 'live', autostart: false });
  const [page, setPage] = useState<Page>({ name: 'start' });
  const [prompted, setPrompted] = useState(loaded.prompted);
  return (
    <AppScreen
      key={mode}
      mode={mode}
      autostart={autostart}
      boot={loaded}
      page={page}
      prompted={prompted}
      onPage={setPage}
      onPrompted={() => {
        setPrompted(true);
        void loaded.storage.set(PROMPTED_KEY, '1').catch(() => {});
      }}
      onMode={(next) => setMode({ mode: next, autostart: next === 'demo' })}
    />
  );
}

export function Vorp() {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <Suspense fallback={null}>
        <Loaded />
      </Suspense>
    </View>
  );
}
