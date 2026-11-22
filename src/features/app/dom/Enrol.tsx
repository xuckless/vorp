// Voice setup: the owner reads three sentences so Vorp knows their voice. On first launch it opens
// as a prompt that can be skipped. The ring tells the state: working while the model loads and while
// it learns, hearing you while you read, a pulse when done. Ported from the owner's Vorp design
// (the-wallpaper-project src/vorp/pages.tsx, Enrol), driven by the app's enrolment controller.

import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { EnrolmentErrorKind } from '@/features/enrolment/enrolment';
import { Back, Presence, Ring, type Light, type Mood, type Phase } from '@/ui/dom';

import type { EnrolModel } from '../model';

const ERROR: Record<EnrolmentErrorKind, string> = {
  tooShort: 'That was a little short. Read the whole sentence, then try again.',
  micDenied: 'Vorp needs the microphone. Allow it in the address bar, then try again.',
  mic: 'The microphone stopped. Check it’s connected, then try again.',
  model: 'Vorp couldn’t learn your voice this time. Try again.',
};

/** The ring's phase for an enrolment status. */
export function enrolPhase(enrol: EnrolModel): Phase {
  switch (enrol.status) {
    case 'recording':
      return 'hearing';
    case 'loading':
    case 'computing':
      return 'translating';
    case 'enrolled':
      return 'speaking';
    default:
      return 'listening';
  }
}

export function Enrol({
  enrol,
  first,
  light,
  ring,
  onBegin,
  onNext,
  onCancel,
  onDone,
}: {
  enrol: EnrolModel;
  /** First launch: a short prompt first, which the owner can skip. */
  first: boolean;
  light: Light;
  ring: number;
  onBegin: () => void;
  onNext: () => void;
  onCancel: () => void;
  /** Leave: done, skipped or back. */
  onDone: () => void;
}) {
  // The first-launch prompt is this page's own step before the app's enrolment starts.
  const [intro, setIntro] = useState(first);
  // Leaving mid-way drops the recordings and closes the microphone (only on leaving: the callback's
  // identity may change with every render, and on native it crosses a bridge).
  const cancel = useRef(onCancel);
  useEffect(() => {
    cancel.current = onCancel;
  }, [onCancel]);
  useEffect(() => () => cancel.current(), []);

  const { status } = enrol;
  const shown = intro ? 'intro' : status;
  const phase = intro ? 'listening' : enrolPhase(enrol);
  const mood: Mood | undefined = status === 'failed' ? 'sad' : status === 'unavailable' ? 'unsure' : undefined;
  const sentence = `Sentence ${enrol.index + 1} of ${enrol.count}`;
  const last = enrol.index + 1 >= enrol.count;

  let line: ReactNode = null;
  let count = '';
  let message = false;
  let action: ReactNode;
  if (intro) {
    count = 'Read three short sentences, about twenty seconds. Then Vorp knows when it’s you speaking and when it’s them. Your voice stays on this device.';
    message = true;
    action = (
      <>
        <button className="vp-primary" onClick={() => setIntro(false)}>
          Set up my voice
        </button>
        <button className="vp-link vp-skip" onClick={onDone}>
          Not now
        </button>
      </>
    );
  } else
    switch (status) {
      case 'loading':
        line = <span className="vp-mute">Loading the voice model</span>;
        action = (
          <button className="vp-primary" disabled>
            Start reading
          </button>
        );
        break;
      case 'unavailable':
        line = 'Voice setup isn’t available here';
        count = 'This browser can’t run Vorp’s voice model. Vorp still interprets; it just can’t tell your voice from theirs.';
        message = true;
        action = (
          <button className="vp-primary" onClick={onDone}>
            Continue
          </button>
        );
        break;
      case 'notEnrolled':
      case 'recording': {
        const reading = status === 'recording';
        line = (
          <span key={enrol.index}>
            {enrol.sentence.split(' ').map((w, i) => (
              <span key={i} className={`vp-read-word ${reading ? 'read' : ''}`}>
                {w}{' '}
              </span>
            ))}
          </span>
        );
        // Too short keeps you on the same sentence, recording again; the line says why.
        count = reading && enrol.error === 'tooShort' ? ERROR.tooShort : sentence;
        action = reading ? (
          <button className="vp-primary" onClick={onNext}>
            {last ? 'Done reading' : 'Next sentence'}
          </button>
        ) : (
          <button className="vp-primary" onClick={onBegin}>
            Start reading
          </button>
        );
        break;
      }
      case 'computing':
        line = <span className="vp-mute">Learning your voice</span>;
        count = 'All three read';
        action = (
          <button className="vp-primary" disabled>
            Learning
          </button>
        );
        break;
      case 'enrolled':
        line = 'That’s you. Vorp will know your voice from now on.';
        action = (
          <button className="vp-primary" onClick={onDone}>
            {first ? 'Start talking' : 'Done'}
          </button>
        );
        break;
      case 'failed':
        line = ERROR[enrol.error ?? 'model'];
        count = sentence;
        message = true;
        action = (
          <button className="vp-primary" onClick={onBegin}>
            Try again
          </button>
        );
        break;
    }

  return (
    <div className="vp-page vp-enrol">
      <header className="vp-bar">{first ? null : <Back onClick={onDone} />}</header>
      <h1>{intro ? 'Let Vorp learn your voice' : 'Your voice'}</h1>
      {!intro && status !== 'unavailable' && (
        <p className="vp-mute vp-lede">Read each sentence out loud. Vorp learns your voice so it knows when you’re the one speaking. It stays on this device.</p>
      )}
      <div className={`vp-enrol-ring ${status === 'enrolled' && !intro ? 'vp-pulse' : ''}`}>
        <Ring light={light} phase={phase} who="you" size={ring} mood={intro ? undefined : mood} />
      </div>
      <Presence id={`${shown}-${enrol.index}-${enrol.error ?? ''}`} exitMs={160} className="vp-enrol-text">
        {line ? <p className={`vp-read ${message ? 'vp-read-msg' : ''}`}>{line}</p> : null}
        {count ? <p className="vp-mute vp-count">{count}</p> : null}
      </Presence>
      <div className="vp-start-slot vp-enrol-actions">{action}</div>
    </div>
  );
}
