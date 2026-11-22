// The interpreter as a blobatar, painted as tinted glass. Ported from the owner's Vorp design
// (the-wallpaper-project src/vorp/Ring.tsx, BLOB_*). Moods are names, so screens never import the
// vendored engine.

import type { Ref } from 'react';

import { happy, idle, sad, sleepy, thinking, unsure } from '../effects/vendor/blobatar/expression';
import { Blobatar } from '../effects/vendor/blobatar/react';

export const BLOB_NAME = 'vorp';
export const BLOB_LOOK = { hue: 275, tone: 0.55, traits: { shape: 0.82 } };

/** The blob as tinted glass: its body is painted from CSS (`.vp-glass-blob` in style.ts) with this
 *  gradient, violet at rest, and blue or orange with whoever's speaking, like the caption cards. */
export const BLOB_GLASS = `<linearGradient id="vp-blob-glass" gradientUnits="userSpaceOnUse" x1="38" y1="18" x2="58" y2="86">
  <stop offset="0" class="vp-bg-a"/><stop offset="0.55" class="vp-bg-b"/><stop offset="1" class="vp-bg-c"/>
</linearGradient>`;

export const MOODS = { idle, happy, thinking, sad, sleepy, unsure } as const;
export type Mood = keyof typeof MOODS;
export type Tint = 'rest' | 'you' | 'them';

/** The blob, in glass of the given tint (or plain, without one), wearing a mood. */
export function Blob({
  size,
  mood = 'idle',
  tint,
  title,
  elementRef,
}: {
  size: number;
  mood?: Mood;
  tint?: Tint;
  title?: string;
  elementRef?: Ref<SVGSVGElement | HTMLImageElement>;
}) {
  const blob = (
    <Blobatar
      name={BLOB_NAME}
      {...BLOB_LOOK}
      defs={tint ? BLOB_GLASS : undefined}
      animate="always"
      expression={MOODS[mood]}
      size={size}
      title={title}
      elementRef={elementRef as ((el: SVGSVGElement | HTMLImageElement | null) => void) | undefined}
    />
  );
  return tint ? (
    <span className="vp-glass-blob" data-tint={tint}>
      {blob}
    </span>
  ) : (
    blob
  );
}
