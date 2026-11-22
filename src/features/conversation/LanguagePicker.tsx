// Pick a language from everything the model supports. Opens from the language it changes.

import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { LANGUAGES } from '@/config/languages';
import { Layer, Press, transition } from '@/ui/primitives';
import { motion, staggerDelay, timing, TOUCH_TARGET, useReducedMotion, useTheme } from '@/ui/tokens';

/** Rows that enter one after another; the rest are below the fold and arrive with the last. */
const STAGGERED_ROWS = 8;

/** The stage's column, which the picker lines up with. */
export const COLUMN_WIDTH = 720;

export function LanguagePicker({
  open,
  selected,
  onPick,
  onClose,
}: {
  open: boolean;
  /** The language code in use. */
  selected?: string;
  onPick: (code: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  // Under the languages in the header, which sit at the right edge of the centred column.
  const { width } = useWindowDimensions();
  const right = Math.max(0, (width - COLUMN_WIDTH) / 2) + theme.space.xl;
  const [query, setQuery] = useState('');
  const wanted = query.trim().toLowerCase();
  const rows = LANGUAGES.filter((l) => l.name.toLowerCase().includes(wanted));
  const text = { fontFamily: theme.type.family, color: theme.color.text, fontSize: 16 };

  return (
    <Layer
      open={open}
      onClose={onClose}
      kind="popover"
      style={[styles.panel, { right, backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, padding: theme.space.sm }]}
    >
      {(shown) => (
        <>
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={theme.color.textMuted}
            accessibilityLabel="Search languages"
            style={[text, styles.search, { paddingHorizontal: theme.space.md, outlineStyle: 'none' } as object]}
          />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {rows.map((l, i) => {
              const current = l.code === selected;
              return (
                <View
                  key={l.code}
                  style={[
                    transition('opacity, transform', timing('base', 'enter', reduced), shown ? staggerDelay(Math.min(i, STAGGERED_ROWS), reduced) : 0),
                    shown ? styles.rowIn : { opacity: 0, transform: [{ translateY: motion.shift }] },
                  ]}
                >
                  <Press
                    accessibilityState={{ selected: current }}
                    onPress={() => {
                      onPick(l.code);
                      setQuery('');
                    }}
                    style={[styles.row, { paddingHorizontal: theme.space.md, borderRadius: theme.radius.sm }, current && { backgroundColor: theme.color.surfaceRaised }]}
                  >
                    <Text style={[text, current && { fontFamily: theme.type.familyMedium }]}>{l.name}</Text>
                  </Press>
                </View>
              );
            })}
            {rows.length === 0 ? <Text style={[text, styles.none, { color: theme.color.textMuted, paddingHorizontal: theme.space.md }]}>No language by that name</Text> : null}
          </ScrollView>
        </>
      )}
    </Layer>
  );
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', top: 68, width: 280, maxWidth: '92%', maxHeight: '70%' },
  search: { minHeight: TOUCH_TARGET },
  row: { minHeight: TOUCH_TARGET, justifyContent: 'center' },
  rowIn: { opacity: 1, transform: [{ translateY: 0 }] },
  none: { paddingVertical: 12 },
});
