// The app: the owners of state (the conversation's runtime and history, enrolment, the look) on
// this side, and the design's screens as one DOM component (./dom/VorpDom), fed plain data from
// ./model and callbacks that turn taps into events. On web the screens render inline; on native
// they run in a web view, where per-frame levels arrive as sampled numbers.

import * as Clipboard from 'expo-clipboard';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';

import { createController } from '@/features/conversation/controller';
import type { Boot } from '@/features/conversation/Vorp';
import { useEnrolment } from '@/features/enrolment/controller';
import { needsEnrolment } from '@/features/enrolment/enrolment';
import { keepSaved } from '@/features/settings/saved';
import { useLevelProp } from '@/ui/dom/level';
import { themePreference, useReducedMotion, useTheme } from '@/ui/tokens';

import VorpDom from './dom/VorpDom';
import {
  copyText,
  enrolModel,
  historyItem,
  languageChoices,
  setupEvent,
  setupModel,
  talkModel,
  TONE_CHOICES,
  VOICE_CHOICES,
  type Mode,
  type Page,
  type SetupModel,
} from './model';

export function AppScreen({
  mode,
  autostart,
  boot,
  page,
  prompted,
  onPage,
  onPrompted,
  onMode,
}: {
  mode: Mode;
  autostart: boolean;
  boot: Boot;
  page: Page;
  /** The first-launch voice setup prompt was answered. */
  prompted: boolean;
  onPage: (page: Page) => void;
  onPrompted: () => void;
  onMode: (mode: Mode) => void;
}) {
  // A conversation that ends with a recap opens its transcript.
  const [{ runtime, levels, history, retryRecap }] = useState(() => createController(mode, boot, (id) => onPage({ name: 'transcript', id })));
  const { dispatch } = runtime;

  useEffect(() => {
    const forget = mode === 'live' ? keepSaved(boot.storage, runtime.store) : () => {};
    if (autostart) dispatch({ type: 'start' });
    return () => {
      forget();
      levels.dispose();
      runtime.dispose();
    };
  }, [mode, autostart, boot.storage, runtime, levels, dispatch]);

  const session = useSyncExternalStore(runtime.store.subscribe, runtime.store.get, runtime.store.get);
  const past = useSyncExternalStore(history.store.subscribe, history.store.get, history.store.get);
  const enrolment = useEnrolment(boot.enrolment);
  const appearance = useSyncExternalStore(themePreference.subscribe, themePreference.get, themePreference.get);
  const theme = useTheme();
  const reduced = useReducedMotion();

  const talk = talkModel(session, mode);
  // The voice in the air: yours while you read your sentences, Vorp's while it speaks, else the microphone's.
  const enrolling = page.name === 'enrol' && talk === undefined;
  const level = useLevelProp(enrolling ? boot.enrolment.level : talk?.phase === 'speaking' ? levels.out : levels.mic, true);
  // "Today" and "Yesterday" are counted from when the app opened.
  const [now] = useState(() => Date.now());

  /** Leaving the demo for any page goes back to the live app. */
  const navigate = (next: Page) => {
    if (mode === 'demo') onMode('live');
    onPage(next);
  };
  const start = () => {
    // First launch: offer voice setup once, before the first conversation.
    if (mode === 'live' && !prompted && needsEnrolment(enrolment)) return onPage({ name: 'enrol', first: true });
    dispatch({ type: 'start' });
  };

  return (
    <View style={{ flex: 1 }}>
      <VorpDom
        dark={theme.scheme === 'dark'}
        reduced={reduced}
        mode={mode}
        page={page}
        talk={talk ?? null}
        setup={setupModel(session, appearance)}
        youChoices={languageChoices(session.people, 'owner')}
        themChoices={languageChoices(session.people, 'other')}
        voiceChoices={VOICE_CHOICES}
        toneChoices={TONE_CHOICES}
        enrol={enrolModel(enrolment, session.people.owner.language)}
        history={past.map((c) => historyItem(c, now))}
        level={level}
        onStart={start}
        onStop={() => dispatch({ type: 'stop' })}
        onRetry={() => dispatch({ type: 'start' })}
        onPressTalk={() => dispatch({ type: 'pressTalk', speaker: 'owner' })}
        onReleaseTalk={() => dispatch({ type: 'releaseTalk', speaker: 'owner' })}
        onSetup={(patch: Partial<SetupModel>) => {
          if (patch.appearance !== undefined) themePreference.set(patch.appearance);
          const event = setupEvent(session, patch);
          if (event) dispatch(event);
        }}
        onPage={navigate}
        onDemo={() => onMode('demo')}
        onEnrolBegin={() => boot.enrolment.begin(session.people.owner.language)}
        onEnrolNext={() => boot.enrolment.next()}
        onEnrolCancel={() => boot.enrolment.cancel()}
        onEnrolDelete={() => boot.enrolment.remove()}
        onEnrolDone={(first: boolean) => {
          onPage({ name: 'start' });
          if (!first) return;
          // From first launch, done or "Not now" goes straight into the conversation.
          onPrompted();
          dispatch({ type: 'start' });
        }}
        onCopy={(id: string) => {
          const c = past.find((x) => x.id === id);
          if (c) void Clipboard.setStringAsync(copyText(c)).catch(() => {});
        }}
        onDelete={(id: string) => history.remove(id)}
        onRetryRecap={(id: string) => retryRecap(id)}
        dom={{ style: { flex: 1 }, scrollEnabled: false }}
      />
    </View>
  );
}
