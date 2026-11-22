// The app's shell: reads what was saved, then shows the stage. The demo is the same stage with
// scripted services, so switching to it is a remount with a different set of services.

import { Suspense, use, useState } from 'react';
import { View } from 'react-native';

import { createEnrolment, type EnrolmentController } from '@/features/enrolment/controller';
import { loadHistory, type History } from '@/features/history/history';
import { loadSetup, type Setup } from '@/features/settings/saved';
import { createEnrolmentServices, createStorage, type KeyValueStorage } from '@/services';
import { useTheme } from '@/ui/tokens';

import { ConversationScreen } from './ConversationScreen';

export type Mode = 'live' | 'demo';
/** `enrolment` owns the owner's voiceprint; the UI drives it, the live runtime reads it. */
export type Boot = { storage: KeyValueStorage; history: History; setup: Setup; enrolment: EnrolmentController };

async function boot(): Promise<Boot> {
  const storage = createStorage();
  const enrolment = createEnrolment(createEnrolmentServices(), storage);
  const [history, setup] = await Promise.all([loadHistory(storage), loadSetup(storage)]);
  return { storage, history, setup, enrolment };
}

/** Read once per page load. */
let booting: Promise<Boot> | null = null;

function Loaded() {
  const loaded = use((booting ??= boot()));
  // `autostart` is true only when the demo was chosen by a tap, which is the gesture audio needs.
  const [{ mode, autostart }, setMode] = useState<{ mode: Mode; autostart: boolean }>({ mode: 'live', autostart: false });
  return <ConversationScreen key={mode} mode={mode} autostart={autostart} boot={loaded} onMode={(next) => setMode({ mode: next, autostart: next === 'demo' })} />;
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
