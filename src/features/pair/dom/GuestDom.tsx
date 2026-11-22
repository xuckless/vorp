'use dom';

// Expo DOM component: the guest's whole page, from the language question to the conversation.
// Inline on web; one web view on native. It renders from plain data (`GuestPageModel`) and calls
// back with what was tapped. First paint is light: the plain background, the blob and the copy;
// the aurora fades in once the page is idle (or never, on a constrained phone), and the
// conversation view (the ring and its engines) is loaded only once the guest is in.

import { IS_DOM } from 'expo/dom';
import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react';

import { Aurora } from '@/ui/dom/Aurora';
import { Presence } from '@/ui/dom/controls';
import { fontFaces } from '@/ui/dom/fonts';
import { ringFor } from '@/ui/dom/layout';
import { createLight, tune } from '@/ui/dom/light';
import { CSS } from '@/ui/dom/style';

import type { GuestPageModel } from '../model';
import { usePairFeed } from './feed';
import { Guest } from './Guest';

// `expo/dom` declares DOMProps only in its native typings, and tsc resolves the `.web` file here
// (moduleSuffixes), so the type is taken from where expo defines it.
import type { DOMProps } from 'expo/build/dom/dom.types';

// The conversation view comes with the app's heavy chunk (see features/app/chunk.ts).
const PairTalk = lazy(() => import('@/features/app/chunk').then((m) => ({ default: m.PairTalk })));

const PAGE_CSS = 'html,body,#root{margin:0;padding:0;height:100%;overflow:hidden}';

export type GuestDomProps = {
  dark: boolean;
  reduced: boolean;
  page: GuestPageModel;
  /** The voice in the air, 0..1: a getter on web, sampled numbers on native. */
  level: number | (() => number);
  boothSeconds: number;
  onPick: (language: string) => void;
  onJoin: () => void;
  onStop: () => void;
  onPressTalk: () => void;
  onReleaseTalk: () => void;
  onSound: () => void;
  onContinue: () => void;
  onRetry: () => void;
  dom?: DOMProps;
};

export default function GuestDom(props: GuestDomProps) {
  const { dark, reduced, page } = props;
  const [light] = useState(createLight);
  const [fonts] = useState(fontFaces);
  const root = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 390, h: 844 });

  useLayoutEffect(() => {
    tune(light, { dark, reduced });
  }, [light, dark, reduced]);
  usePairFeed(light, page.talk, props.level, true);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const talk = page.talk;
  return (
    <div ref={root} className="vp" data-theme={dark ? 'dark' : 'light'} data-reduced={reduced ? '' : undefined}>
      <style>{(IS_DOM ? PAGE_CSS : '') + fonts + CSS}</style>
      <Aurora light={light} defer />
      <Presence id={talk ? 'talk' : 'guest'} exitMs={160} className="vp-views">
        {talk ? (
          <Suspense fallback={null}>
            <PairTalk
              talk={talk}
              light={light}
              ring={ringFor(box.w, box.h)}
              boothSeconds={props.boothSeconds}
              onStop={props.onStop}
              onPressTalk={props.onPressTalk}
              onReleaseTalk={props.onReleaseTalk}
              onSound={props.onSound}
              onContinue={props.onContinue}
              onNextVisitor={() => {}}
              onNotNow={() => {}}
              onRetry={props.onRetry}
            />
          </Suspense>
        ) : (
          <Guest page={page} light={light} onPick={props.onPick} onJoin={props.onJoin} />
        )}
      </Presence>
    </div>
  );
}
