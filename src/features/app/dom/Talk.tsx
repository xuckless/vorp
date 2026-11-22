// The conversation: the logo, the ring with the interpreter in it, one status line, the caption
// card for the turn in the light, and Hold to talk (the owner's only) beside Stop. Ported from the
// owner's Vorp design (the-wallpaper-project src/vorp/Talk.tsx); everything shown comes from
// `TalkModel`, built from the real session.

import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';

import type { SessionErrorKind } from '@/core/session';
import { CaptionCard, Glow, Mark, Presence, ProblemCard, QuietCard, Ring, StopButton, Words, type Light, type Mood } from '@/ui/dom';

import type { TalkModel } from '../model';

const PROBLEM: Record<SessionErrorKind, { title: string; body: string; action: string }> = {
  micDenied: { title: 'Vorp needs the microphone', body: 'Allow it in the address bar, then try again.', action: 'Try again' },
  mic: { title: 'The microphone stopped', body: 'Check it’s connected and nothing else is using it.', action: 'Try again' },
  token: { title: 'Vorp couldn’t start', body: 'Check your connection and try again.', action: 'Try again' },
  socket: { title: 'The connection dropped', body: 'Vorp couldn’t get it back. What was said so far is saved in History.', action: 'Reconnect' },
  timeLimit: { title: 'That’s ten minutes', body: 'Conversations stop at ten minutes. Start a new one to keep going; this one is saved in History.', action: 'Start a new one' },
};

const MOOD: Record<SessionErrorKind, Mood> = { micDenied: 'unsure', mic: 'sad', token: 'sad', socket: 'sad', timeLimit: 'sleepy' };

export function Talk({
  talk,
  light,
  ring,
  flipFrom,
  onStop,
  onRetry,
  onPressTalk,
  onReleaseTalk,
}: {
  talk: TalkModel;
  light: Light;
  ring: number;
  /** Where the blob was on the start page: it arrives from there on an arc. */
  flipFrom: DOMRect | null;
  onStop: () => void;
  onRetry: () => void;
  onPressTalk: () => void;
  onReleaseTalk: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  // Pressed here, so the button answers at once; the session's `held` follows.
  const [pressing, setPressing] = useState(false);
  const held = pressing || talk.held;
  const live = talk.connection === 'live';
  const problem = talk.problem;

  useLayoutEffect(() => {
    const el = root.current?.querySelector<HTMLElement>('[data-blob]');
    if (!el || !flipFrom || light.reduced) return;
    const to = el.getBoundingClientRect();
    const s = flipFrom.width / to.width;
    const dx = flipFrom.left + flipFrom.width / 2 - (to.left + to.width / 2);
    const dy = flipFrom.top + flipFrom.height / 2 - (to.top + to.height / 2);
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${s})` },
        { transform: `translate(${dx * 0.35 + 40}px, ${dy * 0.55}px) scale(${(s + 1) / 2})`, offset: 0.5 },
        { transform: 'none' },
      ],
      { duration: 560, easing: 'cubic-bezier(.65,0,.35,1)' },
    );
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const press = (e: PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setPressing(true);
    onPressTalk();
  };
  const release = () => {
    if (!pressing) return;
    setPressing(false);
    onReleaseTalk();
  };

  let cardKey = 'quiet';
  let card: ReactNode = <QuietCard>{talk.quiet}</QuietCard>;
  if (problem) {
    cardKey = `p-${problem}`;
    const p = PROBLEM[problem];
    // Retrying connects again; after ten minutes the way on is a new conversation from Start.
    card = <ProblemCard {...p} onAction={problem === 'timeLimit' ? onStop : onRetry} />;
  } else if (talk.card) {
    const c = talk.card;
    cardKey = c.id;
    card = (
      <CaptionCard
        who={c.who}
        heard={<Words text={c.source} />}
        spoken={c.translation}
        source={c.source}
        revealed={c.revealed}
        speaking={c.speaking}
        dark={light.dark}
        reduced={light.reduced}
      />
    );
  } else cardKey = `quiet-${talk.quiet}`;

  const under = talk.aside ?? talk.note;

  return (
    <div className="vp-talk" ref={root}>
      <header className="vp-bar">
        <Mark light={light} />
      </header>
      <div className="vp-stage">
        <Ring light={light} phase={talk.phase} who={talk.who} size={ring} rest={!live} mood={problem ? MOOD[problem] : undefined} />
        <Presence id={live ? `${talk.phase}-${talk.who ?? ''}-${talk.status}` : talk.connection} className="vp-status">
          <span className="vp-mute" aria-live="polite">
            {talk.status}
          </span>
        </Presence>
      </div>
      <div className="vp-captions" aria-live="polite">
        <Presence id={talk.earlier ? `e-${talk.earlier}` : 'none'} className="vp-earlier">
          {talk.earlier ? <p className="vp-mute">{talk.earlier}</p> : null}
        </Presence>
        <Presence id={cardKey} exitMs={200} className="vp-caption">
          {card}
        </Presence>
        <Presence id={under ?? 'none'} className="vp-note-slot">
          {under ? <p className="vp-note">{under}</p> : null}
        </Presence>
      </div>
      <footer className="vp-talk-foot">
        <div className="vp-talk-row">
          <div className={`vp-hold-host vp-frost ${held ? 'held' : ''} ${talk.canHold ? '' : 'off'}`}>
            <Glow level={() => (light.who === 'you' && light.phase === 'hearing' ? light.level : 0)} radius={22} dark={light.dark} />
            <button
              className="vp-hold"
              disabled={!talk.canHold}
              onPointerDown={press}
              onPointerUp={release}
              onPointerCancel={release}
              onKeyDown={(e) => {
                if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && !pressing) {
                  setPressing(true);
                  onPressTalk();
                }
              }}
              onKeyUp={release}
            >
              {held ? 'Release to translate' : 'Hold to talk'}
            </button>
          </div>
          <StopButton dark={light.dark} onClick={onStop} />
        </div>
      </footer>
    </div>
  );
}
