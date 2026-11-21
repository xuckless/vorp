// Bare conversation screen: connect, hands-free by default with a hold-to-talk button per
// person, the mode and the playback queue as plain text, plain-text captions. Renders from the
// session store; the only local state is the runtime handle. Styling is phase 3.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DEFAULT_PARTICIPANTS } from '@/config/conversation';
import { languageName } from '@/config/languages';
import { DEFAULT_SETTINGS } from '@/config/policies';
import {
  capturingUtterance,
  micOpen,
  playbackQueue,
  targetLanguages,
  type ConnectionStatus,
  type Session,
  type SessionErrorKind,
} from '@/core/session';
import { createServices } from '@/services';

import { createRuntime, type Runtime } from './runtime';

const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
  idle: 'Start',
  connecting: 'Connecting…',
  open: 'Stop',
  reconnecting: 'Reconnecting…',
  failed: 'Retry',
};

const ERROR_LABEL: Record<SessionErrorKind, string> = {
  micDenied: 'Microphone access was denied',
  mic: 'Microphone failed',
  token: 'Could not get a session token',
  socket: 'Connection dropped',
  timeLimit: 'Session time limit reached',
};

function modeText(s: Session): string {
  const held = s.participants.find((p) => p.id === s.held);
  if (held) return `Mode: held button (${held.name})`;
  const mode = s.settings.detection === 'auto' ? 'hands-free' : 'push-to-talk only';
  return `Mode: ${mode} · microphone ${micOpen(s) ? 'listening' : 'off'} · overlap: ${s.settings.overlap.id}`;
}

function queueText(s: Session): string {
  const queue = playbackQueue(s);
  if (queue.length === 0) return 'Queue: empty';
  return `Queue: ${queue.map((u) => `${u.id} ${u.status}`).join(' → ')}`;
}

function useSession(runtime: Runtime): Session {
  return useSyncExternalStore(runtime.store.subscribe, runtime.store.get, runtime.store.get);
}

export function ConversationScreen() {
  const [runtime] = useState(() => createRuntime(createServices(), DEFAULT_PARTICIPANTS, DEFAULT_SETTINGS));
  useEffect(() => () => runtime.dispose(), [runtime]);
  const session = useSession(runtime);
  const { dispatch } = runtime;
  const capturing = capturingUtterance(session);
  const open = session.connection === 'open';
  const { held } = session;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Vorp</Text>
        <Pressable
          accessibilityRole="button"
          style={styles.button}
          onPress={() => dispatch({ type: open ? 'stop' : 'start' })}
        >
          <Text style={styles.buttonText}>{CONNECTION_LABEL[session.connection]}</Text>
        </Pressable>
      </View>
      {session.error ? (
        <Text style={styles.error}>
          {ERROR_LABEL[session.error.kind]}: {session.error.message}
        </Text>
      ) : null}
      <Text style={styles.meta}>{modeText(session)}</Text>
      <Text style={styles.meta}>{queueText(session)}</Text>

      <ScrollView style={styles.captions} contentContainerStyle={styles.captionsContent}>
        {session.utterances.map((u) => {
          const speaker = session.participants.find((p) => p.id === u.speakerId);
          const targets = targetLanguages(session, u).map(languageName).join(', ');
          return (
            <View key={u.id} style={styles.caption}>
              <Text style={styles.meta}>
                {u.id} · {speaker?.name ?? 'unknown speaker'} ({u.routedBy}
                {u.language ? `, heard ${u.language}` : ''}){targets ? ` → ${targets}` : ''} · {u.status}
                {u.error ? ` (${u.error})` : ''}
              </Text>
              <Text style={styles.source}>{u.source || '…'}</Text>
              <Text style={styles.translation}>{u.translation}</Text>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.talkRow}>
        {session.participants.map((p) => {
          const holding = held === p.id;
          const enabled = open && (held === undefined || holding);
          const listening = holding || (capturing !== undefined && capturing.speakerId === p.id);
          return (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityLabel={`Hold to talk, ${languageName(p.language)}`}
              disabled={!enabled}
              onPressIn={() => dispatch({ type: 'pressTalk', speakerId: p.id })}
              onPressOut={() => dispatch({ type: 'releaseTalk', speakerId: p.id })}
              style={[styles.talk, holding && styles.talkHeld, !enabled && styles.talkDisabled]}
            >
              <Text style={styles.talkText}>{listening ? 'Listening…' : 'Hold to talk'}</Text>
              <Text style={styles.talkLanguage}>{languageName(p.language)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0d0f11', padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#e9c46a', fontSize: 24, fontWeight: '600' },
  button: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#2a2f35' },
  buttonText: { color: '#ffffff', fontSize: 16 },
  error: { color: '#ff8a80' },
  captions: { flex: 1 },
  captionsContent: { gap: 12 },
  caption: { gap: 4, padding: 12, borderRadius: 8, backgroundColor: '#1a1e22' },
  meta: { color: '#9aa4ad', fontSize: 12 },
  source: { color: '#ffffff', fontSize: 16 },
  translation: { color: '#e9c46a', fontSize: 18 },
  talkRow: { flexDirection: 'row', gap: 12 },
  talk: { flex: 1, minHeight: 96, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#2a2f35' },
  talkHeld: { backgroundColor: '#8a6d1f' },
  talkDisabled: { opacity: 0.4 },
  talkText: { color: '#ffffff', fontSize: 18 },
  talkLanguage: { color: '#9aa4ad', fontSize: 14 },
});
