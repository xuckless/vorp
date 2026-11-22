// Vendored from Libraries.dev (https://github.com/Jakubantalik/Libraries.dev, packages/distortion-waves, MIT,
// (c) 2026 Jakub Antalik, see ../LICENSE), via xuckless/the-wallpaper-project
// src/ultra-reactivate/vendor/distortion-waves at 598f814 (19 Nov 2026). Changes: Preact imports point back
// at React 19.
// Only src/ui/slots imports this folder.

/* Distortion waves for React.

   <DistortionWave> is the component. WaveController is the same wave
   without React, for any element. The model and the renderer are exported
   for those who want to draw the wave themselves. */

export { DistortionWave } from "./DistortionWave";
export type { DistortionWaveHandle, DistortionWaveProps } from "./DistortionWave";

export { WaveController } from "./controller";
export type { PaletteLike, PlayOptions, SourceLike, WaveOptions, WaveStyleInput } from "./controller";

export {
  bezierEase,
  COVER_ZONE,
  defaultStyle,
  duration,
  hexToRgb,
  LUMPS,
  makeParticles,
  newFront,
  PALETTES,
  particleAt,
  rgbToHex,
  rimLumps,
  singlePalette,
  smooth,
  waveFront,
} from "./model";
export type { Front, Palette, PaletteName, Particle, Point, Rect, RGB, Spot, WaveStyle, WaveType } from "./model";

export { WaveRenderer } from "./renderer";
export type { DotBuffer, FrameOptions, RendererOptions, ScreenSlot } from "./renderer";

export { backgroundOf, snapshot } from "./capture";
export type { CaptureFunction, CaptureRequest, Snapshot, SnapshotOptions } from "./capture";
