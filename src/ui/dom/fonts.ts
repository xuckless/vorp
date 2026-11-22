// Geist, the app's face, for the DOM design system. The files are the ones the app ships
// (@expo-google-fonts/geist); here they are declared as one family in two weights, as the design's
// CSS expects (`font-weight: 500`), instead of a family per weight as React Native needs.

import { Geist_400Regular, Geist_500Medium } from '@expo-google-fonts/geist';
import { Asset } from 'expo-asset';

const face = (weight: number, module: number) => {
  const uri = Asset.fromModule(module).uri;
  return `@font-face{font-family:Geist;font-style:normal;font-weight:${weight};font-display:swap;src:url("${uri}") format("truetype")}`;
};

/** The @font-face rules, or none where the files cannot be resolved (the face falls back to the system's). */
export function fontFaces(): string {
  try {
    return face(400, Geist_400Regular) + face(500, Geist_500Medium);
  } catch {
    return '';
  }
}
