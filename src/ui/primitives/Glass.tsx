// A pane of tinted glass (wubble's coloured frost, `@/ui/tokens/glass`). On web the backdrop is
// blurred with `backdrop-filter`; React Native has no backdrop filter, so on native the pane is
// its tinted fill and shadows only.

import { Platform, View, type ViewProps } from 'react-native';

import { glassStyle, useTheme, type GlassTier } from '@/ui/tokens';

export type GlassProps = ViewProps & {
  /** The colour the pane takes. Defaults to the theme's text colour, a neutral milk. */
  tint?: string;
  tier?: GlassTier;
};

export function Glass({ tint, tier = 'regular', style, ...rest }: GlassProps) {
  const theme = useTheme();
  const { backdropFilter, ...pane } = glassStyle(tier, tint ?? theme.color.text, theme.scheme);
  // react-native-web passes backdropFilter through (and prefixes it); React Native's types omit it.
  const web = Platform.OS === 'web' ? ({ backdropFilter } as object) : null;
  return <View style={[pane, web, style]} {...rest} />;
}
