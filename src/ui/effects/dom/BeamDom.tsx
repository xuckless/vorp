'use dom';

// Expo DOM component: the border beam, drawn on an empty box that fills its parent. The slot
// lays it over the card, so the card itself stays native.


import { BorderBeam } from '../vendor/border-beam';
import { DomPage, type DOMProps } from './page';

export default function BeamDom({
  active,
  radius,
  dark,
}: {
  active: boolean;
  radius: number;
  dark: boolean;
  dom?: DOMProps;
}) {
  return (
    <DomPage>
      <BorderBeam
        size="md"
        colorVariant="gold"
        theme={dark ? 'dark' : 'light'}
        active={active}
        borderRadius={radius}
        style={{ position: 'absolute', inset: 0 }}
      >
        <div style={{ width: '100%', height: '100%', borderRadius: radius }} />
      </BorderBeam>
    </DomPage>
  );
}
