// The host's side of Pair by QR, ported from the owner's Vorp design (the-wallpaper-project
// src/vorp/Pair.tsx, PairHost): a big code to scan, what to do, how long it lasts; then who joined.
// Everything shown comes from `HostPairModel`; the only state here is the clock the countdown reads.

import { useEffect, useState } from 'react';

import { languageName } from '@/config/languages';
import { Blob } from '@/ui/dom/blob';
import { Presence } from '@/ui/dom/controls';
import { Beam } from '@/ui/dom/Glow';
import type { Light } from '@/ui/dom/light';
import { Mark } from '@/ui/dom/Mark';
import { QrCode } from '@/ui/dom/QrCode';

import type { HostPairModel } from '../model';

/** The code's frame, by state: what is over the code, and the line under it. */
const OVER: Record<'expired' | 'unavailable' | 'micDenied', { title: string; action: string; line: string }> = {
  expired: { title: 'This code expired', action: 'New code', line: 'Codes last ten minutes, and each lets one person in.' },
  unavailable: { title: 'Vorp couldn’t make a code', action: 'Try again', line: 'Check your connection and try again.' },
  micDenied: { title: 'Vorp needs the microphone', action: 'Try again', line: 'Allow it in the address bar, then try again.' },
};

/** Seconds left on the code, on this phone's clock, ticking. */
function useLeft(expiresAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (expiresAt === undefined) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [expiresAt]);
  return expiresAt === undefined ? 0 : Math.max(0, Math.ceil((expiresAt - now) / 1000));
}

export function PairHost({
  pair,
  light,
  box,
  onCancel,
  onNewCode,
}: {
  pair: Exclude<HostPairModel, { view: 'talk' }>;
  light: Light;
  /** The app's box, to size the code. */
  box: { w: number; h: number };
  onCancel: () => void;
  onNewCode: () => void;
}) {
  const left = useLeft(pair.view === 'code' ? pair.expiresAt : undefined);
  const size = Math.min(300, Math.max(220, Math.round(Math.min(box.w * 0.68, box.h * 0.38))));
  const over = pair.view === 'code' && pair.state !== 'waiting' && pair.state !== 'making' ? OVER[pair.state] : undefined;
  const mm = Math.floor(left / 60);
  const ss = left % 60;

  return (
    <div className="vp-page vp-pair">
      <header className="vp-bar vp-pair-bar">
        <Mark light={light} />
      </header>
      <Presence id={pair.view} exitMs={200} className="vp-pair-main">
        {pair.view === 'joined' ? (
          <div className="vp-pair-joined" role="status">
            <span className="vp-pulse vp-ripple">
              <Blob size={96} mood="happy" tint="them" />
            </span>
            <h1>They’re in</h1>
            <p className="vp-pair-lang">
              They speak <strong>{languageName(pair.them)}</strong>
            </p>
            <p className="vp-mute">Starting the conversation</p>
          </div>
        ) : (
          <>
            <h1>Pair a phone</h1>
            <p className="vp-mute vp-pair-lede">Ask them to scan this with their phone’s camera. They pick their language, and you each hear the other in your own.</p>
            <div className={`vp-qr-frame vp-frost ${over ? 'expired' : ''}`}>
              <Beam radius={30} dark={light.dark} active={pair.state === 'waiting'} />
              {pair.url ? (
                <QrCode text={pair.url} size={size} label="QR code to join" />
              ) : (
                // The plate holds its place while the room is made, so nothing jumps when the code lands.
                <div className="vp-qr" style={{ width: size, height: size }} aria-hidden="true" />
              )}
              {over && (
                <div className="vp-qr-over">
                  <p>{over.title}</p>
                  <button className="vp-primary vp-primary-sm" onClick={onNewCode}>
                    {over.action}
                  </button>
                </div>
              )}
            </div>
            <p className="vp-mute vp-pair-expiry" aria-live="polite">
              {over ? over.line : pair.state === 'waiting' ? `Works once. Expires in ${mm}:${String(ss).padStart(2, '0')}` : 'Making a code'}
            </p>
            <button className="vp-link vp-pair-cancel" onClick={onCancel}>
              Cancel
            </button>
          </>
        )}
      </Presence>
    </div>
  );
}
