// The stage: one luminous object and plain text. The voice ring with the interpreter's avatar
// inside it, the caption being spoken under it, and one control per person. Renders from the
// session store; the only local state is the runtime handle.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View, type TextStyle, type ViewStyle } from 'react-native';

import { DEFAULT_PARTICIPANTS } from '@/config/conversation';
import { languageName } from '@/config/languages';
import { DEFAULT_SETTINGS } from '@/config/policies';
import type { ConnectionStatus, Session, SessionErrorKind, Utterance } from '@/core/session';
import { createServices } from '@/services';
import { AgentAvatar, CaptionTransition, MessageSurface, ThinkingIndicator, VoiceVisualiser, type AgentAvatarState, type VoiceState } from '@/ui/slots';
import { duration, easing, motion, useTheme, type Theme } from '@/ui/tokens';

import { createLevels } from './levels';
import { createRuntime, type Runtime } from './runtime';
import { captions, stageOf, type Stage, type StagePhase } from './stage';

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

/** A CSS transition, for the web build; native ignores the keys it does not know. */
function transition(properties: string, ms: number = duration.base, curve: readonly number[] = easing.move): ViewStyle {
  return {
    transitionProperty: properties,
    transitionDuration: `${ms}ms`,
    transitionTimingFunction: `cubic-bezier(${curve.join(',')})`,
  } as ViewStyle;
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
  const { width, height } = useWindowDimensions();

  const stage = stageOf(session);
  const open = session.connection === 'open';
  const busy = session.connection === 'connecting' || session.connection === 'reconnecting';
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
          <Text style={styles.languages}>{session.participants.map((p) => languageName(p.language)).join('  ·  ')}</Text>
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
            <View style={[styles.core, transition('opacity, transform'), translating ? styles.away : styles.here]}>
              <AgentAvatar state={AVATAR_STATE[stage.phase]} talk={stage.phase === 'speaking' ? levels.out : 0} size={Math.round(ring * 0.34)} />
            </View>
            <View style={[styles.core, transition('opacity, transform'), translating ? styles.here : styles.away]}>
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
                  <Pressable
                    key={p.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Hold to talk, ${languageName(p.language)}`}
                    disabled={!enabled}
                    onPressIn={() => dispatch({ type: 'pressTalk', speakerId: p.id })}
                    onPressOut={() => dispatch({ type: 'releaseTalk', speakerId: p.id })}
                    style={({ pressed }) => [
                      styles.person,
                      transition('background-color, transform', duration.fast, easing.enter),
                      holding && styles.personHeld,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.personText, holding && styles.personTextHeld]}>{languageName(p.language)}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => dispatch({ type: open ? 'stop' : 'start' })}
            style={({ pressed }) => [
              open ? styles.quiet : styles.start,
              transition('background-color, transform', duration.fast, easing.enter),
              pressed && styles.pressed,
            ]}
          >
            <Text style={open ? styles.quietText : styles.startText}>{START_LABEL[session.connection]}</Text>
          </Pressable>
        </View>
      </View>
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
    column: { flex: 1, width: '100%', maxWidth: 720, paddingHorizontal: theme.space.xl, paddingVertical: theme.space.xl },
    top: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', minHeight: 44 },
    wordmark: { ...text, fontSize: 20, fontFamily: theme.type.familyMedium },
    languages: { ...text, fontSize: 15, color: theme.color.textMuted },
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
    pressed: { transform: [{ scale: motion.pressScale }] },
    start: { minHeight: 56, minWidth: 200, paddingHorizontal: theme.space.xxl, borderRadius: theme.radius.md, backgroundColor: theme.color.text, alignItems: 'center', justifyContent: 'center' },
    startText: { ...text, fontSize: 17, fontFamily: theme.type.familyMedium, color: theme.color.background },
    quiet: { minHeight: 44, paddingHorizontal: theme.space.xl, alignItems: 'center', justifyContent: 'center' },
    quietText: { ...text, fontSize: 15, color: theme.color.textMuted },
  });
}
