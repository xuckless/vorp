// The owner's app. Loaded as its own chunk, so the guest's page (/join) does not carry it.

import { lazy, Suspense } from 'react';

const Vorp = lazy(() => import('@/features/conversation/Vorp').then((m) => ({ default: m.Vorp })));

export default function Index() {
  return (
    <Suspense fallback={null}>
      <Vorp />
    </Suspense>
  );
}
