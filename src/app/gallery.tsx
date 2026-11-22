// Dev aid: the slot gallery. Only in development builds, or an export built with
// EXPO_PUBLIC_GALLERY=1; otherwise it sends you to the stage.

import { Redirect, useLocalSearchParams } from 'expo-router';
import { lazy, Suspense } from 'react';

import type { SlotName } from '@/ui/slots';

// Its own chunk: the effects it shows stay out of the guest's page.
const GalleryScreen = lazy(() => import('@/features/gallery/GalleryScreen').then((m) => ({ default: m.GalleryScreen })));

export default function Gallery() {
  const { only } = useLocalSearchParams<{ only?: SlotName }>();
  if (!__DEV__ && process.env.EXPO_PUBLIC_GALLERY !== '1') return <Redirect href="/" />;
  return (
    <Suspense fallback={null}>
      <GalleryScreen only={only} />
    </Suspense>
  );
}
