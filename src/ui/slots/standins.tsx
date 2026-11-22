// Plain, dependency-free implementation of every slot: React Native views and the built-in
// Animated API, styled from tokens. They keep the app usable when an effect is switched off or
// fails, and show what each contract needs.

import { useEffect, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';

import { useEffectsPaused } from '@/ui/effects/paused';
import { animatedEasing, motion, timing, useReducedMotion, useTheme } from '@/ui/tokens';

import type {
  AgentAvatarProps,
  CaptionTransitionProps,
  MessageSurfaceProps,
  ThinkingIndicatorProps,
  VoiceVisualiserProps,
} from './contracts';

const useNativeDriver = Platform.OS !== 'web';

/** A value that breathes between 0 and 1 while running, still at 1 otherwise. */
function useBreath(running: boolean, period = 1200): Animated.Value {
  const [value] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!running) {
      value.setValue(1);
      return;
    }
    const ease = animatedEasing(timing('base', 'move', false).easing);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 0, duration: period / 2, easing: ease, useNativeDriver }),
        Animated.timing(value, { toValue: 1, duration: period / 2, easing: ease, useNativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [running, period, value]);
  return value;
}

export function PlainThinkingIndicator({ size = 64, color, label = 'Translating' }: ThinkingIndicatorProps) {
  const theme = useTheme();
  const breath = useBreath(!useEffectsPaused());
  const dot = size / 6;
  return (
    <View style={[styles.center, { width: size, height: size, flexDirection: 'row', gap: dot / 2 }]} accessibilityRole="image" accessibilityLabel={label}>
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={{
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: color ?? theme.color.accent,
            // The middle dot breathes against its neighbours.
            opacity: breath.interpolate({ inputRange: [0, 1], outputRange: i === 1 ? [1, 0.35] : [0.35, 1] }),
          }}
        />
      ))}
    </View>
  );
}

export function PlainVoiceVisualiser({ state, level, size = 200, color, label = 'Voice level' }: VoiceVisualiserProps) {
  const theme = useTheme();
  const paused = useEffectsPaused();
  const [scale] = useState(() => new Animated.Value(0));
  const hears = state === 'listening' || state === 'speaking';
  // Follows the level directly, frame by frame (rule 14: no tween on a live signal).
  useEffect(() => {
    if (!hears || paused) {
      scale.setValue(0);
      return;
    }
    let raf = 0;
    const tick = () => {
      scale.setValue(Math.max(0, Math.min(1, typeof level === 'function' ? level() : (level ?? 0))));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hears, paused, level, scale]);
  const ring = color ?? theme.color.accent;
  return (
    <View style={[styles.center, { width: size, height: size }]} accessibilityRole="image" accessibilityLabel={label}>
      <Animated.View
        style={{
          position: 'absolute',
          width: size * 0.6,
          height: size * 0.6,
          borderRadius: size,
          backgroundColor: ring,
          opacity: state === 'processing' ? 0.25 : 0.18,
          transform: [{ scale: scale.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
        }}
      />
      <View style={{ width: size * 0.6, height: size * 0.6, borderRadius: size, borderWidth: 2, borderColor: ring, opacity: state === 'idle' ? 0.5 : 1 }} />
    </View>
  );
}

export function PlainAgentAvatar({ state = 'idle', size = 64, color, label = 'Interpreter' }: AgentAvatarProps) {
  const theme = useTheme();
  const paused = useEffectsPaused();
  const breath = useBreath(state === 'working' && !paused, 900);
  const eye = { width: size / 9, height: state === 'sleeping' ? size / 40 : size / 7, borderRadius: size / 18, backgroundColor: theme.color.onAccent };
  return (
    <Animated.View
      style={[
        styles.center,
        {
          width: size,
          height: size,
          borderRadius: size / 2.4,
          backgroundColor: color ?? theme.color.accent,
          flexDirection: 'row',
          gap: size / 7,
          opacity: state === 'sleeping' ? 0.55 : breath.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }),
        },
      ]}
      accessibilityRole="image"
      accessibilityLabel={label}>
      <View style={eye} />
      <View style={eye} />
    </Animated.View>
  );
}

export function PlainMessageSurface({ children, glowing, radius, padding, background, style }: MessageSurfaceProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          borderRadius: radius ?? theme.radius.md,
          padding: padding ?? theme.space.lg,
          backgroundColor: background ?? theme.color.surface,
          borderWidth: 2,
          borderColor: glowing ? theme.color.accent : 'transparent',
        },
        style,
      ]}>
      {children}
    </View>
  );
}

/** Both captions share the box and crossfade, so old and new overlap (rule 16). */
export function PlainCaptionTransition({ original, translation, revealed, color, background, fontSize, radius, padding, width }: CaptionTransitionProps) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [shown] = useState(() => new Animated.Value(revealed ? 1 : 0));
  useEffect(() => {
    const t = timing('base', revealed ? 'enter' : 'exit', reduced);
    const anim = Animated.timing(shown, { toValue: revealed ? 1 : 0, duration: t.duration, easing: animatedEasing(t.easing), useNativeDriver });
    anim.start();
    return () => anim.stop();
  }, [revealed, reduced, shown]);
  const size = fontSize ?? theme.type.body.fontSize;
  const text = { color: color ?? theme.color.text, fontSize: size, lineHeight: Math.round(size * (theme.type.body.lineHeight / theme.type.body.fontSize)) };
  const lift = (from: number, to: number) => ({ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [from, to] }) });
  const pad = padding ?? theme.space.lg;
  const longer = translation.length > original.length ? translation : original;
  return (
    <View style={{ width, borderRadius: radius ?? theme.radius.md, padding: pad, backgroundColor: background ?? theme.color.surface, overflow: 'hidden' }}>
      {/* The longer caption, invisible, sets the height; both faces are laid over it. */}
      <Text style={[text, { opacity: 0 }]} aria-hidden>
        {longer}
      </Text>
      <Animated.View style={[StyleSheet.absoluteFill, { padding: pad, opacity: shown.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [lift(0, -motion.shift)] }]}>
        <Text style={text}>{original}</Text>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { padding: pad, opacity: shown, transform: [lift(motion.shift, 0)] }]}>
        <Text style={text}>{translation}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
