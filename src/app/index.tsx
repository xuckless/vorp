// The owner's app, from the app's one heavy chunk (see features/app/chunk.ts).

import { lazy, Suspense } from 'react';

const Vorp = lazy(() => import('@/features/app/chunk').then((m) => ({ default: m.Vorp })));

export default function Index() {
  return (
    <Suspense fallback={null}>
      <Vorp />
    </Suspense>
  );
}
