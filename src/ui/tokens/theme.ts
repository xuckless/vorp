// Design tokens: colour, type, spacing, radius. The one module that holds these values.
//
// PROVISIONAL: every value below is a placeholder until the design prototype lands. The shape
// (token names and the light / dark split) is what the rest of the app relies on; replace the
// numbers and colours here and nowhere else.

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
  /** One accent hue per participant, in seat order. */
  participants: readonly string[];
};

/** PROVISIONAL palettes: graphite base, gold accent. */
export const palettes: Record<ColorScheme, Palette> = {
  dark: {
    background: '#0d0f11',
    surface: '#16191c',
    surfaceRaised: '#1f2327',
    border: '#2a2f34',
    text: '#f2efe8',
    textMuted: '#9a9ea4',
    accent: '#e3b34a',
    onAccent: '#0d0f11',
    danger: '#ff8f7f',
    participants: ['#6db3ff', '#ff83ad', '#7fd492'],
  },
  light: {
    background: '#f5f3ee',
    surface: '#ffffff',
    surfaceRaised: '#ffffff',
    border: '#dedad2',
    text: '#15171a',
    textMuted: '#5f646b',
    accent: '#b5851c',
    onAccent: '#ffffff',
    danger: '#c2412f',
    participants: ['#1f6fd1', '#c2306a', '#2e8a48'],
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
