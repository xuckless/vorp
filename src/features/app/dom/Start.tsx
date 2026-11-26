// The start page: settings behind the top-left icon button, the logo, History top right; the
// interpreter in its halo of thinking orbs, the line, and the languages card with Pair a phone (the
// booth's mode) and, under More, the one-phone setup and Start. Ported from
// the owner's Vorp design (the-wallpaper-project src/vorp/pages.tsx, Start and SettingsButton).

import { useEffect, useRef, useState } from 'react';

import { Beam, Mark, OrbHalo, Segmented, Select, Toggle, type Light } from '@/ui/dom';

import type { Choice, EnrolModel, SetupModel } from '../model';

type Set = (patch: Partial<SetupModel>) => void;

const APPEARANCE = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

/** Your voiceprint: set it up, redo it, or delete it. Delete asks once more, in place, before it goes.
 *  It deletes the owner's voiceprint only, never Vorp's own (the echo filter's). */
function VoiceRow({ enrol, onEnrol, onDelete }: { enrol: EnrolModel; onEnrol: () => void; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 4000);
    return () => clearTimeout(t);
  }, [confirm]);
  const unavailable = enrol.status === 'unavailable';
  const line = unavailable
    ? 'Voice setup isn’t available here.'
    : confirm
      ? 'Vorp will forget your voice. You can set it up again.'
      : enrol.enrolled
        ? 'Vorp knows when it’s you speaking.'
        : 'Read three sentences so Vorp knows it’s you.';
  return (
    <div className="vp-row">
      <span>
        Your voice
        <small className="vp-mute">{line}</small>
      </span>
      {unavailable ? null : (
        <span className="vp-row-actions">
          {enrol.enrolled && !confirm && (
            <button className="vp-text-btn vp-mute" onClick={() => setConfirm(true)}>
              Delete
            </button>
          )}
          {confirm ? (
            <>
              <button className="vp-text-btn vp-mute" onClick={() => setConfirm(false)}>
                Keep
              </button>
              <button
                className="vp-text-btn vp-danger"
                onClick={() => {
                  setConfirm(false);
                  onDelete();
                }}
              >
                Delete
              </button>
            </>
          ) : (
            <button className="vp-text-btn" disabled={enrol.status === 'loading'} onClick={onEnrol}>
              {enrol.enrolled ? 'Redo' : 'Set up'}
            </button>
          )}
        </span>
      )}
    </div>
  );
}

/** The settings, stowed behind an icon button; the panel grows out of the button and shrinks back into it. */
function SettingsButton({
  setup: s,
  set,
  enrol,
  voiceChoices,
  toneChoices,
  onEnrol,
  onDeleteVoice,
}: {
  setup: SetupModel;
  set: Set;
  enrol: EnrolModel;
  voiceChoices: readonly Choice[];
  toneChoices: readonly Choice[];
  onEnrol: () => void;
  onDeleteVoice: () => void;
}) {
  const [state, setState] = useState<'closed' | 'open' | 'closing'>('closed');
  const wrap = useRef<HTMLDivElement>(null);
  const close = () => setState((v) => (v === 'open' ? 'closing' : v));
  useEffect(() => {
    if (state === 'closing') {
      const t = setTimeout(() => setState('closed'), 160);
      return () => clearTimeout(t);
    }
    if (state !== 'open') return;
    const shut = () => setState((v) => (v === 'open' ? 'closing' : v));
    const down = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) shut();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !wrap.current?.querySelector('.vp-pop')) shut();
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [state]);
  const open = state === 'open';
  return (
    <div className="vp-settings" ref={wrap}>
      <button className={`vp-icon-btn ${open ? 'on' : ''}`} aria-label="Settings" aria-expanded={open} onClick={() => (open ? close() : setState('open'))}>
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M4 7h8M16 7h2M4 15h2M10 15h8" />
          <circle cx="14" cy="7" r="2" />
          <circle cx="8" cy="15" r="2" />
        </svg>
      </button>
      {state !== 'closed' && (
        <div className={`vp-panel vp-frost vp-frost-thick ${state === 'closing' ? 'vp-panel-out' : ''}`} role="dialog" aria-label="Settings">
          <h2>Settings</h2>
          <div className="vp-row">
            <span>Voice</span>
            <Select label="Voice" value={s.voice} options={voiceChoices} onChange={(voice) => set({ voice })} />
          </div>
          <div className="vp-row">
            <span>Tone</span>
            <Segmented label="Tone" value={s.tone} options={toneChoices} onChange={(tone) => set({ tone })} />
          </div>
          <div className="vp-row">
            <span>
              Cultural notes
              <small className="vp-mute">A written note when an idiom doesn’t carry over.</small>
            </span>
            <Toggle label="Cultural notes" on={s.notes} onChange={(notes) => set({ notes })} />
          </div>
          <div className="vp-row">
            <span>
              Hands-free
              <small className="vp-mute">Vorp listens by itself. Off, it listens only while you hold the button.</small>
            </span>
            <Toggle label="Hands-free" on={s.handsFree} onChange={(handsFree) => set({ handsFree })} />
          </div>
          <div className="vp-row">
            <span>
              Recap
              <small className="vp-mute">A short summary in both languages when you stop.</small>
            </span>
            <Toggle label="Recap" on={s.recap} onChange={(recap) => set({ recap })} />
          </div>
          <VoiceRow enrol={enrol} onEnrol={onEnrol} onDelete={onDeleteVoice} />
          <div className="vp-row">
            <span>
              Sound
              <small className="vp-mute">AirPods when they’re connected, otherwise the speaker.</small>
            </span>
          </div>
          <div className="vp-row">
            <span>Appearance</span>
            <Segmented label="Appearance" value={s.appearance} options={APPEARANCE} onChange={(appearance) => set({ appearance })} />
          </div>
        </div>
      )}
    </div>
  );
}

export function Start({
  setup: s,
  set,
  light,
  paused,
  enrol,
  youChoices,
  themChoices,
  voiceChoices,
  toneChoices,
  onStart,
  onPair,
  onHistory,
  onEnrol,
  onDeleteVoice,
}: {
  setup: SetupModel;
  set: Set;
  light: Light;
  paused: boolean;
  enrol: EnrolModel;
  youChoices: readonly Choice[];
  themChoices: readonly Choice[];
  voiceChoices: readonly Choice[];
  toneChoices: readonly Choice[];
  onStart: (blob: DOMRect | null) => void;
  /** Pair by QR: the other person joins on their own phone. */
  onPair: () => void;
  onHistory: () => void;
  onEnrol: () => void;
  onDeleteVoice: () => void;
}) {
  const blob = useRef<HTMLDivElement>(null);
  // Visual only: whether the one-phone setup (their language, detection, Start) is showing.
  const [more, setMore] = useState(false);
  // The ⇄ swap is stubbed out (owner, 22 November 2026): "You" is always the owner's own language.
  // Its design lives in @/ui/dom's Swapper and is gated by SHOW_SWAP; nothing renders it here.
  return (
    <div className="vp-page vp-start">
      <header className="vp-bar vp-bar-3">
        <SettingsButton setup={s} set={set} enrol={enrol} voiceChoices={voiceChoices} toneChoices={toneChoices} onEnrol={onEnrol} onDeleteVoice={onDeleteVoice} />
        <Mark light={light} />
        <button className="vp-btn vp-frost" onClick={onHistory}>
          <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.8 9a6.2 6.2 0 1 0 1.8-4.4L2.8 6.4" />
            <path d="M2.8 3v3.4h3.4M9 5.6V9l2.4 1.6" />
          </svg>
          History
        </button>
      </header>

      <div className="vp-spacer-before" />
      <div className="vp-start-main">
        <section className="vp-hero">
          <OrbHalo dark={light.dark} paused={paused} blob={blob} />
          <h1>Speak your language. Vorp says it in theirs.</h1>
        </section>

        <div className="vp-start-panel">
          <section className="vp-group vp-frost">
            <Beam radius={22} dark={light.dark} />
            <div className="vp-row">
              <span>You speak</span>
              <Select label="Your language" value={s.you} options={youChoices} search onChange={(you) => set({ you })} />
            </div>
            {more && (
              <>
                <div className="vp-row vp-stagger" style={{ animationDelay: '0ms' }}>
                  <span>They speak</span>
                  <Select label="Their language" value={s.them} options={themChoices} search onChange={(them) => set({ them })} />
                </div>
                <div className="vp-row vp-stagger" style={{ animationDelay: '30ms' }}>
                  <span>
                    Detect their language
                    <small className="vp-mute">Switches to whatever they actually speak.</small>
                  </span>
                  <Toggle label="Detect their language" on={s.detect} onChange={(detect) => set({ detect })} />
                </div>
              </>
            )}
          </section>

          <div className="vp-start-slot vp-start-actions">
            {/* Pair by QR, the booth's mode: the other person joins on their own phone and picks their language there. */}
            <button className="vp-primary" onClick={onPair}>
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2.5" y="2.5" width="6" height="6" rx="1.6" />
                <rect x="11.5" y="2.5" width="6" height="6" rx="1.6" />
                <rect x="2.5" y="11.5" width="6" height="6" rx="1.6" />
                <path d="M11.5 11.5h2.5v2.5M17.5 11.5v.01M11.5 17.5h.01M14.5 17.5h3v-3" />
              </svg>
              Pair a phone
            </button>
            {/* One phone between two people: their language, detection and Start, one tap away. */}
            {more ? (
              <button className="vp-secondary vp-frost vp-stagger" style={{ animationDelay: '60ms' }} onClick={() => onStart(blob.current?.getBoundingClientRect() ?? null)}>
                Start on this phone
              </button>
            ) : (
              <button className="vp-text-btn vp-mute" aria-expanded={false} onClick={() => setMore(true)}>
                More
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="vp-spacer-after" />
    </div>
  );
}
