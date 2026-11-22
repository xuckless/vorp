// The DOM design system: the owner's signed-off Vorp design (xuckless/the-wallpaper-project
// src/vorp, 22 November 2026), ported from Preact to React. Everything here is DOM code: screens
// that use it run as Expo DOM components ('use dom'), inline on web and in a web view on native.
// It is the one place outside src/ui/effects that reaches the vendored engines. The stubbed-out
// language swap (./Swapper.tsx) is deliberately not exported.

export { Aurora } from './Aurora';
export { Blob, type Mood, type Tint } from './blob';
export { CaptionCard, ProblemCard, QuietCard } from './Caption';
export { Back, Chevron, Presence, Segmented, Select, Toggle, Words, type Option } from './controls';
export { SHOW_SWAP } from './flags';
export { fontFaces } from './fonts';
export { Beam, Glow, StopButton } from './Glow';
export { OrbHalo, WritingOrb } from './Halo';
export { createLight, loop, settle, SIDE, SPECTRUM, tune, type Light, type Phase, type Who } from './light';
export { ringFor } from './layout';
export { Mark } from './Mark';
export { QrCode } from './QrCode';
export { Ring } from './Ring';
export { CSS } from './style';
