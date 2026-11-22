'use dom';

// Expo DOM component: the thinking orb. On web it renders inline; on native inside a web view.


import { ThinkingOrb, type OrbSize, type OrbState } from '../vendor/thinking-orbs';
import { DomPage, type DOMProps } from './page';

const TUNED: OrbSize[] = [64, 32, 20];

export default function OrbDom({
  state,
  size,
  color,
  dark,
  paused,
  label,
}: {
  state: OrbState;
  size: number;
  color?: string;
  dark: boolean;
  paused: boolean;
  label: string;
  dom?: DOMProps;
}) {
  // The engine is tuned at three sizes; draw at the nearest one at or below and scale it.
  const tuned = TUNED.find((t) => t <= size) ?? 20;
  const scale = size / tuned;
  return (
    <DomPage>
      <div style={{ width: size, height: size, overflow: 'visible' }}>
        <ThinkingOrb
          state={state}
          size={tuned}
          color={color}
          theme={dark ? 'dark' : 'light'}
          paused={paused}
          aria-label={label}
          style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}
        />
      </div>
    </DomPage>
  );
}
