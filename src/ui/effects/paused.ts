// Whether effects should stand still: under reduced motion, and while the app is not in the
// foreground (on web, AppState follows the page's visibility). Offscreen pausing is each
// engine's own IntersectionObserver; see AGENTS.md for what that covers on native.

import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { useReducedMotion } from '@/ui/tokens';

function subscribeAppState(listener: () => void) {
  const sub = AppState.addEventListener('change', listener);
  return () => sub.remove();
}
const appActive = () => AppState.currentState !== 'background' && AppState.currentState !== 'inactive';

export function useEffectsPaused(): boolean {
  const reduced = useReducedMotion();
  const active = useSyncExternalStore(subscribeAppState, appActive, () => true);
  return reduced || !active;
}
