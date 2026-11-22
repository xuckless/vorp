// The whole conversation, both languages. Each person's side of the page is their seat, so who
// spoke is carried by position, not by a label.

import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Session } from '@/core/session';
import { Layer, Press } from '@/ui/primitives';
import { TOUCH_TARGET, useTheme } from '@/ui/tokens';

import { COLUMN_WIDTH } from './LanguagePicker';
import { captions } from './stage';

export function Transcript({ open, session, onClose }: { open: boolean; session: Session; onClose: () => void }) {
  const theme = useTheme();
  const text = { fontFamily: theme.type.family, color: theme.color.text };
  const lines = captions(session);
  return (
    <Layer open={open} onClose={onClose} kind="sheet" style={[StyleSheet.absoluteFill, styles.sheet, { backgroundColor: theme.color.background }]}>
      {() => (
        <View style={[styles.column, { padding: theme.space.xl }]}>
          <View style={styles.top}>
            <Text accessibilityRole="header" style={[text, { fontFamily: theme.type.familyMedium, fontSize: 20 }]}>
              Transcript
            </Text>
            <Press onPress={onClose} style={styles.close}>
              <Text style={[text, { fontSize: 15, color: theme.color.textMuted }]}>Close</Text>
            </Press>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.xl, paddingVertical: theme.space.xl }}>
            {lines.length === 0 ? <Text style={[text, { fontSize: 16, color: theme.color.textMuted }]}>Nothing said yet</Text> : null}
            {lines.map((u) => {
              const right = session.participants.findIndex((p) => p.id === u.speakerId) > 0;
              const side = { textAlign: right ? 'right' : 'left' } as const;
              return (
                <View key={u.id} style={[styles.line, right ? styles.right : styles.left]}>
                  <Text style={[text, side, { fontSize: 18, lineHeight: 26 }]}>{u.source}</Text>
                  {u.translation ? <Text style={[text, side, { fontSize: 18, lineHeight: 26, color: theme.color.textMuted }]}>{u.translation}</Text> : null}
                </View>
              );
            })}
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
  line: { maxWidth: '82%', gap: 4 },
  left: { alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end' },
});
