// The live caption: one card per turn, frosted glass tinted in the speaker's hue, its corner nearest
// the speaker's side tightened. What was said fills it word by word; once the translation is ready a
// distortion wave crosses the card and leaves the translation behind it, the source small under it.
// The rainbow border beam runs while Vorp speaks it. Ported from the owner's Vorp design
// (the-wallpaper-project src/vorp/Caption.tsx).

import type { ReactNode } from 'react';

import { DistortionWave } from '../effects/vendor/distortion-waves';
import { SPECTRUM } from './light';
import { Beam } from './Glow';
import type { Who } from './light';

/** The wave as an impact frame: a short gather, a quick pass, and the bright rim gone almost at once
 *  (the library's default takes about three seconds to settle). */
const FAST = {
  anticipation: 0.16,
  travel: 0.85,
  rimFade: 0.7,
  hairlineLinger: 0.08,
  hairlineFade: 0.6,
  hairlineWhite: 0.6,
  particleLife: 0.7,
  tail: 170,
  blurBehind: 140,
};

export function CaptionCard({
  who,
  heard,
  spoken,
  source,
  revealed,
  speaking,
  dark,
  reduced,
}: {
  /** Undefined until the speaker is known: the card carries no hue yet. */
  who?: Who;
  heard: ReactNode;
  spoken: string;
  source: string;
  revealed: boolean;
  speaking: boolean;
  dark: boolean;
  reduced: boolean;
}) {
  return (
    <div className={`vp-card vp-frost ${who ?? ''}`}>
      <Beam radius={22} dark={dark} active={speaking} />
      <DistortionWave
        className="vp-card-wave"
        type="vertical"
        revealed={revealed}
        palette={who === 'them' ? SPECTRUM.orange : who === 'you' ? SPECTRUM.blue : SPECTRUM.violet}
        cornerRadius={22}
        waveStyle={FAST}
        reducedMotion={reduced ? 'always' : 'system'}
        revealedContent={
          <div className="vp-card-face">
            <p className="vp-card-big">{spoken}</p>
            <p className="vp-card-small vp-mute">{source}</p>
          </div>
        }
      >
        <div className="vp-card-face">
          <p className="vp-card-big">{heard}</p>
        </div>
      </DistortionWave>
    </div>
  );
}

/** A card that is only a line, for before anyone speaks and while you hold to talk. */
export function QuietCard({ children }: { children: ReactNode }) {
  return (
    <div className="vp-card vp-card-quiet">
      <div className="vp-card-face">
        <p className="vp-card-big vp-mute">{children}</p>
      </div>
    </div>
  );
}

/** A problem, in the caption's place: what happened, what to do, and the one action that fixes it. */
export function ProblemCard({ title, body, action, onAction }: { title: string; body: string; action: string; onAction: () => void }) {
  return (
    <div className="vp-card vp-frost vp-card-problem" role="alert">
      <div className="vp-card-face">
        <p className="vp-card-title">{title}</p>
        <p className="vp-card-small vp-mute">{body}</p>
        <button className="vp-btn vp-frost vp-card-action" onClick={onAction}>
          {action}
        </button>
      </div>
    </div>
  );
}
