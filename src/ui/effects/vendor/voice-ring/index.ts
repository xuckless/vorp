// Vendored from Libraries.dev (https://github.com/Jakubantalik/Libraries.dev, packages/voice-ring, MIT,
// (c) 2026 Jakub Antalik, see ../LICENSE), via xuckless/the-wallpaper-project
// src/ultra-reactivate/vendor/voice-ring at 598f814 (19 Nov 2026). Changes: Preact imports point back
// at React 19, and useMicrophone is removed: Vorp drives the ring from its own audio levels and the vendored code never opens the microphone.
// Only src/ui imports this folder (the slots and the DOM design system in src/ui/dom).

export { VoiceOrb } from './VoiceOrb';
export { acquireAnalyser, getAudioContext, isAudioSupported } from './audio';
export type { AnalyserLease } from './audio';
export { VoiceFollower, SPECTRUM_N } from './voice';
export { ACCENT_COLORS, EMOTION_COLORS, type VoiceOrbAccent, type VoiceOrbEmotion } from './emotion';
export { PRESETS, resolvePreset } from './presets';
export { VOICE_ORB_TYPES, type VoiceOrbType } from './engine/registry';
export type { OrbTheme, VoiceOrbProps, VoiceOrbState } from './types';
export type { VoiceInput, TypeFrame, TypeOpts } from './engine/types';
export { VoiceRing, type VoiceRingProps, type VoiceRingType } from './VoiceRing';
