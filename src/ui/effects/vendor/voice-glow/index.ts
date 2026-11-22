// Vendored from Libraries.dev (https://github.com/Jakubantalik/Libraries.dev, packages/voice-glow, MIT,
// (c) 2026 Jakub Antalik, see ../LICENSE), via xuckless/the-wallpaper-project
// src/ultra-reactivate/vendor/voice-glow at 598f814 (19 Nov 2026). Changes: Preact imports point back
// at React 19, and useMicrophone is removed: Vorp drives the glow from its own audio levels and the vendored code never opens the microphone.
// Only src/ui imports this folder.

import { VOICE_SURFACE } from './flags';
export { VoiceBeam } from './VoiceBeam';
export { default } from './VoiceBeam';

/** Whether this build carries the surface looks (`look="dots"` / `"lines"`) — not released yet. */
export const VOICE_SURFACE_LOOKS: boolean = VOICE_SURFACE;

export { getAudioContext, isAudioSupported } from './audio';
export { parseRgb } from './color';

export { voiceDefaults, voiceTypePresets, voiceTypeStyle, resolveVoiceDefaults, resolveVoiceStyle } from './presets';
export type { VoiceGeometry, VoiceTypeStyle } from './presets';

export type {
  VoiceBeamProps,
  VoiceBeamType,
  VoiceBeamTheme,
  VoiceBeamLook,
  VoiceBeamDotShape,
  VoiceBeamLinePattern,
  VoiceBeamColorVariant,
  VoiceBeamLevel,
  VoiceBeamMotion,
  VoiceThemeColors,
} from './types';

export { themePresets, voicePalettes, voiceLobes, LOBE_SPACING, LOBE_SPAN } from './styles';
export type { VoiceLobe } from './styles';
