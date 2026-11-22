'use dom';

// Expo DOM component: the whole app as the owner's design draws it (the-wallpaper-project
// src/vorp/index.tsx). Inline on web; in one web view on native. It renders from plain data and
// calls back with what was tapped; the only state here is visual (which dropdown is open, where the
// blob flies from). The light (`@/ui/dom` light.ts) is fed every frame from `level`.

import { IS_DOM } from 'expo/dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Aurora, createLight, CSS, fontFaces, loop, Presence, tune, type Light } from '@/ui/dom';

import type { Choice, EnrolModel, HistoryItem, Mode, Page, SetupModel, TalkModel } from '../model';
import { Enrol, enrolPhase } from './Enrol';
import { History, Transcript } from './History';
import { Start } from './Start';
import { Talk } from './Talk';

// `expo/dom` declares DOMProps only in its native typings, and tsc resolves the `.web` file here
// (moduleSuffixes), so the type is taken from where expo defines it.
import type { DOMProps } from 'expo/build/dom/dom.types';

/** Inside a native web view the page itself is the app's box; on web the app renders inline and the page is left alone. */
const PAGE_CSS = 'html,body,#root{margin:0;padding:0;height:100%;overflow:hidden}';

export type VorpProps = {
  dark: boolean;
  reduced: boolean;
  mode: Mode;
  page: Page;
  /** The running conversation, or null: the conversation shows whenever there is one. */
  talk: TalkModel | null;
  setup: SetupModel;
  youChoices: Choice[];
  themChoices: Choice[];
  voiceChoices: Choice[];
  toneChoices: Choice[];
  enrol: EnrolModel;
  history: HistoryItem[];
  /** The voice in the air, 0..1: a getter on web (read per frame), sampled numbers on native. */
  level: number | (() => number);
  onStart: () => void;
  onStop: () => void;
  onRetry: () => void;
  onPressTalk: () => void;
  onReleaseTalk: () => void;
  onSetup: (patch: Partial<SetupModel>) => void;
  onPage: (page: Page) => void;
  onDemo: () => void;
  onEnrolBegin: () => void;
  onEnrolNext: () => void;
  onEnrolCancel: () => void;
  onEnrolDelete: () => void;
  /** Leave voice setup; `first`: it was the first-launch prompt (done or skipped). */
  onEnrolDone: (first: boolean) => void;
  onCopy: (id: string) => void;
  onDelete: (id: string) => void;
  onRetryRecap: (id: string) => void;
  dom?: DOMProps;
};

/** The ring's size for the box the app has. */
const ringFor = (w: number, h: number) => Math.round(1.25 * Math.max(170, Math.min(w * 0.64, h * 0.36, 340)));

/** Keeps the light's phase, side and level in step with what is on screen. */
function useFeed(light: Light, props: VorpProps) {
  const { talk, page, enrol, level } = props;
  const source = useRef<() => number>(() => 0);
  useEffect(() => {
    const read = typeof level === 'function' ? level : () => level;
    if (talk) {
      tune(light, talk.who ? { phase: talk.phase, who: talk.who } : { phase: talk.phase });
      const busy = talk.connection === 'connecting' || talk.connection === 'reconnecting';
      // Connecting works the ring gently; a problem stills it.
      source.current = busy ? () => 0.18 + 0.08 * Math.sin(performance.now() / 300) : talk.connection === 'problem' ? () => 0 : read;
    } else if (page.name === 'enrol') {
      tune(light, { phase: enrolPhase(enrol), who: 'you' });
      const resting = { loading: 0.2, computing: 0.2, enrolled: 0.4 } as Record<string, number>;
      source.current = enrol.status === 'recording' ? read : () => resting[enrol.status] ?? 0;
    } else {
      tune(light, { phase: 'listening' });
      source.current = () => 0;
    }
  }, [light, talk, page, enrol, level]);
  useEffect(
    () =>
      loop(60, () => {
        tune(light, { level: Math.max(0, Math.min(1, source.current())) });
      }),
    [light],
  );
}

export default function VorpDom(props: VorpProps) {
  const { dark, reduced, page, talk, setup, enrol, history } = props;
  const [light] = useState(createLight);
  const root = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 390, h: 844 });
  // Where the blob was when Start was pressed: it flies from there into the ring.
  const [flip, setFlip] = useState<DOMRect | null>(null);
  const [fonts] = useState(fontFaces);

  useLayoutEffect(() => {
    tune(light, { dark, reduced });
  }, [light, dark, reduced]);
  useFeed(light, props);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const ring = ringFor(box.w, box.h);

  const go = (next: Page) => props.onPage(next);
  let key: string;
  let view;
  if (talk) {
    key = 'talk';
    view = (
      <Talk
        talk={talk}
        light={light}
        ring={ring}
        flipFrom={flip}
        onStop={props.onStop}
        onRetry={props.onRetry}
        onPressTalk={props.onPressTalk}
        onReleaseTalk={props.onReleaseTalk}
      />
    );
  } else if (page.name === 'enrol') {
    key = page.first ? 'enrol-first' : 'enrol';
    view = (
      <Enrol
        enrol={enrol}
        first={!!page.first}
        light={light}
        ring={Math.round(ring * 0.7)}
        onBegin={props.onEnrolBegin}
        onNext={props.onEnrolNext}
        onCancel={props.onEnrolCancel}
        onDone={() => props.onEnrolDone(!!page.first)}
      />
    );
  } else if (page.name === 'history') {
    key = 'history';
    view = (
      <History
        list={history}
        dark={dark}
        paused={reduced}
        onBack={() => go({ name: 'start' })}
        onOpen={(id) => go({ name: 'transcript', id })}
        onDemo={props.onDemo}
        onCopy={props.onCopy}
        onDelete={props.onDelete}
        onRetryRecap={props.onRetryRecap}
      />
    );
  } else if (page.name === 'transcript') {
    key = `transcript-${page.id}`;
    view = (
      <Transcript
        c={history.find((c) => c.id === page.id)}
        dark={dark}
        paused={reduced}
        onBack={() => go({ name: 'history' })}
        onCopy={props.onCopy}
        onDelete={props.onDelete}
        onRetryRecap={props.onRetryRecap}
      />
    );
  } else {
    key = 'start';
    view = (
      <Start
        setup={setup}
        set={props.onSetup}
        light={light}
        paused={reduced}
        enrol={enrol}
        youChoices={props.youChoices}
        themChoices={props.themChoices}
        voiceChoices={props.voiceChoices}
        toneChoices={props.toneChoices}
        onStart={(rect) => {
          setFlip(rect);
          props.onStart();
        }}
        onHistory={() => go({ name: 'history' })}
        onEnrol={() => go({ name: 'enrol' })}
        onDeleteVoice={props.onEnrolDelete}
      />
    );
  }

  return (
    <div ref={root} className="vp" data-theme={dark ? 'dark' : 'light'} data-reduced={reduced ? '' : undefined}>
      <style>{(IS_DOM ? PAGE_CSS : '') + fonts + CSS}</style>
      <Aurora light={light} />
      <Presence id={key} exitMs={160} className="vp-views">
        {view}
      </Presence>
    </div>
  );
}
