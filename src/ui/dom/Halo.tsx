// The interpreter at rest: the blob in the middle, a slow ring of thinking orbs going round it, each
// in a different state. And the small orb that says something is being written. Ported from the
// owner's Vorp design (the-wallpaper-project src/vorp/pages.tsx, OrbHalo).

import type { CSSProperties, Ref } from 'react';

import { ThinkingOrb, type OrbState } from '../effects/vendor/thinking-orbs';
import { Blob } from './blob';

const ORB_STATES: OrbState[] = ['listening', 'searching', 'connecting', 'weaving', 'composing', 'breathing', 'shaping', 'solving'];

export function OrbHalo({ dark, paused, blob }: { dark: boolean; paused: boolean; blob: Ref<HTMLDivElement> }) {
  return (
    <div className="vp-halo">
      <div className="vp-halo-ring">
        {ORB_STATES.map((state, i) => (
          <span key={state} className="vp-halo-orb" style={{ '--i': i, '--n': ORB_STATES.length } as CSSProperties}>
            <span>
              <ThinkingOrb state={state} size={32} theme={dark ? 'dark' : 'light'} paused={paused} aria-hidden="true" />
            </span>
          </span>
        ))}
      </div>
      <div ref={blob} className="vp-halo-blob">
        <Blob size={112} tint="rest" title="Vorp" />
      </div>
    </div>
  );
}

/** A small thinking orb ("composing"), beside a line that says something is being written. */
export function WritingOrb({ dark, paused }: { dark: boolean; paused: boolean }) {
  return <ThinkingOrb state="composing" size={20} theme={dark ? 'dark' : 'light'} paused={paused} aria-hidden="true" />;
}
