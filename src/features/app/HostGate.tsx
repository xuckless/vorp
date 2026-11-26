// The booth gate: with HOST_GATE on, the owner's app renders only on a device holding the booth's
// pass (services/pass); anyone else sees the demo-mode page. The app comes in as `children`, so a
// visitor's phone never loads it.

import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { HOST_GATE, REPO_URL } from '@/config/booth';
import { LANDING_URL } from '@/config/pairing';
import { loadHostPass } from '@/services/pass';
import { createStorage } from '@/services/storage';
import { useReducedMotion, useTheme } from '@/ui/tokens';

import GateDom from './dom/GateDom';

export function HostGate({ children }: { children: ReactNode }) {
  // undefined while the kept pass is read.
  const [host, setHost] = useState<boolean | undefined>(HOST_GATE ? undefined : true);
  const theme = useTheme();
  const reduced = useReducedMotion();

  useEffect(() => {
    if (HOST_GATE) void loadHostPass(createStorage()).then(setHost);
  }, []);

  if (host === undefined) return null;
  if (host) return children;
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background }}>
      <GateDom dark={theme.scheme === 'dark'} reduced={reduced} landingUrl={LANDING_URL} repoUrl={REPO_URL} dom={{ style: { flex: 1 }, scrollEnabled: false }} />
    </View>
  );
}
