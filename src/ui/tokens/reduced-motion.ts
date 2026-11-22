// The reduced-motion switch. One owner: the user's preference lives in `motionPreference`, the
// system setting is read from the platform, and `useReducedMotion` derives the answer from both.
// Settings (phase 5) will write the preference; nothing else does.

import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Easing, type EasingFunction } from 'react-native';

import { createStore } from '@/core/store';

import type { Bezier } from './motion';

/** `system` follows the platform setting; `reduce` turns motion off whatever it says. */
export type MotionPreference = 'system' | 'reduce';

export const motionPreference = createStore<MotionPreference>('system');

/** The platform's reduce-motion setting, subscribed to on first use. */
const systemReduced = createStore(false);
let watching = false;
function subscribeSystem(listener: () => void) {
  if (!watching) {
    watching = true;
    AccessibilityInfo.isReduceMotionEnabled().then(systemReduced.set, () => {});
    AccessibilityInfo.addEventListener('reduceMotionChanged', systemReduced.set);
  }
  return systemReduced.subscribe(listener);
}

/** True when animations should be instant and effects still. */
export function useReducedMotion(): boolean {
  const preference = useSyncExternalStore(motionPreference.subscribe, motionPreference.get, motionPreference.get);
  const system = useSyncExternalStore(subscribeSystem, systemReduced.get, systemReduced.get);
  return preference === 'reduce' || system;
}

/** A motion token curve for React Native's Animated. */
export function animatedEasing([a, b, c, d]: Bezier): EasingFunction {
  return Easing.bezier(a, b, c, d);
}
