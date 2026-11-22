// Settings: which widget fills each slot, the interpreter's voice, and motion. The choices are
// drawn with the widgets themselves, so picking one is looking at it.

import { useSyncExternalStore } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { VOICES } from '@/config/voices';
import type { Participant } from '@/core/session';
import { Layer, Press } from '@/ui/primitives';
import { chooseSlot, implementation, implementationIds, useSlotChoices, type ImplementationId } from '@/ui/slots';
import { motionPreference, TOUCH_TARGET, useTheme } from '@/ui/tokens';

import { COLUMN_WIDTH } from './LanguagePicker';

/** The plain stand-ins are for tests and fallbacks, not for choosing. */
const offered = <S extends 'agentAvatar' | 'thinkingIndicator'>(slot: S) => implementationIds(slot).filter((id) => id !== 'plain');

export function Settings({
  open,
  voice,
  voiceLocked,
  onVoice,
  onClose,
}: {
  open: boolean;
  voice: Participant['voice'];
  /** A live session keeps the voice it started with. */
  voiceLocked: boolean;
  onVoice: (voice: Participant['voice']) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const choices = useSlotChoices();
  const reduce = useSyncExternalStore(motionPreference.subscribe, motionPreference.get, motionPreference.get) === 'reduce';
  const text = { fontFamily: theme.type.family, color: theme.color.text, fontSize: 16 };
  const muted = { ...text, color: theme.color.textMuted };
  const title = { ...text, fontFamily: theme.type.familyMedium };
  const tile = (on: boolean) => [styles.tile, { borderRadius: theme.radius.md }, on && { backgroundColor: theme.color.surface }];

  return (
    <Layer open={open} onClose={onClose} kind="sheet" style={[StyleSheet.absoluteFill, styles.sheet, { backgroundColor: theme.color.background }]}>
      {() => (
        <View style={[styles.column, { padding: theme.space.xl }]}>
          <View style={styles.top}>
            <Text accessibilityRole="header" style={[title, { fontSize: 20 }]}>
              Settings
            </Text>
            <Press onPress={onClose} style={styles.close}>
              <Text style={[muted, { fontSize: 15 }]}>Close</Text>
            </Press>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.xxl, paddingVertical: theme.space.xl }}>
            <View style={{ gap: theme.space.md }}>
              <Text accessibilityRole="header" style={title}>
                Avatar
              </Text>
              <View style={styles.row}>
                {offered('agentAvatar').map((id) => {
                  const Avatar = implementation('agentAvatar', id);
                  const on = choices.agentAvatar === id;
                  return (
                    <Press key={id} accessibilityLabel={`Avatar ${id}`} accessibilityState={{ selected: on }} onPress={() => chooseSlot('agentAvatar', id as ImplementationId<'agentAvatar'>)} style={tile(on)}>
                      <Avatar state={on ? 'working' : 'idle'} size={56} />
                    </Press>
                  );
                })}
              </View>
            </View>

            <View style={{ gap: theme.space.md }}>
              <Text accessibilityRole="header" style={title}>
                Thinking
              </Text>
              <View style={styles.row}>
                {offered('thinkingIndicator').map((id) => {
                  const Orb = implementation('thinkingIndicator', id);
                  const on = choices.thinkingIndicator === id;
                  return (
                    <Press key={id} accessibilityLabel={`Thinking style ${id}`} accessibilityState={{ selected: on }} onPress={() => chooseSlot('thinkingIndicator', id as ImplementationId<'thinkingIndicator'>)} style={tile(on)}>
                      <Orb size={32} />
                    </Press>
                  );
                })}
              </View>
            </View>

            <View style={{ gap: theme.space.md }}>
              <Text accessibilityRole="header" style={title}>
                Voice
              </Text>
              {voiceLocked ? <Text style={muted}>Stop the conversation to change the voice</Text> : null}
              <View style={styles.row}>
                {VOICES.map((v) => {
                  const on = v.name === voice;
                  return (
                    <Press
                      key={v.name}
                      disabled={voiceLocked}
                      accessibilityLabel={`${v.name}, ${v.character}`}
                      accessibilityState={{ selected: on }}
                      onPress={() => onVoice(v.name)}
                      style={[styles.voice, { borderRadius: theme.radius.sm, paddingHorizontal: theme.space.md }, on && { backgroundColor: theme.color.surface }]}
                    >
                      <Text style={on ? title : text}>{v.name}</Text>
                      <Text style={[muted, { fontSize: 13 }]}>{v.character}</Text>
                    </Press>
                  );
                })}
              </View>
            </View>

            <Press accessibilityRole="switch" accessibilityState={{ checked: reduce }} onPress={() => motionPreference.set(reduce ? 'system' : 'reduce')} style={styles.toggle}>
              <Text style={title}>Reduce motion</Text>
              <Text style={muted}>{reduce ? 'On' : 'Off'}</Text>
            </Press>
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
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center' },
  voice: { width: 132, minHeight: 56, justifyContent: 'center' },
  toggle: { minHeight: TOUCH_TARGET, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
