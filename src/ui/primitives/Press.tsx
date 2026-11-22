// The one pressable: scales to the press token while held (rule 4) and eases back.

import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { motion, timing, useReducedMotion } from '@/ui/tokens';

import { transition } from './transition';

export type PressProps = Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle> };

export function Press({ style, accessibilityRole = 'button', ...rest }: PressProps) {
  const reduced = useReducedMotion();
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      style={({ pressed }) => [
        transition('transform, background-color, opacity', timing('press', 'enter', reduced)),
        style,
        pressed && !reduced && { transform: [{ scale: motion.pressScale }] },
      ]}
      {...rest}
    />
  );
}
