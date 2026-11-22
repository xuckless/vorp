// The paired conversation (Pair by QR), on either phone, ported from the owner's Vorp design
// (the-wallpaper-project src/vorp/PairTalk.tsx). The other person is real and remote, so the screen
// is a short feed of what each of you said, each card carrying where it is: arriving live,
// translating, waiting its turn, playing, heard. Everything shown comes from `PairTalkModel`;
// the only state here is visual (the arrival ripple, the end card's countdown).

import { useEffect, useState, type PointerEvent, type ReactNode } from 'react';

import { guestCopy, type GuestKey } from '@/config/pair-copy';
import { nativeName } from '@/config/languages';
import { MOOD, PROBLEM } from '@/features/app/dom/Talk';
import { ProblemCard } from '@/ui/dom/Caption';
import { Presence, Words } from '@/ui/dom/controls';
import { StopButton } from '@/ui/dom/Glow';
import type { Light } from '@/ui/dom/light';
import { Mark } from '@/ui/dom/Mark';
import { Ring } from '@/ui/dom/Ring';

import { pairLight, type FeedCard, type PairTalkModel, type PeerSignal } from '../model';

/** The other phone, in the header: their language in its own name, and whether their phone is with us. */
function PeerSign({ peer, lang, label }: { peer: PeerSignal; lang: string; label: string }) {
  return (
    <span className={`vp-peer ${peer}`} aria-live="polite">
      <span className="vp-peer-signal" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>
        {label}
        <small className="vp-mute">{nativeName(lang)}</small>
      </span>
    </span>
  );
}

const Pause = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <rect x="2.5" y="2" width="2.4" height="8" rx="1" fill="currentColor" />
    <rect x="7.1" y="2" width="2.4" height="8" rx="1" fill="currentColor" />
  </svg>
);
const Tick = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7.4 5.8 10 11 4.2" />
  </svg>
);
export const Speaker = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 5.2h2.2L7.4 2.6v8.8L4.2 8.8H2zM9.6 4.8a3 3 0 0 1 0 4.4" />
  </svg>
);

/** Words that light up as they're spoken: a mask sweeps each word from grey to ink. */
function Spoken({ text, p }: { text: string; p: number }) {
  const words = text.split(/ +/).filter(Boolean);
  const lit = p * words.length;
  return (
    <>
      {words.map((w, i) => (
        <span key={i} className="vp-lit" style={{ ['--lit' as string]: `${Math.max(0, Math.min(1, lit - i)) * 100}%` }}>
          {w}{' '}
        </span>
      ))}
    </>
  );
}

function Card({ c, t }: { c: FeedCard; t: (k: GuestKey) => string }) {
  const { mine, state, progress } = c;
  // Theirs, once translated, shows the translation big and their words small; yours the reverse.
  const translated = !mine && c.translation !== '' && (state === 'queued' || state === 'playing' || state === 'done');
  let label: ReactNode = null;
  if (state === 'live' && !mine)
    label = (
      <>
        <span className="vp-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        {t('theyreTalking')}
      </>
    );
  else if (state === 'translating') label = t('translating');
  else if (state === 'queued' || state === 'queuedLive')
    label = (
      <>
        <Pause />
        {t('waitsForYou')}
      </>
    );
  else if (state === 'waitingThem')
    label = (
      <>
        <Pause />
        {t('waitsForThem')}
      </>
    );
  else if (state === 'delivering')
    label = (
      <>
        <Speaker />
        {t('playingThere')}
      </>
    );
  else if (state === 'heard')
    label = (
      <span className="vp-heard">
        <Tick />
        {t('heard')}
      </span>
    );
  const big = translated ? <Spoken text={c.translation} p={state === 'playing' ? progress : state === 'done' ? 1 : 0} /> : <Words text={c.source} />;
  const small = mine ? (state === 'live' || state === 'translating' ? null : c.translation || null) : translated ? c.source : null;
  return (
    <div className={`vp-feed-card vp-frost ${mine ? 'you' : 'them'} ${state}`}>
      {label && (
        <Presence id={state} exitMs={140} className="vp-feed-label">
          <span>{label}</span>
        </Presence>
      )}
      <Presence id={translated ? 'tr' : 'src'} exitMs={180} className="vp-feed-body">
        <p className="vp-feed-big">{big}</p>
        {small && <p className="vp-feed-small vp-mute">{small}</p>}
      </Presence>
      {state === 'delivering' && (
        <span className="vp-feed-progress" aria-hidden="true">
          <i style={{ transform: `scaleX(${progress})` }} />
        </span>
      )}
    </div>
  );
}

/** The booth loop: the host's end of a session. Saved, then a fresh code for the next visitor, counting down. */
function EndCard({ saved, recap, seconds, onNext, onNotNow }: { saved: boolean; recap: boolean; seconds: number; onNext: () => void; onNotNow: () => void }) {
  // The countdown is only the picture; the pairing's own timer makes the new code.
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return (
    <div className="vp-card vp-frost vp-card-problem vp-end" role="status">
      <div className="vp-card-face">
        <p className="vp-card-title">{saved ? 'Conversation saved' : 'Conversation ended'}</p>
        <p className="vp-card-small vp-mute">{saved ? (recap ? 'It’s in History, with the recap.' : 'It’s in History.') : 'Nothing was said, so nothing was saved.'}</p>
        <div className="vp-next">
          <svg className="vp-next-ring" viewBox="0 0 36 36" aria-hidden="true">
            <circle cx="18" cy="18" r="15" className="track" />
            <circle cx="18" cy="18" r="15" className="fill" style={{ strokeDashoffset: `${(1 - left / seconds) * 94.25}` }} />
          </svg>
          <span>
            New code for the next person in <strong>{Math.max(0, left)}</strong>
          </span>
        </div>
        <div className="vp-end-actions">
          <button className="vp-btn vp-frost" onClick={onNext}>
            Show it now
          </button>
          <button className="vp-link" onClick={onNotNow}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

export function PairTalk({
  talk,
  light,
  ring,
  boothSeconds,
  onStop,
  onPressTalk,
  onReleaseTalk,
  onSound,
  onContinue,
  onNextVisitor,
  onNotNow,
  onRetry,
}: {
  talk: PairTalkModel;
  light: Light;
  ring: number;
  boothSeconds: number;
  onStop: () => void;
  onPressTalk: () => void;
  onReleaseTalk: () => void;
  onSound: () => void;
  /** Guest: Continue, after they ended it. */
  onContinue: () => void;
  /** Host, booth loop: a fresh code now. */
  onNextVisitor: () => void;
  /** Host: back to Start. */
  onNotNow: () => void;
  /** This phone's interpreter failed: try it again. */
  onRetry: () => void;
}) {
  const guest = talk.role === 'guest';
  const g = guestCopy(guest ? talk.you : 'en');
  const t = g.t;
  // The ring lights up with a ripple as the conversation arrives.
  const [arriving, setArriving] = useState(true);
  useEffect(() => {
    const r = setTimeout(() => setArriving(false), 900);
    return () => clearTimeout(r);
  }, []);
  const [pressing, setPressing] = useState(false);
  const held = pressing || talk.held;
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

  const status = talk.status ? t(talk.status) : '';
  const aside =
    talk.aside === 'locked' ? t('lockedAside') : talk.aside === 'peerAway' && !guest ? 'Their phone lost its connection. Waiting for it to come back.' : null;
  const lit = pairLight(talk);

  let body: ReactNode;
  // Ended for the guest, or this phone's own link dropped (either side): one card, Continue.
  // The host reads English, with History in place of the guest's "ask for a new code".
  const dropped = !!talk.end?.dropped;
  if (talk.end?.kind === 'guest' || (talk.end?.kind === 'host' && dropped)) {
    const title = !dropped ? t('endedTitle') : guest ? t('droppedTitle') : 'Your connection dropped';
    const text = !dropped ? t('endedBody') : guest ? t('droppedBody') : 'The conversation stopped on this phone. What was said is in History.';
    body = (
      <div className="vp-card vp-frost vp-card-problem" role="status">
        <div className="vp-card-face">
          <p className="vp-card-title">{title}</p>
          <p className="vp-card-small vp-mute">{text}</p>
          <button className="vp-btn vp-frost vp-card-action" onClick={guest ? onContinue : onNotNow}>
            {t('continue')}
          </button>
        </div>
      </div>
    );
  } else if (talk.end?.kind === 'host')
    body = <EndCard saved={talk.end.saved} recap={talk.end.recap} seconds={boothSeconds} onNext={onNextVisitor} onNotNow={onNotNow} />;
  else if (talk.problem) {
    const p = PROBLEM[talk.problem];
    body = <ProblemCard {...p} onAction={onRetry} />;
  } else
    body = (
      <>
        {talk.cards.map((c) => (
          <div key={c.id} className="vp-feed-slot">
            <Card c={c} t={t} />
            {c.shelf ? <div className="vp-feed-shelf vp-mute">{t('moreWaiting').replace('{n}', String(c.shelf))}</div> : null}
          </div>
        ))}
        {aside && <p className="vp-note vp-feed-aside">{aside}</p>}
      </>
    );

  return (
    <div className="vp-talk vp-pair-talk" lang={g.lang} dir={g.dir}>
      <header className="vp-bar">
        <Mark light={light} />
        <PeerSign peer={talk.peer} lang={talk.them} label={t('theirPhone')} />
      </header>
      <div className={`vp-stage ${arriving ? 'vp-arrive' : ''}`}>
        <Ring light={light} phase={lit.phase} who={talk.who} size={Math.round(ring * 0.66)} rest={talk.rest} mood={talk.problem ? MOOD[talk.problem] : undefined} />
        <Presence id={status} className="vp-status">
          <span className="vp-mute" aria-live="polite">
            {status}
          </span>
        </Presence>
      </div>
      <div className="vp-feed" aria-live="polite">
        {body}
        {talk.sound && (
          <button className="vp-sound vp-frost" onClick={onSound}>
            <Speaker />
            <span>
              <strong>{t('soundTitle')}</strong>
              <small className="vp-mute">{t('soundBody')}</small>
            </span>
          </button>
        )}
      </div>
      <footer className="vp-talk-foot">
        {!talk.end && (
          <div className={`vp-talk-row ${talk.handsFree ? 'solo' : ''}`}>
            {!talk.handsFree && (
              <div className={`vp-hold-host vp-frost ${held ? 'held' : ''} ${talk.canHold ? '' : 'off'}`}>
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
            )}
            <StopButton dark={light.dark} onClick={onStop} label="End for both" />
          </div>
        )}
      </footer>
    </div>
  );
}
