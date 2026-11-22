// The guest's page (route /join/<code>): owns the guest's pairing and renders its DOM component.
// It boots nothing of the owner's app (no history, no settings, no enrolment) and keeps nothing.
// The language picked before Join is this screen's until Join; from then on the pairing has it.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Linking, Platform, View } from 'react-native';

import { landingFor, PAIR_TIMING } from '@/config/pairing';
import { useLevelProp } from '@/ui/dom/level';
import { useReducedMotion, useTheme } from '@/ui/tokens';

import GuestDom from './dom/GuestDom';
import { createGuestPairing } from './guest';
import { guestLanguage, guestPageModel } from './model';

function leave(language: string) {
  const url = landingFor(language);
  if (Platform.OS === 'web') window.location.assign(url);
  else void Linking.openURL(url);
}

const asked = () => (typeof navigator === 'undefined' ? [] : [...(navigator.languages ?? [navigator.language])]);

export function GuestScreen({ code, host }: { code: string; host?: string }) {
  const [pick, setPick] = useState(() => guestLanguage(host, asked()));
  const [runtime] = useState(() => createGuestPairing(code, pick, leave));
  const pairing = useSyncExternalStore(runtime.store.subscribe, runtime.store.get, runtime.store.get);
  const theme = useTheme();
  const reduced = useReducedMotion();

  useEffect(() => () => runtime.dispose(), [runtime]);

  const page = guestPageModel(pairing, pick, pairing.peerLanguage ?? host);
  const level = useLevelProp(page.talk?.phase === 'speaking' ? runtime.levels.out : runtime.levels.mic, true);
  const { dispatch } = runtime;

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <GuestDom
        dark={theme.scheme === 'dark'}
        reduced={reduced}
        page={page}
        level={level}
        boothSeconds={PAIR_TIMING.boothSeconds}
        onPick={setPick}
        // The tap itself: the microphone and the speaker open inside it (iPhone needs both).
        onJoin={() => dispatch({ type: 'join', language: page.language })}
        onStop={() => dispatch({ type: 'stop' })}
        onPressTalk={() => dispatch({ type: 'pressTalk' })}
        onReleaseTalk={() => dispatch({ type: 'releaseTalk' })}
        onSound={() => dispatch({ type: 'soundOn' })}
        onContinue={() => dispatch({ type: 'continue' })}
        onRetry={() => dispatch({ type: 'own', event: { type: 'start' } })}
        dom={{ style: { flex: 1 }, scrollEnabled: false }}
      />
    </View>
  );
}
