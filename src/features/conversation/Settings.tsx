// Settings: how turns end and whose language is followed, how the interpreter behaves, and how Vorp looks.
// The look is chosen with the widgets themselves, so picking one is looking at it. The setup
// belongs to the session, so every change here is a `configure` event.

import { useSyncExternalStore, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BEHAVIOURS, TONES } from '@/config/behaviours';
import { VOICES } from '@/config/voices';
import type { People, Session, SessionEvent, SessionSettings } from '@/core/session';
import { Press } from '@/ui/primitives';
import { chooseSlot, implementation, implementationIds, useSlotChoices, type ImplementationId } from '@/ui/slots';
import { motionPreference, themePreference, TOUCH_TARGET, useTheme, type ThemePreference } from '@/ui/tokens';

import { Sheet } from './Sheet';

/** The plain stand-ins are for tests and fallbacks, not for choosing. */
const offered = <S extends 'agentAvatar' | 'thinkingIndicator'>(slot: S) => implementationIds(slot).filter((id) => id !== 'plain');

const THEMES: readonly { id: ThemePreference; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

function useText() {
  const theme = useTheme();
  const text = { fontFamily: theme.type.family, color: theme.color.text, fontSize: 16 };
  return { theme, text, muted: { ...text, color: theme.color.textMuted }, title: { ...text, fontFamily: theme.type.familyMedium }, picked: { backgroundColor: theme.color.surface } };
}

function Section({ name, children }: { name: string; children: ReactNode }) {
  const { theme, title } = useText();
  return (
    <View style={{ gap: theme.space.md }}>
      <Text accessibilityRole="header" style={title}>
        {name}
      </Text>
      {children}
    </View>
  );
}

function Option({ label, on, disabled, onPress }: { label: string; on: boolean; disabled?: boolean; onPress: () => void }) {
  const { theme, text, title, picked } = useText();
  return (
    <Press disabled={disabled} accessibilityState={{ selected: on }} onPress={onPress} style={[styles.option, { borderRadius: theme.radius.sm, paddingHorizontal: theme.space.lg }, on && picked]}>
      <Text style={on ? title : text}>{label}</Text>
    </Press>
  );
}

function Toggle({ label, help, on, disabled, onPress }: { label: string; help?: string; on: boolean; disabled?: boolean; onPress: () => void }) {
  const { text, muted, title } = useText();
  return (
    <Press accessibilityRole="switch" accessibilityState={{ checked: on }} disabled={disabled} onPress={onPress} style={styles.toggle}>
      <View style={styles.toggleText}>
        <Text style={text}>{label}</Text>
        {help ? <Text style={[muted, { fontSize: 14 }]}>{help}</Text> : null}
      </View>
      <Text style={on ? title : muted}>{on ? 'On' : 'Off'}</Text>
    </Press>
  );
}

export function Settings({ open, session, dispatch, onClose }: { open: boolean; session: Session; dispatch: (e: SessionEvent) => void; onClose: () => void }) {
  const theme = useTheme();
  const choices = useSlotChoices();
  const reduce = useSyncExternalStore(motionPreference.subscribe, motionPreference.get, motionPreference.get) === 'reduce';
  const themeChoice = useSyncExternalStore(themePreference.subscribe, themePreference.get, themePreference.get);
  const { people, settings } = session;
  const locked = session.connection !== 'idle' && session.connection !== 'failed';
  const configure = (who: People, next: Partial<SessionSettings> = {}) => dispatch({ type: 'configure', people: who, settings: { ...settings, ...next } });

  const { text, muted, title, picked } = useText();

  return (
    <Sheet open={open} title="Settings" onClose={onClose}>
      {locked ? <Text style={muted}>Stop the conversation to change the languages and how the interpreter behaves</Text> : null}

      <Section name="Languages">
        <Toggle
          label="Auto-detect their language"
          help="Vorp answers them in the language they last spoke. Off: always in the language you picked"
          on={settings.autoDetect}
          disabled={locked}
          onPress={() => configure(people, { autoDetect: !settings.autoDetect })}
        />
      </Section>

      <Section name="Turns">
        <Toggle
          label="Hands-free"
          help="Vorp hears when someone stops talking. Off: hold a button to talk"
          on={settings.detection === 'auto'}
          disabled={locked}
          onPress={() => configure(people, { detection: settings.detection === 'auto' ? 'manual' : 'auto' })}
        />
        <Toggle
          label="Mute while speaking"
          help="For loud rooms: Vorp stops listening while it talks"
          on={settings.pauseMicWhileSpeaking}
          disabled={locked}
          onPress={() => configure(people, { pauseMicWhileSpeaking: !settings.pauseMicWhileSpeaking })}
        />
      </Section>

      <Section name="Tone">
        <View style={styles.row}>
          {TONES.map((tone) => (
            <Option key={tone.id} label={tone.label} on={settings.tone === tone.id} disabled={locked} onPress={() => configure(people, { tone: tone.id })} />
          ))}
        </View>
      </Section>

      <Section name="Interpreter">
        {BEHAVIOURS.map((b) => {
          const on = settings.behaviours.includes(b.id);
          return (
            <Toggle
              key={b.id}
              label={b.label}
              help={b.experimental ? `${b.help}. Experimental` : b.help}
              on={on}
              disabled={locked}
              onPress={() => configure(people, { behaviours: on ? settings.behaviours.filter((id) => id !== b.id) : [...settings.behaviours, b.id] })}
            />
          );
        })}
      </Section>

      <Section name="Avatar">
        <View style={styles.row}>
          {offered('agentAvatar').map((id) => {
            const Avatar = implementation('agentAvatar', id);
            const on = choices.agentAvatar === id;
            return (
              <Press key={id} accessibilityLabel={`Avatar ${id}`} accessibilityState={{ selected: on }} onPress={() => chooseSlot('agentAvatar', id as ImplementationId<'agentAvatar'>)} style={[styles.tile, { borderRadius: theme.radius.md }, on && picked]}>
                <Avatar state={on ? 'working' : 'idle'} size={56} />
              </Press>
            );
          })}
        </View>
      </Section>

      <Section name="Thinking">
        <View style={styles.row}>
          {offered('thinkingIndicator').map((id) => {
            const Orb = implementation('thinkingIndicator', id);
            const on = choices.thinkingIndicator === id;
            return (
              <Press key={id} accessibilityLabel={`Thinking style ${id}`} accessibilityState={{ selected: on }} onPress={() => chooseSlot('thinkingIndicator', id as ImplementationId<'thinkingIndicator'>)} style={[styles.tile, { borderRadius: theme.radius.md }, on && picked]}>
                <Orb size={32} />
              </Press>
            );
          })}
        </View>
      </Section>

      <Section name="Appearance">
        <View style={styles.row}>
          {THEMES.map((t) => (
            <Option key={t.id} label={t.label} on={themeChoice === t.id} onPress={() => themePreference.set(t.id)} />
          ))}
        </View>
        <Toggle label="Reduce motion" on={reduce} onPress={() => motionPreference.set(reduce ? 'system' : 'reduce')} />
      </Section>

      <Section name="Voice">
        <View style={styles.row}>
          {VOICES.map((v) => {
            const on = v.name === people.owner.voice;
            return (
              <Press
                key={v.name}
                disabled={locked}
                accessibilityLabel={`${v.name}, ${v.character}`}
                accessibilityState={{ selected: on }}
                onPress={() => configure({ owner: { ...people.owner, voice: v.name }, other: { ...people.other, voice: v.name } })}
                style={[styles.voice, { borderRadius: theme.radius.sm, paddingHorizontal: theme.space.md }, on && picked]}
              >
                <Text style={on ? title : text}>{v.name}</Text>
                <Text style={[muted, { fontSize: 13 }]}>{v.character}</Text>
              </Press>
            );
          })}
        </View>
      </Section>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { minHeight: TOUCH_TARGET, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
  tile: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center' },
  voice: { width: 132, minHeight: 56, justifyContent: 'center' },
  toggle: { minHeight: TOUCH_TARGET, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  toggleText: { flex: 1, gap: 2 },
});
