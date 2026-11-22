// Past conversations on this device, newest first. Opening one shows its transcript.

import { StyleSheet, Text, View } from 'react-native';

import { languageName } from '@/config/languages';
import type { Conversation } from '@/features/history/history';
import { Press } from '@/ui/primitives';
import { TOUCH_TARGET, useTheme } from '@/ui/tokens';

import { Sheet } from './Sheet';

const when = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function HistoryList({ open, conversations, onOpen, onClose }: { open: boolean; conversations: readonly Conversation[]; onOpen: (id: string) => void; onClose: () => void }) {
  const theme = useTheme();
  const text = { fontFamily: theme.type.family, color: theme.color.text, fontSize: 18, lineHeight: 26 };
  const muted = { ...text, fontSize: 15, lineHeight: 22, color: theme.color.textMuted };
  return (
    <Sheet open={open} title="History" onClose={onClose}>
      <View style={{ gap: theme.space.sm }}>
        {conversations.length === 0 ? <Text style={[text, { color: theme.color.textMuted }]}>No conversations yet</Text> : null}
        {conversations.map((c) => (
          <Press key={c.id} onPress={() => onOpen(c.id)} style={styles.row}>
            <Text style={text} numberOfLines={1}>
              {c.lines[0]?.source}
            </Text>
            <Text style={muted}>
              {[c.languages.owner, c.languages.other].map(languageName).join(', ')} · {when(c.endedAt)}
            </Text>
          </Press>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: TOUCH_TARGET, justifyContent: 'center', paddingVertical: 8, gap: 2 },
});
