'use dom';

// Expo DOM component: the voice ring. The level is ours (AudioInput / AudioOutput); the ring is
// never given a stream, so it never opens or reads the microphone itself.


import { VoiceRing, type VoiceOrbState } from '../vendor/voice-ring';
import { DomPage, type DOMProps } from './page';

export default function RingDom({
  state,
  level,
  direction,
  size,
  color,
  dark,
  paused,
  label,
}: {
  state: VoiceOrbState;
  /** A getter only on web, where this renders inline; native passes sampled numbers. */
  level: number | (() => number);
  direction: number;
  size: number;
  color?: string;
  dark: boolean;
  paused: boolean;
  label: string;
  dom?: DOMProps;
}) {
  return (
    <DomPage>
      <VoiceRing
        type="ring"
        state={state}
        level={level}
        direction={direction}
        size={size}
        color={color}
        theme={dark ? 'dark' : 'light'}
        paused={paused}
        aria-label={label}
      />
    </DomPage>
  );
}
