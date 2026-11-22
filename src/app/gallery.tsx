// Dev aid: the slot gallery. Only in development builds, or an export built with
// EXPO_PUBLIC_GALLERY=1; otherwise it sends you to the stage.

import { Redirect, useLocalSearchParams } from 'expo-router';

import { GalleryScreen } from '@/features/gallery/GalleryScreen';
import type { SlotName } from '@/ui/slots';

export default function Gallery() {
  const { only } = useLocalSearchParams<{ only?: SlotName }>();
  if (!__DEV__ && process.env.EXPO_PUBLIC_GALLERY !== '1') return <Redirect href="/" />;
  return <GalleryScreen only={only} />;
}
