// The typed contract of each visual slot. Every implementation of a slot takes exactly these
// props; anything left out defaults to a design token. Props are plain data (strings, numbers,
// booleans) except where noted, so an implementation can hand them to an Expo DOM component on
// native.

import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

/** 0..1. A number, or a getter the implementation samples every frame (cheaper on web). */
export type Level = number | (() => number);

export type VoiceState = 'idle' | 'listening' | 'speaking' | 'processing';

/** Shown while a translation is being produced. */
export type ThinkingIndicatorProps = {
  /** Square size in points. @default 64 */
  size?: number;
  /** @default theme accent */
  color?: string;
  /** Screen-reader label. @default 'Translating' */
  label?: string;
};

/** The ring on the centre stage: follows the microphone while listening, the output while speaking. */
export type VoiceVisualiserProps = {
  state: VoiceState;
  /** Microphone level while listening, output level while speaking. @default 0 */
  level?: Level;
  /** Where the active speaker is, -1 left … 1 right. @default 0 */
  direction?: number;
  /** @default 200 */
  size?: number;
  /** @default theme accent */
  color?: string;
  label?: string;
};

export type AgentAvatarState = 'idle' | 'working' | 'sleeping';

/** The interpreter's face. */
export type AgentAvatarProps = {
  /** @default 'idle' */
  state?: AgentAvatarState;
  /** The interpreter's voice level; it opens the avatar's mouth. @default 0 */
  talk?: Level;
  /** @default 64 */
  size?: number;
  /** @default theme accent */
  color?: string;
  label?: string;
};

/** The surface a caption card sits on; `glowing` marks the card being spoken. */
export type MessageSurfaceProps = {
  /** The card's content. A React node, so this slot is the one non-data contract. */
  children?: ReactNode;
  glowing: boolean;
  /** @default theme radius.md */
  radius?: number;
  /** @default theme space.lg */
  padding?: number;
  /** @default theme surface */
  background?: string;
  style?: StyleProp<ViewStyle>;
};

/** Carries the original caption into its translation. */
export type CaptionTransitionProps = {
  original: string;
  translation: string;
  /** false shows the original, true the translation. Changing it runs the transition. */
  revealed: boolean;
  /** @default theme text */
  color?: string;
  /** @default theme surface */
  background?: string;
  /** @default theme type.body.fontSize */
  fontSize?: number;
  /** @default theme radius.md */
  radius?: number;
  /** @default theme space.lg */
  padding?: number;
  /** Width in points. @default fills the parent */
  width?: number;
};

export type SlotProps = {
  thinkingIndicator: ThinkingIndicatorProps;
  voiceVisualiser: VoiceVisualiserProps;
  agentAvatar: AgentAvatarProps;
  messageSurface: MessageSurfaceProps;
  captionTransition: CaptionTransitionProps;
};

export type SlotName = keyof SlotProps;
