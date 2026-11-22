// Ultra Reactivate's voice glow and border beam as layers behind a frosted surface (z -1 inside the
// frost's isolated stacking context), so they never clip dropdowns the surface opens. Ported from
// the owner's Vorp design (the-wallpaper-project src/vorp/Glow.tsx).

import { BorderBeam } from '../effects/vendor/border-beam';
import { VoiceBeam } from '../effects/vendor/voice-glow';

/** Lobes of colour rise from the surface's bottom edge with the voice, and breathe in silence. */
export function Glow({ level, radius, dark }: { level: number | (() => number); radius: number; dark: boolean }) {
  return (
    <VoiceBeam className="vp-glow-layer" type="default" level={level} theme={dark ? 'dark' : 'light'} borderRadius={radius} aria-hidden="true">
      <div className="vp-glow-fill" />
    </VoiceBeam>
  );
}

/** Light running round the surface's rim. */
export function Beam({ radius, dark, active = true }: { radius: number; dark: boolean; active?: boolean }) {
  return (
    <BorderBeam className="vp-glow-layer" size="md" colorVariant="colorful" active={active} theme={dark ? 'dark' : 'light'} borderRadius={radius} aria-hidden="true">
      <div className="vp-glow-fill" />
    </BorderBeam>
  );
}

/** Ultra Reactivate's round stop button: a drawn square inside a border beam. */
export function StopButton({ dark, onClick, label = 'Stop' }: { dark: boolean; onClick: () => void; label?: string }) {
  return (
    <BorderBeam className="vp-stop-host" size="sm" colorVariant="colorful" theme={dark ? 'dark' : 'light'} borderRadius={32}>
      <button className="vp-stop vp-frost" aria-label={label} title={label} onClick={onClick}>
        <span className="vp-stop-sq" />
      </button>
    </BorderBeam>
  );
}
