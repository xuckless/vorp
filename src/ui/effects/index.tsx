// Slot implementations backed by the vendored engines. Each renders an Expo DOM component: inline
// on web, inside a web view on native. Only src/ui/slots imports this module.

import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import type {
  AgentAvatarProps,
  AgentAvatarState,
  CaptionTransitionProps,
  MessageSurfaceProps,
  ThinkingIndicatorProps,
  VoiceVisualiserProps,
} from '@/ui/slots/contracts';
import { useReducedMotion, useTheme } from '@/ui/tokens';

import AvatarDom from './dom/AvatarDom';
import BeamDom from './dom/BeamDom';
import OrbDom from './dom/OrbDom';
import RingDom from './dom/RingDom';
import WaveDom from './dom/WaveDom';
import { useLevelProp } from './level';
import { useEffectsPaused } from './paused';
import type { BotAvatarState, BotAvatarType } from './vendor/bot-avatars';
import type { OrbState } from './vendor/thinking-orbs';

/** The native web view's box. Ignored on web, where DOM components render inline. */
const box = (width: number, height: number) => ({ style: { width, height }, scrollEnabled: false });

/** A thinking indicator drawn by the thinking-orbs engine in one of its states. */
export function orbIndicator(state: OrbState) {
  return function OrbThinkingIndicator({ size = 64, color, label = 'Translating' }: ThinkingIndicatorProps) {
    const theme = useTheme();
    const paused = useEffectsPaused();
    return (
      <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel={label}>
        <OrbDom state={state} size={size} color={color} dark={theme.scheme === 'dark'} paused={paused} label={label} dom={box(size, size)} />
      </View>
    );
  };
}

export function VoiceRingVisualiser({ state, level, direction = 0, size = 200, color, label = 'Voice level' }: VoiceVisualiserProps) {
  const theme = useTheme();
  const paused = useEffectsPaused();
  const sampled = useLevelProp(level, !paused);
  return (
    <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel={label}>
      <RingDom
        state={state}
        level={sampled}
        direction={direction}
        size={size}
        color={color}
        dark={theme.scheme === 'dark'}
        paused={paused}
        label={label}
        dom={box(size, size)}
      />
    </View>
  );
}

const AVATAR_STATE: Record<AgentAvatarState, BotAvatarState> = { idle: 'default', working: 'working', sleeping: 'sleeping' };

/** An agent avatar drawn by the bot-avatars engine as one of its characters. */
export function botAvatar(type: BotAvatarType) {
  return function BotAgentAvatar({ state = 'idle', talk, size = 64, color, label = 'Interpreter' }: AgentAvatarProps) {
    const theme = useTheme();
    const paused = useEffectsPaused();
    const said = useLevelProp(talk, !paused);
    // The avatar draws past its box (overscan for jumps), so the web view gets room around it.
    return (
      <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel={label}>
        <AvatarDom
          type={type}
          state={AVATAR_STATE[state]}
          talk={said}
          size={size}
          color={color}
          dark={theme.scheme === 'dark'}
          paused={paused}
          label={label}
          dom={box(size, size)}
        />
      </View>
    );
  };
}

/** The card stays native; the beam is a DOM layer laid over it that takes no touches. */
export function BeamMessageSurface({ children, glowing, radius, padding, background, style }: MessageSurfaceProps) {
  const theme = useTheme();
  const r = radius ?? theme.radius.md;
  const paused = useEffectsPaused();
  return (
    <View style={[{ borderRadius: r, padding: padding ?? theme.space.lg, backgroundColor: background ?? theme.color.surface }, style]}>
      {children}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <BeamDom active={glowing && !paused} radius={r} dark={theme.scheme === 'dark'} dom={{ style: { flex: 1 }, scrollEnabled: false }} />
      </View>
    </View>
  );
}

export function WaveCaptionTransition({ original, translation, revealed, color, background, fontSize, radius, padding, width }: CaptionTransitionProps) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  // The native web view needs a width to lay the caption out; matchContents then sizes its height.
  const [measured, setMeasured] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setMeasured(Math.round(e.nativeEvent.layout.width));
  const w = width ?? measured;
  const size = fontSize ?? theme.type.body.fontSize;
  return (
    <View style={width ? { width } : { alignSelf: 'stretch' }} onLayout={width ? undefined : onLayout}>
      <WaveDom
        original={original}
        translation={translation}
        revealed={revealed}
        color={color ?? theme.color.text}
        background={background ?? theme.color.surface}
        accent={theme.color.accent}
        fontFamily={theme.type.family}
        fontSize={size}
        lineHeight={Math.round(size * (theme.type.body.lineHeight / theme.type.body.fontSize))}
        radius={radius ?? theme.radius.md}
        padding={padding ?? theme.space.lg}
        width={w}
        reduced={reduced}
        dom={{ matchContents: true, style: w ? { width: w } : undefined, scrollEnabled: false }}
      />
    </View>
  );
}
