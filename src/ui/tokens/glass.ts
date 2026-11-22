// Glass: wubble's coloured frost, tinted. A heavy backdrop blur keeps the hue of what is behind
// and loses its detail; a translucent fill lifts it into a pane; a faint inner light marks the
// edge and a soft shadow lifts it off the page.
//
// Source: the owner's wubble design, `xuckless/the-wallpaper-project` `src/wubble/core/tokens.ts`
// (`glass`) and `src/wubble/core/wubble.css` (`.wb-thin/.wb-regular/.wb-thick`), commit `598f814`.
// Wubble's fill is a neutral milk; here the fill takes a tint, so each use colours it as it needs.

import type { ColorScheme } from './theme';

export type GlassTier = 'thin' | 'regular' | 'thick';

type Tier = {
  /** Backdrop blur in px. */
  blur: number;
  saturate: number;
  brightness: number;
  /** Alpha of the tinted fill. */
  fill: number;
  /** Drop shadow: y offset, blur, alpha. */
  shadow: readonly [number, number, number];
  /** Alpha of the inner rim light and the top light. */
  rim: number;
  top: number;
};

/** Wubble's tiers. Its fills are .09 / .11 / .42; the tinted fill uses the same alphas. */
export const GLASS: Record<GlassTier, Tier> = {
  thin: { blur: 24, saturate: 1.7, brightness: 1.08, fill: 0.09, shadow: [8, 22, 0.22], rim: 0.05, top: 0.06 },
  regular: { blur: 36, saturate: 1.7, brightness: 1, fill: 0.11, shadow: [14, 36, 0.28], rim: 0.05, top: 0.06 },
  thick: { blur: 48, saturate: 1.7, brightness: 0.55, fill: 0.42, shadow: [20, 50, 0.35], rim: 0.06, top: 0.07 },
};

/** Wubble is dark only. On a light page its shadows are far too heavy, so they are scaled down. */
const SHADOW_SCALE: Record<ColorScheme, number> = { dark: 1, light: 0.3 };

/** `#rrggbb` at an alpha, as `rgba()`. */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** The CSS a glass pane needs: its fill, its backdrop filter and its shadows. */
export function glassStyle(tier: GlassTier, tint: string, scheme: ColorScheme) {
  const t = GLASS[tier];
  const [y, blur, alpha] = t.shadow;
  return {
    backgroundColor: withAlpha(tint, t.fill),
    backdropFilter: `blur(${t.blur}px) saturate(${t.saturate * 100}%) brightness(${t.brightness})`,
    boxShadow: [
      `inset 0 0 0 1px rgba(255, 255, 255, ${t.rim})`,
      `inset 0 1px 0 rgba(255, 255, 255, ${t.top})`,
      `0 ${y}px ${blur}px rgba(0, 0, 0, ${alpha * SHADOW_SCALE[scheme]})`,
    ].join(', '),
  };
}
