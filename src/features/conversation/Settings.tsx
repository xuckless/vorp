// Settings: who is talking and how turns end, how the interpreter behaves, and how Vorp looks.
// The look is chosen with the widgets themselves, so picking one is looking at it. The setup
// belongs to the session, so every change here is a `configure` event.

import { useSyncExternalStore, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BEHAVIOURS, TONES } from '@/config/behaviours';
import { NEXT_LANGUAGES, PEOPLE_COUNTS } from '@/config/conversation';
import { languageName } from '@/config/languages';
import { VOICES } from '@/config/voices';
import type { Participant, Session, SessionEvent, SessionSettings } from '@/core/session';
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

/** The participants for a people count: the first ones kept, new ones in a language nobody speaks yet. */
export function withCount(people: readonly Participant[], count: number): Participant[] {
  const next = people.slice(0, count);
  while (next.length < count) {
    const language = NEXT_LANGUAGES.find((code) => !next.some((p) => p.language === code)) ?? NEXT_LANGUAGES[0];
    next.push({ id: `p${next.length + 1}`, name: `${languageName(language)} speaker`, language, voice: next[0].voice });
  }
  return next;
}

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
  const { participants, settings } = session;
  const locked = session.connection !== 'idle' && session.connection !== 'failed';
  const configure = (people: Participant[], next: Partial<SessionSettings> = {}) => dispatch({ type: 'configure', participants: people, settings: { ...settings, ...next } });

  const { text, muted, title, picked } = useText();

  return (
    <Sheet open={open} title="Settings" onClose={onClose}>
      {locked ? <Text style={muted}>Stop the conversation to change who is talking and how the interpreter behaves</Text> : null}

      <Section name="People">
        <View style={styles.row}>
          {PEOPLE_COUNTS.map((count) => (
            <Option key={count} label={String(count)} on={participants.length === count} disabled={locked} onPress={() => configure(withCount(participants, count))} />
          ))}
        </View>
      </Section>

      <Section name="Turns">
        <Toggle
          label="Hands-free"
          help="Vorp hears when someone stops talking. Off: hold a button to talk"
          on={settings.detection === 'auto'}
          disabled={locked}
          onPress={() => configure(participants, { detection: settings.detection === 'auto' ? 'manual' : 'auto' })}
        />
        <Toggle
          label="Mute while speaking"
          help="For loud rooms: Vorp stops listening while it talks"
          on={settings.pauseMicWhileSpeaking}
          disabled={locked}
          onPress={() => configure(participants, { pauseMicWhileSpeaking: !settings.pauseMicWhileSpeaking })}
        />
      </Section>

      <Section name="Tone">
        <View style={styles.row}>
          {TONES.map((tone) => (
            <Option key={tone.id} label={tone.label} on={settings.tone === tone.id} disabled={locked} onPress={() => configure(participants, { tone: tone.id })} />
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
              onPress={() => configure(participants, { behaviours: on ? settings.behaviours.filter((id) => id !== b.id) : [...settings.behaviours, b.id] })}
            />
          );
        })}
      </Section>

      <Section name="Voice">
        <View style={styles.row}>
          {VOICES.map((v) => {
            const on = v.name === participants[0].voice;
            return (
              <Press
                key={v.name}
                disabled={locked}
                accessibilityLabel={`${v.name}, ${v.character}`}
                accessibilityState={{ selected: on }}
                onPress={() => configure(participants.map((p) => ({ ...p, voice: v.name })))}
                style={[styles.voice, { borderRadius: theme.radius.sm, paddingHorizontal: theme.space.md }, on && picked]}
              >
                <Text style={on ? title : text}>{v.name}</Text>
                <Text style={[muted, { fontSize: 13 }]}>{v.character}</Text>
              </Press>
            );
          })}
        </View>
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
