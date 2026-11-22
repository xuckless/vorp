// Dev aid: the slot gallery. Only in development builds, or an export built with
// EXPO_PUBLIC_GALLERY=1; otherwise it sends you to the stage.

import { Redirect, useLocalSearchParams } from 'expo-router';
import { lazy, Suspense } from 'react';

import type { SlotName } from '@/ui/slots';

// From the app's heavy chunk (features/app/chunk.ts): the effects it shows stay out of the guest's page.
const GalleryScreen = lazy(() => import('@/features/app/chunk').then((m) => ({ default: m.GalleryScreen })));

export default function Gallery() {
  const { only } = useLocalSearchParams<{ only?: SlotName }>();
  if (!__DEV__ && process.env.EXPO_PUBLIC_GALLERY !== '1') return <Redirect href="/" />;
  return (
    <Suspense fallback={null}>
      <GalleryScreen only={only} />
    </Suspense>
  );
}
