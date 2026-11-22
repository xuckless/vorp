// A CSS transition as a style, built from motion tokens. The web build animates with it; native
// ignores the keys it does not know and changes at once.

import type { ViewStyle } from 'react-native';

import { cssEasing, type Timing } from '@/ui/tokens';

export function transition(properties: string, { duration, easing }: Timing, delay = 0): ViewStyle {
  return {
    transitionProperty: properties,
    transitionDuration: `${duration}ms`,
    transitionTimingFunction: cssEasing(easing),
    transitionDelay: `${delay}ms`,
  } as ViewStyle;
}
