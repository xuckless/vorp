// The owner's app, from the app's one heavy chunk (see features/app/chunk.ts), behind the booth
// gate: without the booth's pass the device sees the demo-mode page and never loads the chunk.

import { lazy, Suspense } from 'react';

import { HostGate } from '@/features/app/HostGate';

const Vorp = lazy(() => import('@/features/app/chunk').then((m) => ({ default: m.Vorp })));

export default function Index() {
  return (
    <HostGate>
      <Suspense fallback={null}>
        <Vorp />
      </Suspense>
    </HostGate>
  );
}
