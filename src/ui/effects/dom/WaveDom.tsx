'use dom';

// Expo DOM component: the distortion wave carrying the original caption into its translation.
// The caption faces are drawn here, in the DOM, because the wave pictures the DOM it crosses.

import type { CSSProperties } from 'react';

import { DistortionWave } from '../vendor/distortion-waves';
import { DomPage, type DOMProps } from './page';

export default function WaveDom({
  original,
  translation,
  revealed,
  color,
  background,
  accent,
  fontFamily,
  fontSize,
  lineHeight,
  radius,
  padding,
  width,
  reduced,
}: {
  original: string;
  translation: string;
  revealed: boolean;
  color: string;
  background: string;
  accent: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  radius: number;
  padding: number;
  width: number | null;
  reduced: boolean;
  dom?: DOMProps;
}) {
  const face: CSSProperties = {
    boxSizing: 'border-box',
    height: '100%',
    padding,
    background,
    color,
    fontSize,
    lineHeight: `${lineHeight}px`,
    fontFamily: `${fontFamily}, system-ui, sans-serif`,
    borderRadius: radius,
  };
  return (
    <DomPage>
      <DistortionWave
        type="vertical"
        revealed={revealed}
        palette={accent}
        cornerRadius={radius}
        reducedMotion={reduced ? 'always' : 'system'}
        style={{ width: width ?? '100%', borderRadius: radius }}
        revealedContent={<div style={face}>{translation}</div>}
      >
        <div style={face}>{original}</div>
      </DistortionWave>
    </DomPage>
  );
}
