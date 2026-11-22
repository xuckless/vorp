// Dev gallery: every implementation of every slot on one page, driven by fake data. The chips
// switch the implementation the app uses (the same runtime path settings will take); the grid
// below shows all of them side by side.

import { useEffect, useState, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  AgentAvatar,
  CaptionTransition,
  chooseSlot,
  implementation,
  implementationIds,
  MessageSurface,
  ThinkingIndicator,
  useSlotChoices,
  VoiceVisualiser,
  type ImplementationId,
  type SlotName,
  type SlotProps,
} from '@/ui/slots';
import { motion, motionPreference, TOUCH_TARGET, useTheme, type Theme } from '@/ui/tokens';

import { CAPTION, scriptAt, speech } from './fake';

const started = Date.now();
const seconds = () => (Date.now() - started) / 1000;
/** The fake microphone / output level, sampled by the visualiser every frame. */
const level = () => speech(seconds());

/** The script's current step, re-read four times a second. */
function useScript() {
  const [t, setT] = useState(seconds);
  useEffect(() => {
    const id = setInterval(() => setT(seconds()), 250);
    return () => clearInterval(id);
  }, []);
  return scriptAt(t);
}

function Chip({ label, on, onPress, theme }: { label: string; on: boolean; onPress: () => void; theme: Theme }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      style={({ pressed }) => [
        styles.chip,
        { borderRadius: theme.radius.pill, borderColor: on ? theme.color.accent : theme.color.border, backgroundColor: on ? theme.color.accent : 'transparent' },
        pressed && { transform: [{ scale: motion.pressScale }] },
      ]}>
      <Text style={{ color: on ? theme.color.onAccent : theme.color.text, fontSize: theme.type.caption.fontSize }}>{label}</Text>
    </Pressable>
  );
}

function Section<S extends SlotName>({
  slot,
  title,
  Live,
  render,
  only,
}: {
  only?: SlotName;
  slot: S;
  title: string;
  Live: ComponentType<SlotProps[S]>;
  render: (C: ComponentType<SlotProps[S]>) => ReactNode;
}) {
  const theme = useTheme();
  const chosen = useSlotChoices()[slot];
  const ids = implementationIds(slot);
  if (only && only !== slot) return null;
  return (
    <View style={[styles.section, { borderColor: theme.color.border, gap: theme.space.md }]}>
      <Text style={[styles.title, { color: theme.color.text }]}>
        {title} <Text style={{ color: theme.color.textMuted }}>({slot})</Text>
      </Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={`${title} implementation`}>
        {ids.map((id) => (
          <Chip key={id} label={id} on={id === chosen} theme={theme} onPress={() => chooseSlot(slot, id as ImplementationId<S>)} />
        ))}
      </View>
      <Text style={{ color: theme.color.textMuted }}>In use</Text>
      <View style={styles.cell}>{render(Live)}</View>
      <Text style={{ color: theme.color.textMuted }}>All implementations</Text>
      <View style={[styles.row, { gap: theme.space.xl }]}>
        {ids.map((id) => (
          <View key={id} style={styles.cell} testID={`impl-${slot}-${id}`}>
            {render(implementation(slot, id))}
            <Text style={{ color: theme.color.textMuted, fontSize: theme.type.caption.fontSize }}>{id}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** `only` shows a single slot (`/gallery?only=captionTransition`). */
export function GalleryScreen({ only }: { only?: SlotName }) {
  const theme = useTheme();
  const step = useScript();
  const preference = useSyncExternalStore(motionPreference.subscribe, motionPreference.get, motionPreference.get);
  const revealed = step.index >= 2;
  const speaking = step.voice === 'speaking';
  const caption = (
    <Text style={{ color: theme.color.text, fontSize: theme.type.body.fontSize, lineHeight: theme.type.body.lineHeight }}>
      {speaking ? CAPTION.translation : CAPTION.original}
    </Text>
  );
  return (
    <ScrollView style={{ backgroundColor: theme.color.background }} contentContainerStyle={[styles.page, { gap: theme.space.xl }]}>
      <Text style={[styles.heading, { color: theme.color.text }]}>Vorp gallery</Text>
      <Text style={{ color: theme.color.textMuted }}>
        Script: {step.voice} · avatar {step.avatar} · caption {revealed ? 'translated' : 'original'} · {theme.scheme} scheme
      </Text>
      <View style={styles.row}>
        <Chip label="Motion: system" on={preference === 'system'} theme={theme} onPress={() => motionPreference.set('system')} />
        <Chip label="Motion: reduce" on={preference === 'reduce'} theme={theme} onPress={() => motionPreference.set('reduce')} />
      </View>

      <Section only={only} slot="voiceVisualiser" title="Voice visualiser" Live={VoiceVisualiser} render={(C) => <C state={step.voice} level={level} size={200} />} />
      <Section only={only} slot="thinkingIndicator" title="Thinking indicator" Live={ThinkingIndicator} render={(C) => <C size={64} />} />
      <Section only={only} slot="agentAvatar" title="Agent avatar" Live={AgentAvatar} render={(C) => <C state={step.avatar} size={64} />} />
      <Section
        only={only}
        slot="messageSurface"
        title="Message surface (glows while speaking)"
        Live={MessageSurface}
        render={(C) => (
          <C glowing={speaking} style={{ width: 320 }}>
            {caption}
          </C>
        )}
      />
      <Section
        only={only}
        slot="captionTransition"
        title="Caption transition"
        Live={CaptionTransition}
        render={(C) => <C original={CAPTION.original} translation={CAPTION.translation} revealed={revealed} width={320} />}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 24, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  heading: { fontSize: 28, fontWeight: '700' },
  title: { fontSize: 18, fontWeight: '600' },
  section: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' },
  cell: { alignItems: 'center', gap: 8 },
  chip: { minHeight: TOUCH_TARGET, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 1 },
});
