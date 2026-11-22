// Something that opens over the screen. A `popover` grows from its trigger's corner (rules 10
// to 12); a `sheet` rises into place. Both leave faster than they arrive (rule 15) and stay
// interruptible: closing mid-entrance retargets from where the panel is.

import { useEffect, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { duration, exitDuration, motion, timing, useReducedMotion, type DurationName } from '@/ui/tokens';

import { usePresence } from './presence';
import { transition } from './transition';

const NAME: Record<'popover' | 'sheet', DurationName> = { popover: 'dropdown', sheet: 'base' };

export function Layer({
  open,
  onClose,
  kind,
  origin = 'top right',
  style,
  children,
}: {
  open: boolean;
  onClose: () => void;
  kind: 'popover' | 'sheet';
  /** Where the trigger is, as a CSS transform origin. Popovers grow from it. */
  origin?: string;
  /** Position, size and surface of the panel. */
  style?: StyleProp<ViewStyle>;
  /** `shown` turns true a frame after mounting, for content that settles after its container. */
  children: (shown: boolean) => ReactNode;
}) {
  const reduced = useReducedMotion();
  const name = NAME[kind];
  const { mounted, shown } = usePresence(open, reduced ? 0 : exitDuration(duration[name]));
  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);
  if (!mounted) return null;
  const away: ViewStyle =
    kind === 'popover'
      ? { opacity: 0, transform: [{ scale: motion.popoverFromScale }, { translateY: 0 }] }
      : { opacity: 0, transform: [{ scale: 1 }, { translateY: motion.shift * 2 }] };
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: open ? 'auto' : 'none' }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <View
        accessibilityViewIsModal
        style={[
          { transformOrigin: origin },
          transition('opacity, transform', timing(name, shown ? 'enter' : 'exit', reduced)),
          style,
          shown ? { opacity: 1, transform: [{ scale: 1 }, { translateY: 0 }] } : away,
        ]}
      >
        {children(shown)}
      </View>
    </View>
  );
}
