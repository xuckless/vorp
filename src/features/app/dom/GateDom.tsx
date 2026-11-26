'use dom';

// Expo DOM component: what someone who opens the app's root without the booth's pass sees. Vorp is
// in demo mode: a conversation starts from a host's QR code. Light like the guest's page (the blob,
// the copy and two links), so a stranger's phone loads nothing heavy; the aurora fades in when idle.

import { IS_DOM } from 'expo/dom';
import { useLayoutEffect, useState } from 'react';

import { Aurora } from '@/ui/dom/Aurora';
import { Blob } from '@/ui/dom/blob';
import { Presence } from '@/ui/dom/controls';
import { fontFaces } from '@/ui/dom/fonts';
import { createLight, tune } from '@/ui/dom/light';
import { Mark } from '@/ui/dom/Mark';
import { CSS } from '@/ui/dom/style';

// See GuestDom: the type comes from where expo defines it.
import type { DOMProps } from 'expo/build/dom/dom.types';

const PAGE_CSS = 'html,body,#root{margin:0;padding:0;height:100%;overflow:hidden}';

export default function GateDom({ dark, reduced, landingUrl, repoUrl }: { dark: boolean; reduced: boolean; landingUrl: string; repoUrl: string; dom?: DOMProps }) {
  const [light] = useState(createLight);
  const [fonts] = useState(fontFaces);
  useLayoutEffect(() => {
    tune(light, { dark, reduced });
  }, [light, dark, reduced]);

  return (
    <div className="vp" data-theme={dark ? 'dark' : 'light'} data-reduced={reduced ? '' : undefined}>
      <style>{(IS_DOM ? PAGE_CSS : '') + fonts + CSS}</style>
      <Aurora light={light} defer />
      <Presence id="gate" exitMs={160} className="vp-views">
        <div className="vp-page vp-guest">
          <header className="vp-bar vp-guest-bar">
            <Mark light={light} />
          </header>
          <main className="vp-guest-main">
            <div className="vp-guest-hero vp-gate" role="alert">
              <Blob size={112} mood="unsure" tint="rest" />
              <h1>Oops, Vorp is in demo mode</h1>
              <p className="vp-guest-body">Ask a host at the Vorp booth to start a conversation with you. They’ll show you a QR code to scan.</p>
              <div className="vp-guest-actions vp-start-actions">
                <a className="vp-primary vp-link-btn" href={landingUrl}>
                  See Vorp and vote
                </a>
                <a className="vp-secondary vp-frost vp-link-btn" href={repoUrl} target="_blank" rel="noopener">
                  The code on GitHub
                </a>
              </div>
            </div>
          </main>
        </div>
      </Presence>
    </div>
  );
}
