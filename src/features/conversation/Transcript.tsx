// A whole conversation, both languages, with its notes and its recap. Each person's side of
// the page is their seat, so who spoke is carried by position, not by a label.

import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { languageName } from '@/config/languages';
import { asText, type Conversation } from '@/features/history/history';
import { Press } from '@/ui/primitives';
import { TOUCH_TARGET, useTheme } from '@/ui/tokens';

import { Sheet } from './Sheet';

function everything(c: Conversation): string {
  const recap = c.recap.status === 'ready' ? ['', ...Object.entries(c.recap.text).map(([language, text]) => `${language}: ${text}`)] : [];
  return [...asText(c), ...recap].join('\n');
}

export function Transcript({ conversation, onClose, onDelete }: { conversation: Conversation | null; onClose: () => void; onDelete?: () => void }) {
  const theme = useTheme();
  // Which conversation was copied last, so the confirmation belongs to it alone.
  const [copied, setCopied] = useState<string | null>(null);
  const text = { fontFamily: theme.type.family, color: theme.color.text, fontSize: 18, lineHeight: 26 };
  const muted = { ...text, color: theme.color.textMuted };
  const c = conversation;
  return (
    <Sheet open={c !== null} title="Transcript" onClose={onClose}>
      {c === null ? null : (
        <>
          <View style={{ gap: theme.space.xl }}>
            {c.lines.length === 0 ? <Text style={muted}>Nothing said yet</Text> : null}
            {c.lines.map((line, i) => {
              const speakerIndex = c.participants.findIndex((p) => p.id === line.speakerId);
              const right = speakerIndex > 0;
              const side = { textAlign: right ? 'right' : 'left' } as const;
              const speaker = c.participants[speakerIndex];
              return (
                <View key={i} style={[styles.line, right ? styles.right : styles.left]}>
                  {c.participants.length > 2 && speaker ? (
                    <Text style={[muted, side, { fontSize: 13, lineHeight: 18 }]}>{languageName(speaker.language)}</Text>
                  ) : null}
                  <Text style={[text, side]}>{line.source}</Text>
                  {line.translation ? <Text style={[muted, side]}>{line.translation}</Text> : null}
                  {line.note ? <Text style={[muted, side, { fontSize: 15, lineHeight: 22 }]}>{line.note}</Text> : null}
                </View>
              );
            })}
          </View>

          {c.recap.status === 'none' ? null : (
            <View style={{ gap: theme.space.md }}>
              <Text accessibilityRole="header" style={[text, { fontFamily: theme.type.familyMedium }]}>
                Recap
              </Text>
              {c.recap.status === 'writing' ? <Text style={muted}>Writing the recap</Text> : null}
              {c.recap.status === 'failed' ? <Text style={muted}>The recap could not be written</Text> : null}
              {c.recap.status === 'ready' ? Object.entries(c.recap.text).map(([language, recap]) => <Text key={language} style={text}>{recap}</Text>) : null}
            </View>
          )}

          {c.lines.length > 0 ? (
            <View style={[styles.actions, { gap: theme.space.xl }]}>
              <Press
                onPress={() => {
                  void Clipboard.setStringAsync(everything(c)).then(() => setCopied(c.id));
                }}
                style={styles.action}
              >
                <Text style={[muted, { fontSize: 15 }]}>{copied === c.id ? 'Copied' : 'Copy'}</Text>
              </Press>
              {onDelete ? (
                <Press onPress={onDelete} style={styles.action}>
                  <Text style={[muted, { fontSize: 15 }]}>Delete</Text>
                </Press>
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  line: { maxWidth: '82%', gap: 4 },
  left: { alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end' },
  actions: { flexDirection: 'row' },
  action: { minHeight: TOUCH_TARGET, justifyContent: 'center' },
});
