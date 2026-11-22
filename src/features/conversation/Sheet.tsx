// The frame every full-screen sheet shares: a title, Close, and a scrolling column.

import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Layer, Press } from '@/ui/primitives';
import { TOUCH_TARGET, useTheme } from '@/ui/tokens';

/** The stage's column, which sheets and the picker line up with. */
export const COLUMN_WIDTH = 720;

export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const theme = useTheme();
  const text = { fontFamily: theme.type.family, color: theme.color.text };
  return (
    <Layer open={open} onClose={onClose} kind="sheet" style={[StyleSheet.absoluteFill, styles.sheet, { backgroundColor: theme.color.background }]}>
      {() => (
        <View style={[styles.column, { paddingHorizontal: theme.space.xl, paddingTop: theme.space.xl }]}>
          <View style={styles.top}>
            <Text accessibilityRole="header" style={[text, { fontFamily: theme.type.familyMedium, fontSize: 20 }]}>
              {title}
            </Text>
            <Press onPress={onClose} style={styles.close}>
              <Text style={[text, { fontSize: 15, color: theme.color.textMuted }]}>Close</Text>
            </Press>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.xxl, paddingVertical: theme.space.xl }}>
            {children}
          </ScrollView>
        </View>
      )}
    </Layer>
  );
}

const styles = StyleSheet.create({
  sheet: { alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: COLUMN_WIDTH },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: TOUCH_TARGET },
  close: { minHeight: TOUCH_TARGET, justifyContent: 'center' },
});
