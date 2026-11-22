// Design tokens: colour, type, spacing, radius. The one module that holds these values.
//
// Colours are the owner's signed-off design (xuckless/the-wallpaper-project src/vorp, 22 November
// 2026): graphite and ink, or paper and graphite, with the brand spectrum. The DOM design system
// (src/ui/dom/style.ts) builds its CSS variables from these; spacing and radii stay provisional.

import { useSyncExternalStore } from 'react';
import { useColorScheme } from 'react-native';

import { createStore } from '@/core/store';

export type ColorScheme = 'light' | 'dark';

export type Palette = {
  /** The page behind everything. */
  background: string;
  /** Cards and sheets. */
  surface: string;
  /** Surfaces above surfaces: popovers, a pressed card. */
  surfaceRaised: string;
  /** Hairlines and dividers. */
  border: string;
  text: string;
  textMuted: string;
  /** Gold: the single brand accent. */
  accent: string;
  /** Text and icons drawn on the accent. */
  onAccent: string;
  danger: string;
  /** One accent hue per participant, in seat order: you (the owner), then them. */
  participants: readonly string[];
  /** Controls on a surface (a select, a segmented track), and a pressed control. */
  control: string;
  press: string;
  /** Solid floating surfaces (a dropdown nested in frost). */
  pop: string;
};

/** The brand spectrum: your end (blue), the interpreter (violet, pink), their end (orange). */
export const SPECTRUM = { blue: '#4c8dff', violet: '#8f6bff', pink: '#f25cc4', orange: '#ffa24c' } as const;

/** The design's palettes. `accent` (gold) is only read by the older slot stand-ins. */
export const palettes: Record<ColorScheme, Palette> = {
  dark: {
    background: '#0d0f11',
    surface: '#15181b',
    surfaceRaised: '#1d2125',
    border: '#2a2f34',
    text: '#f2efe8',
    textMuted: '#8d9196',
    accent: '#e3b34a',
    onAccent: '#0d0f11',
    danger: '#ff7a6b',
    participants: [SPECTRUM.blue, SPECTRUM.orange, '#7fd492'],
    control: '#1d2125',
    press: '#2a2f35',
    pop: '#1d2125',
  },
  light: {
    background: '#f5f3ee',
    surface: '#ebe7df',
    surfaceRaised: '#e1dcd2',
    border: '#dedad2',
    text: '#0d0f11',
    textMuted: '#6e6b65',
    accent: '#b5851c',
    onAccent: '#ffffff',
    danger: '#c8402f',
    participants: ['#2f6fe4', '#d9772a', '#2e8a48'],
    control: '#e1dcd2',
    press: '#d6d0c4',
    pop: '#fbfaf7',
  },
};

/** PROVISIONAL type scale: size and line height in points. */
export const type = {
  /** Geist, loaded in the root layout. Each weight is its own family, so set a family, not a fontWeight. */
  family: 'Geist_400Regular',
  familyMedium: 'Geist_500Medium',
  caption: { fontSize: 13, lineHeight: 18 },
  body: { fontSize: 16, lineHeight: 23 },
  title: { fontSize: 22, lineHeight: 28 },
  display: { fontSize: 32, lineHeight: 38 },
  weight: { regular: '400', medium: '500', bold: '700' },
} as const;

/** PROVISIONAL spacing scale in points. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/** PROVISIONAL corner radii in points. */
export const radius = { sm: 8, md: 14, lg: 22, pill: 999 } as const;

/** Minimum touch target (accessibility rule, not provisional). */
export const TOUCH_TARGET = 44;

export type Theme = {
  scheme: ColorScheme;
  color: Palette;
  type: typeof type;
  space: typeof space;
  radius: typeof radius;
};

export function themeFor(scheme: ColorScheme): Theme {
  return { scheme, color: palettes[scheme], type, space, radius };
}

/** `system` follows the device; the others override it. Settings writes it; nothing else does. */
export type ThemePreference = 'system' | ColorScheme;

export const themePreference = createStore<ThemePreference>('system');

/** The theme in use: the user's choice, else the system's. Dark when the system does not say. */
export function useTheme(): Theme {
  const preference = useSyncExternalStore(themePreference.subscribe, themePreference.get, themePreference.get);
  const system = useColorScheme() === 'light' ? 'light' : 'dark';
  return themeFor(preference === 'system' ? system : preference);
}
