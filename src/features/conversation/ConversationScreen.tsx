// UNREFERENCED since phase 3 (kept as a stub, owner decision 22 November 2026): the React Native
// stage, replaced by the design's DOM screens in src/features/app. Not rendered anywhere.
//
// The stage: one luminous object and plain text. The voice ring with the interpreter's avatar
// inside it, the caption being spoken under it, and one control per person (you and them). Renders from the
// session store; local state is only the runtime handle and which overlay is open.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Image, StyleSheet, Text, useWindowDimensions, View, type TextStyle } from 'react-native';

import { languageName } from '@/config/languages';
import { theirLanguage, type ConnectionStatus, type Role, type Session, type SessionErrorKind } from '@/core/session';
import { toConversation } from '@/features/history/history';
import { keepSaved } from '@/features/settings/saved';
import { Press, transition } from '@/ui/primitives';
import { AgentAvatar, CaptionTransition, MessageSurface, ThinkingIndicator, VoiceVisualiser, type AgentAvatarState, type VoiceState } from '@/ui/slots';
import { motion, timing, TOUCH_TARGET, useReducedMotion, useTheme, type Theme } from '@/ui/tokens';

import { HistoryList } from './HistoryList';
import { LanguagePicker } from './LanguagePicker';
import { createController } from './controller';
import type { Runtime } from './runtime';
import { Settings } from './Settings';
import { COLUMN_WIDTH } from './Sheet';
import { captions, spotlight, stageOf, type Stage, type StagePhase } from './stage';
import { Transcript } from './Transcript';
import type { Boot, Mode } from './Vorp';

const MARK = require('../../../assets/brand/mark.png');

/** The owner first, on the left. */
const ROLES: readonly Role[] = ['owner', 'other'];
const ROLE_LABEL: Record<Role, string> = { owner: 'You', other: 'Them' };

const START_LABEL: Record<Mode, Record<ConnectionStatus, string>> = {
  live: { idle: 'Start', connecting: 'Connecting', open: 'Stop', reconnecting: 'Reconnecting', failed: 'Try again' },
  demo: { idle: 'Play the demo', connecting: 'Starting', open: 'Stop', reconnecting: 'Starting', failed: 'Try again' },
};

/** What went wrong, and what to do about it. */
const ERROR_LABEL: Record<SessionErrorKind, string> = {
  micDenied: 'Vorp needs the microphone. Allow it in the address bar, then try again',
  mic: 'The microphone stopped working. Check that it is plugged in and try again',
  token: 'Vorp could not start a session. Check the connection and try again',
  socket: 'The connection dropped. Try again',
  timeLimit: 'The session reached its time limit. Start a new one',
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

function statusText(stage: Stage, session: Session, mode: Mode): string {
  switch (stage.phase) {
    case 'off':
      if (mode === 'demo') return 'A recorded conversation, to show how Vorp works';
      return session.settings.detection === 'auto' ? 'Start, then just talk' : 'Start, then hold a button to talk';
    case 'connecting':
      return session.connection === 'reconnecting' ? 'Reconnecting' : 'Connecting';
    case 'listening':
      return session.settings.detection === 'auto' ? 'Listening' : 'Hold a button to talk';
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

/** The conversation being read: the live one, or one from history by id. */
type Reading = { from: 'live' } | { from: 'history'; id: string } | null;

export function ConversationScreen({ mode, autostart, boot, onMode }: { mode: Mode; autostart: boolean; boot: Boot; onMode: (mode: Mode) => void }) {
  // Which overlay is open: visual-only, so it lives here.
  const [editing, setEditing] = useState<Role | null>(null);
  const [reading, setReading] = useState<Reading>(null);
  const [browsing, setBrowsing] = useState(false);
  const [setting, setSetting] = useState(false);
  const [{ runtime, levels, history }] = useState(() => createController(mode, boot, (id) => setReading({ from: 'history', id })));
  const { dispatch } = runtime;

  useEffect(() => {
    const forget = mode === 'live' ? keepSaved(boot.storage, runtime.store) : () => {};
    if (autostart) dispatch({ type: 'start' });
    return () => {
      forget();
      levels.dispose();
      runtime.dispose();
    };
  }, [mode, autostart, boot.storage, runtime, levels, dispatch]);

  const session = useSession(runtime);
  const past = useSyncExternalStore(history.store.subscribe, history.store.get, history.store.get);
  const theme = useTheme();
  const styles = stylesFor(theme);
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();

  const stage = stageOf(session);
  const open = session.connection === 'open';
  const busy = session.connection === 'connecting' || session.connection === 'reconnecting';
  const settable = mode === 'live' && (session.connection === 'idle' || session.connection === 'failed');
  const translating = stage.phase === 'translating';
  const wide = width > 700;
  const ring = Math.round(Math.max(180, Math.min(340, width - 96, height * 0.34)));
  const swap = transition('opacity, transform', timing('base', 'move', reduced));
  const { card, earlier, waiting } = spotlight(session);
  const heard = captions(session);

  const read =
    reading === null
      ? null
      : reading.from === 'live'
        ? toConversation('live', 0, { owner: session.people.owner.language, other: theirLanguage(session) }, heard)
        : (past.find((c) => c.id === reading.id) ?? null);

  return (
    <View style={styles.screen}>
      <View style={styles.column}>
        <View style={styles.top}>
          <View style={styles.brand}>
            <Image source={MARK} style={styles.mark} accessibilityIgnoresInvertColors alt="" />
            <Text accessibilityRole="header" style={styles.wordmark}>
              Vorp
            </Text>
          </View>
          <View style={styles.links}>
            {ROLES.map((role) => {
              const label = `${ROLE_LABEL[role]}: ${languageName(role === 'owner' ? session.people.owner.language : theirLanguage(session))}`;
              return (
                <Press key={role} disabled={!settable} accessibilityLabel={`${label}, change language`} onPress={() => setEditing(role)} style={styles.link}>
                  <Text style={styles.linkText}>{label}</Text>
                </Press>
              );
            })}
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
                label={statusText(stage, session, mode)}
              />
            </View>
            {/* Overlap: the avatar is still leaving while the orb arrives, and back. */}
            <View style={[styles.core, swap, translating ? styles.away : styles.here]}>
              <AgentAvatar state={AVATAR_STATE[stage.phase]} talk={stage.phase === 'speaking' ? levels.out : 0} size={Math.round(ring * 0.4)} />
            </View>
            <View style={[styles.core, swap, translating ? styles.here : styles.away]}>
              <ThinkingIndicator size={Math.round(ring * 0.26)} />
            </View>
          </View>
          <Text style={styles.status} accessibilityLiveRegion="polite">
            {statusText(stage, session, mode)}
          </Text>
        </View>

        <View style={styles.captions}>
          {session.error ? (
            <Text style={styles.error}>{ERROR_LABEL[session.error.kind]}</Text>
          ) : (
            <>
              {earlier && waiting.length === 0 ? (
                <Text key={earlier.id} style={styles.aside} numberOfLines={2}>
                  {earlier.translation || earlier.source}
                </Text>
              ) : null}
              {card ? (
                <MessageSurface key={card.id} glowing={card.status === 'speaking'} padding={0} radius={theme.radius.lg}>
                  <CaptionTransition
                    original={card.source}
                    translation={card.translation || card.source}
                    revealed={card.translation !== ''}
                    fontSize={wide ? 28 : 21}
                    radius={theme.radius.lg}
                    padding={wide ? 28 : 20}
                  />
                </MessageSurface>
              ) : null}
              {card?.note ? <Text style={styles.aside}>{card.note}</Text> : null}
              {waiting.map((u) => (
                <Text key={u.id} style={styles.aside} numberOfLines={1}>
                  Next: {u.source}
                </Text>
              ))}
            </>
          )}
        </View>

        <View style={styles.controls}>
          {open ? (
            <View style={styles.people}>
              {ROLES.map((role) => {
                const holding = session.held === role;
                const enabled = session.held === undefined || holding;
                return (
                  <Press
                    key={role}
                    accessibilityLabel={`Hold to talk, ${ROLE_LABEL[role]}`}
                    disabled={!enabled || mode === 'demo'}
                    onPressIn={() => dispatch({ type: 'pressTalk', speaker: role })}
                    onPressOut={() => dispatch({ type: 'releaseTalk', speaker: role })}
                    style={[styles.person, holding && styles.personHeld]}
                  >
                    <Text style={[styles.personText, holding && styles.personTextHeld]}>{ROLE_LABEL[role]}</Text>
                  </Press>
                );
              })}
            </View>
          ) : null}
          <Press disabled={busy} onPress={() => dispatch({ type: open ? 'stop' : 'start' })} style={open ? styles.quiet : styles.start}>
            <Text style={open ? styles.linkText : styles.startText}>{START_LABEL[mode][session.connection]}</Text>
          </Press>
          <View style={styles.links}>
            {heard.length > 0 ? (
              <Press onPress={() => setReading({ from: 'live' })} style={styles.link}>
                <Text style={styles.linkText}>Transcript</Text>
              </Press>
            ) : null}
            {past.length > 0 && mode === 'live' ? (
              <Press onPress={() => setBrowsing(true)} style={styles.link}>
                <Text style={styles.linkText}>History</Text>
              </Press>
            ) : null}
            {mode === 'live' ? (
              <Press onPress={() => setSetting(true)} style={styles.link}>
                <Text style={styles.linkText}>Settings</Text>
              </Press>
            ) : null}
            {open && mode === 'live' ? null : (
              <Press onPress={() => onMode(mode === 'demo' ? 'live' : 'demo')} style={styles.link}>
                <Text style={styles.linkText}>{mode === 'demo' ? 'Leave the demo' : 'Demo'}</Text>
              </Press>
            )}
          </View>
        </View>
      </View>

      <LanguagePicker
        open={editing !== null}
        selected={editing === null ? undefined : session.people[editing].language}
        onClose={() => setEditing(null)}
        onPick={(code) => {
          if (editing === null) return;
          const people = { ...session.people, [editing]: { ...session.people[editing], language: code } };
          dispatch({ type: 'configure', people, settings: session.settings });
          setEditing(null);
        }}
      />
      <Settings open={setting} session={session} dispatch={dispatch} onClose={() => setSetting(false)} />
      <HistoryList
        open={browsing}
        conversations={past}
        onClose={() => setBrowsing(false)}
        onOpen={(id) => {
          setBrowsing(false);
          setReading({ from: 'history', id });
        }}
      />
      <Transcript
        conversation={read}
        onClose={() => setReading(null)}
        onDelete={
          reading?.from === 'history' && mode === 'live'
            ? () => {
                history.remove(reading.id);
                setReading(null);
              }
            : undefined
        }
      />
    </View>
  );
}

function stylesFor(theme: Theme) {
  const text: TextStyle = { fontFamily: theme.type.family, color: theme.color.text };
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.background, alignItems: 'center' },
    column: { flex: 1, width: '100%', maxWidth: COLUMN_WIDTH, paddingHorizontal: theme.space.xl, paddingTop: theme.space.lg, paddingBottom: theme.space.md },
    top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: TOUCH_TARGET },
    brand: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
    mark: { width: 24, height: 24 },
    wordmark: { ...text, fontSize: 20, fontFamily: theme.type.familyMedium },
    links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: theme.space.xl },
    link: { minHeight: TOUCH_TARGET, justifyContent: 'center' },
    linkText: { ...text, fontSize: 15, color: theme.color.textMuted },
    centre: { flex: 1.2, alignItems: 'center', justifyContent: 'center', gap: theme.space.lg },
    core: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    here: { opacity: 1, transform: [{ scale: 1 }] },
    away: { opacity: 0, transform: [{ scale: motion.popoverFromScale }] },
    status: { ...text, fontSize: 16, color: theme.color.textMuted, textAlign: 'center' },
    captions: { flex: 1, justifyContent: 'flex-end', gap: theme.space.md, paddingBottom: theme.space.xl },
    aside: { ...text, fontSize: 16, lineHeight: 23, color: theme.color.textMuted, paddingHorizontal: theme.space.xl },
    error: { ...text, fontSize: 16, lineHeight: 23, color: theme.color.danger, textAlign: 'center' },
    controls: { alignItems: 'center', gap: theme.space.sm },
    people: { flexDirection: 'row', gap: theme.space.md, alignSelf: 'stretch' },
    person: { flex: 1, minHeight: 56, borderRadius: theme.radius.md, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center' },
    personHeld: { backgroundColor: theme.color.text },
    personText: { ...text, fontSize: 17, fontFamily: theme.type.familyMedium },
    personTextHeld: { color: theme.color.background },
    start: { minHeight: 56, minWidth: 200, paddingHorizontal: theme.space.xxl, borderRadius: theme.radius.md, backgroundColor: theme.color.text, alignItems: 'center', justifyContent: 'center' },
    startText: { ...text, fontSize: 17, fontFamily: theme.type.familyMedium, color: theme.color.background },
    quiet: { minHeight: TOUCH_TARGET, paddingHorizontal: theme.space.xl, alignItems: 'center', justifyContent: 'center' },
  });
}
