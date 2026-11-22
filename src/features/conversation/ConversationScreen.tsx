// The stage: one luminous object and plain text. The voice ring with the interpreter's avatar
// inside it, the caption being spoken under it, and one control per person. Renders from the
// session store; the only local state is the runtime handle.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, useWindowDimensions, View, type TextStyle } from 'react-native';

import { DEFAULT_PARTICIPANTS } from '@/config/conversation';
import { languageName } from '@/config/languages';
import { DEFAULT_SETTINGS } from '@/config/policies';
import type { ConnectionStatus, ParticipantId, Session, SessionErrorKind, Utterance } from '@/core/session';
import { createServices } from '@/services';
import { AgentAvatar, CaptionTransition, MessageSurface, ThinkingIndicator, VoiceVisualiser, type AgentAvatarState, type VoiceState } from '@/ui/slots';
import { Press, transition } from '@/ui/primitives';
import { motion, timing, TOUCH_TARGET, useReducedMotion, useTheme, type Theme } from '@/ui/tokens';

import { COLUMN_WIDTH, LanguagePicker } from './LanguagePicker';
import { createLevels } from './levels';
import { createRuntime, type Runtime } from './runtime';
import { Settings } from './Settings';
import { captions, stageOf, type Stage, type StagePhase } from './stage';
import { Transcript } from './Transcript';

const START_LABEL: Record<ConnectionStatus, string> = {
  idle: 'Start',
  connecting: 'Connecting',
  open: 'Stop',
  reconnecting: 'Reconnecting',
  failed: 'Try again',
};

const ERROR_LABEL: Record<SessionErrorKind, string> = {
  micDenied: 'Vorp needs the microphone',
  mic: 'The microphone stopped working',
  token: 'Vorp could not start a session',
  socket: 'The connection dropped',
  timeLimit: 'The session reached its time limit',
};

const RING_STATE: Record<StagePhase, VoiceState> = {
  off: 'idle',
  connecting: 'processing',
  listening: 'listening',
  hearing: 'listening',
  translating: 'processing',
  speaking: 'speaking',
};

const AVATAR_STATE: Record<StagePhase, AgentAvatarState> = {
  off: 'sleeping',
  connecting: 'sleeping',
  listening: 'idle',
  hearing: 'idle',
  translating: 'working',
  speaking: 'idle',
};

function statusText(stage: Stage): string {
  switch (stage.phase) {
    case 'off':
      return 'Start, then just talk';
    case 'connecting':
      return 'Connecting';
    case 'listening':
      return 'Listening';
    case 'hearing':
      return stage.language ? `Hearing ${languageName(stage.language)}` : 'Hearing';
    case 'translating':
      return 'Translating';
    case 'speaking':
      return stage.language ? `Speaking ${languageName(stage.language)}` : 'Speaking';
  }
}

function useSession(runtime: Runtime): Session {
  return useSyncExternalStore(runtime.store.subscribe, runtime.store.get, runtime.store.get);
}

export function ConversationScreen() {
  const [{ runtime, levels }] = useState(() => {
    const services = createServices();
    return { runtime: createRuntime(services, DEFAULT_PARTICIPANTS, DEFAULT_SETTINGS), levels: createLevels(services) };
  });
  useEffect(
    () => () => {
      levels.dispose();
      runtime.dispose();
    },
    [runtime, levels],
  );
  const session = useSession(runtime);
  const { dispatch } = runtime;
  const theme = useTheme();
  const styles = stylesFor(theme);
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  // Which overlay is open: visual-only, so it lives here.
  const [editing, setEditing] = useState<ParticipantId | null>(null);
  const [reading, setReading] = useState(false);
  const [setting, setSetting] = useState(false);

  const stage = stageOf(session);
  const open = session.connection === 'open';
  const busy = session.connection === 'connecting' || session.connection === 'reconnecting';
  const settable = session.connection === 'idle' || session.connection === 'failed';
  const swap = transition('opacity, transform', timing('base', 'move', reduced));
  const translating = stage.phase === 'translating';
  const ring = Math.round(Math.max(200, Math.min(340, width - 96, height * 0.36)));
  const shown = captions(session).slice(-2);
  const latest = shown[shown.length - 1];
  const earlier = shown.length > 1 ? shown[0] : undefined;

  return (
    <View style={styles.screen}>
      <View style={styles.column}>
        <View style={styles.top}>
          <Text style={styles.wordmark}>Vorp</Text>
          <View style={styles.links}>
            {session.participants.map((p) => (
              <Press
                key={p.id}
                disabled={!settable}
                accessibilityLabel={`${languageName(p.language)}, change language`}
                onPress={() => setEditing(p.id)}
                style={styles.link}
              >
                <Text style={styles.linkText}>{languageName(p.language)}</Text>
              </Press>
            ))}
            {shown.length > 0 ? (
              <Press onPress={() => setReading(true)} style={styles.link}>
                <Text style={styles.linkText}>Transcript</Text>
              </Press>
            ) : null}
            <Press onPress={() => setSetting(true)} style={styles.link}>
              <Text style={styles.linkText}>Settings</Text>
            </Press>
          </View>
        </View>

        <View style={styles.centre}>
          <View style={{ width: ring, height: ring, alignItems: 'center', justifyContent: 'center' }}>
            <View style={StyleSheet.absoluteFill}>
              <VoiceVisualiser
                state={RING_STATE[stage.phase]}
                level={stage.phase === 'speaking' ? levels.out : levels.mic}
                direction={stage.direction}
                size={ring}
                label={statusText(stage)}
              />
            </View>
            {/* Overlap: the avatar is still leaving while the orb arrives, and back. */}
            <View style={[styles.core, swap, translating ? styles.away : styles.here]}>
              <AgentAvatar state={AVATAR_STATE[stage.phase]} talk={stage.phase === 'speaking' ? levels.out : 0} size={Math.round(ring * 0.34)} />
            </View>
            <View style={[styles.core, swap, translating ? styles.here : styles.away]}>
              <ThinkingIndicator size={Math.round(ring * 0.26)} />
            </View>
          </View>
          <Text style={styles.status} accessibilityLiveRegion="polite">
            {statusText(stage)}
          </Text>
        </View>

        <View style={styles.captions}>
          {session.error ? (
            <Text style={styles.error}>{ERROR_LABEL[session.error.kind]}</Text>
          ) : (
            <>
              {earlier ? <Earlier key={earlier.id} utterance={earlier} styles={styles} /> : null}
              {latest ? (
                <MessageSurface key={latest.id} glowing={latest.status === 'speaking'} padding={0} radius={theme.radius.lg}>
                  <CaptionTransition
                    original={latest.source}
                    translation={latest.translation || latest.source}
                    revealed={latest.translation !== ''}
                    fontSize={width > 700 ? 28 : 22}
                    radius={theme.radius.lg}
                    padding={width > 700 ? 28 : 20}
                  />
                </MessageSurface>
              ) : null}
            </>
          )}
        </View>

        <View style={styles.controls}>
          {open ? (
            <View style={styles.people}>
              {session.participants.map((p) => {
                const holding = session.held === p.id;
                const enabled = session.held === undefined || holding;
                return (
                  <Press
                    key={p.id}
                    accessibilityLabel={`Hold to talk, ${languageName(p.language)}`}
                    disabled={!enabled}
                    onPressIn={() => dispatch({ type: 'pressTalk', speakerId: p.id })}
                    onPressOut={() => dispatch({ type: 'releaseTalk', speakerId: p.id })}
                    style={[styles.person, holding && styles.personHeld]}
                  >
                    <Text style={[styles.personText, holding && styles.personTextHeld]}>{languageName(p.language)}</Text>
                  </Press>
                );
              })}
            </View>
          ) : null}
          <Press disabled={busy} onPress={() => dispatch({ type: open ? 'stop' : 'start' })} style={open ? styles.quiet : styles.start}>
            <Text style={open ? styles.quietText : styles.startText}>{START_LABEL[session.connection]}</Text>
          </Press>
        </View>
      </View>
      <LanguagePicker
        open={editing !== null}
        selected={session.participants.find((p) => p.id === editing)?.language}
        onClose={() => setEditing(null)}
        onPick={(code) => {
          const person = session.participants.find((p) => p.id === editing);
          if (person) dispatch({ type: 'setParticipant', participant: { ...person, language: code, name: `${languageName(code)} speaker` } });
          setEditing(null);
        }}
      />
      <Settings
        open={setting}
        voice={session.participants[0].voice}
        voiceLocked={!settable}
        onVoice={(voice) => session.participants.forEach((p) => dispatch({ type: 'setParticipant', participant: { ...p, voice } }))}
        onClose={() => setSetting(false)}
      />
      <Transcript open={reading} session={session} onClose={() => setReading(false)} />
    </View>
  );
}

function Earlier({ utterance, styles }: { utterance: Utterance; styles: ReturnType<typeof stylesFor> }) {
  return (
    <View style={styles.earlier}>
      <Text style={styles.earlierText} numberOfLines={2}>
        {utterance.translation || utterance.source}
      </Text>
    </View>
  );
}

function stylesFor(theme: Theme) {
  const text: TextStyle = { fontFamily: theme.type.family, color: theme.color.text };
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.background, alignItems: 'center' },
    column: { flex: 1, width: '100%', maxWidth: COLUMN_WIDTH, paddingHorizontal: theme.space.xl, paddingVertical: theme.space.xl },
    top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: TOUCH_TARGET },
    wordmark: { ...text, fontSize: 20, fontFamily: theme.type.familyMedium },
    links: { flexDirection: 'row', gap: theme.space.xl },
    link: { minHeight: TOUCH_TARGET, justifyContent: 'center' },
    linkText: { ...text, fontSize: 15, color: theme.color.textMuted },
    centre: { flex: 1.25, alignItems: 'center', justifyContent: 'center', gap: theme.space.xl },
    core: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    here: { opacity: 1, transform: [{ scale: 1 }] },
    away: { opacity: 0, transform: [{ scale: motion.popoverFromScale }] },
    status: { ...text, fontSize: 16, color: theme.color.textMuted },
    captions: { flex: 1, justifyContent: 'flex-end', gap: theme.space.md, paddingBottom: theme.space.xl },
    earlier: { paddingHorizontal: theme.space.xl },
    earlierText: { ...text, fontSize: 16, lineHeight: 23, color: theme.color.textMuted },
    error: { ...text, fontSize: 16, lineHeight: 23, color: theme.color.danger, textAlign: 'center' },
    controls: { alignItems: 'center', gap: theme.space.md },
    people: { flexDirection: 'row', gap: theme.space.md, alignSelf: 'stretch' },
    person: { flex: 1, minHeight: 56, borderRadius: theme.radius.md, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center' },
    personHeld: { backgroundColor: theme.color.text },
    personText: { ...text, fontSize: 17, fontFamily: theme.type.familyMedium },
    personTextHeld: { color: theme.color.background },
    start: { minHeight: 56, minWidth: 200, paddingHorizontal: theme.space.xxl, borderRadius: theme.radius.md, backgroundColor: theme.color.text, alignItems: 'center', justifyContent: 'center' },
    startText: { ...text, fontSize: 17, fontFamily: theme.type.familyMedium, color: theme.color.background },
    quiet: { minHeight: TOUCH_TARGET, paddingHorizontal: theme.space.xl, alignItems: 'center', justifyContent: 'center' },
    quietText: { ...text, fontSize: 15, color: theme.color.textMuted },
  });
}
