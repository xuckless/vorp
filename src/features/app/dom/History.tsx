// History: "Watch the demo" and the conversations kept on this device. On big screens one centred
// box, the list on the left and the open conversation's transcript and recap on the right; on
// phones list → transcript. Ported from the owner's Vorp design (the-wallpaper-project
// src/vorp/pages.tsx, History, TranscriptBody, TranscriptActions, EmptyHistory).

import { useEffect, useState } from 'react';

import { Back, Blob, Presence, WritingOrb } from '@/ui/dom';

import type { HistoryItem } from '../model';

const WIDE = '(min-width: 960px) and (min-height: 600px)';

/** True on screens with room for two columns (matches the CSS breakpoint). */
function useWide() {
  const [wide, setWide] = useState(() => matchMedia(WIDE).matches);
  useEffect(() => {
    const m = matchMedia(WIDE);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

function DemoRow({ onDemo }: { onDemo: () => void }) {
  return (
    <button className="vp-demo-row vp-frost vp-stagger" style={{ animationDelay: '0ms' }} onClick={onDemo}>
      <Blob size={44} mood="happy" />
      <span>
        Watch the demo
        <small className="vp-mute">Asking for a bus stop, English and French</small>
      </span>
    </button>
  );
}

function Rows({ list, selected, onOpen, onDemo }: { list: readonly HistoryItem[]; selected?: string; onOpen: (id: string) => void; onDemo: () => void }) {
  return (
    <>
      <DemoRow onDemo={onDemo} />
      <div className="vp-list">
        {list.map((c, i) => (
          <button
            key={c.id}
            className={`vp-list-row vp-frost vp-stagger ${selected === c.id ? 'on' : ''}`}
            aria-current={selected === c.id ? 'true' : undefined}
            style={{ animationDelay: `${(i + 1) * 30}ms` }}
            onClick={() => onOpen(c.id)}
          >
            <span className="vp-list-top">
              <span>{c.title}</span>
              <span className="vp-mute">{c.when}</span>
            </span>
            <span className="vp-mute vp-list-line">{c.line}</span>
          </button>
        ))}
      </div>
    </>
  );
}

/** Before the first conversation: the blob, a line on what will be here, and the demo to try meanwhile. */
function EmptyHistory({ onDemo }: { onDemo: () => void }) {
  return (
    <div className="vp-empty">
      <Blob size={72} mood="sleepy" tint="rest" />
      <p className="vp-empty-title">No conversations yet</p>
      <p className="vp-mute vp-empty-line">They’ll show up here after you talk, with a recap in both languages. They stay on this device.</p>
      <button className="vp-btn vp-frost" onClick={onDemo}>
        Watch the demo
      </button>
    </div>
  );
}

/** Copy and Delete for a conversation. Copy confirms with a pulse; Delete asks once more, in place. */
function TranscriptActions({ onCopy, onDelete }: { onCopy: () => void; onDelete: () => void }) {
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!copied && !confirm) return;
    const t = setTimeout(
      () => {
        setCopied(false);
        setConfirm(false);
      },
      confirm ? 4000 : 1600,
    );
    return () => clearTimeout(t);
  }, [copied, confirm]);
  return (
    <div className="vp-actions">
      <button
        className={`vp-btn vp-frost ${copied ? 'vp-pulse' : ''}`}
        onClick={() => {
          onCopy();
          setCopied(true);
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          {copied ? (
            <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
          ) : (
            <>
              <rect x="5.5" y="5.5" width="8" height="8" rx="2" />
              <path d="M10.5 3.5v-.5a1.5 1.5 0 0 0-1.5-1.5H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 9.5h.5" />
            </>
          )}
        </svg>
        {copied ? 'Copied' : 'Copy'}
      </button>
      {confirm ? (
        <>
          <button className="vp-btn vp-frost" onClick={() => setConfirm(false)}>
            Keep
          </button>
          <button className="vp-btn vp-frost vp-danger" onClick={onDelete}>
            Delete for good
          </button>
        </>
      ) : (
        <button className="vp-btn vp-frost" onClick={() => setConfirm(true)}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 4.5h11M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4 4.5l.6 8.1a1.5 1.5 0 0 0 1.5 1.4h3.8a1.5 1.5 0 0 0 1.5-1.4l.6-8.1" />
          </svg>
          Delete
        </button>
      )}
    </div>
  );
}

export type TranscriptCallbacks = {
  onCopy: (id: string) => void;
  onDelete: (id: string) => void;
  onRetryRecap: (id: string) => void;
};

function TranscriptBody({ c, dark, paused, onCopy, onDelete, onRetryRecap }: { c: HistoryItem; dark: boolean; paused: boolean } & TranscriptCallbacks) {
  const { recap } = c;
  return (
    <>
      <div className="vp-transcript-head">
        <div>
          <h1>{c.title}</h1>
          <p className="vp-mute vp-lede">{c.when}</p>
        </div>
        <TranscriptActions onCopy={() => onCopy(c.id)} onDelete={() => onDelete(c.id)} />
      </div>
      <div className="vp-bubbles">
        {c.bubbles.length === 0 ? <p className="vp-mute">Nothing was said.</p> : null}
        {c.bubbles.map((t, i) => (
          <div key={i} className={`vp-bubble vp-frost vp-stagger ${t.who ?? 'you'}`} style={{ animationDelay: `${i * 30}ms` }}>
            <p>{t.source}</p>
            {t.translation ? <p className="vp-mute">{t.translation}</p> : null}
            {t.note ? <p className="vp-bubble-note">{t.note}</p> : null}
          </div>
        ))}
      </div>
      {recap.status === 'none' ? null : (
        <>
          <h2>Recap</h2>
          <Presence id={recap.status} exitMs={160} className="vp-recap-slot">
            {recap.status === 'writing' ? (
              <p className="vp-recap-status vp-mute">
                <WritingOrb dark={dark} paused={paused} />
                Writing the recap
              </p>
            ) : recap.status === 'failed' ? (
              <p className="vp-recap-status vp-mute">
                The recap couldn’t be written.
                <button className="vp-text-btn" onClick={() => onRetryRecap(c.id)}>
                  Try again
                </button>
              </p>
            ) : (
              recap.texts.map((r) => (
                <p key={r.language} className="vp-recap" lang={r.code}>
                  {r.text}
                </p>
              ))
            )}
          </Presence>
        </>
      )}
    </>
  );
}

export function History({
  list,
  dark,
  paused,
  onBack,
  onOpen,
  onDemo,
  ...callbacks
}: {
  list: readonly HistoryItem[];
  dark: boolean;
  paused: boolean;
  onBack: () => void;
  onOpen: (id: string) => void;
  onDemo: () => void;
} & TranscriptCallbacks) {
  const wide = useWide();
  const [selectedId, setSelected] = useState<string | undefined>(list[0]?.id);
  const selected = list.find((c) => c.id === selectedId) ?? list[0];
  if (!selected)
    return (
      <div className="vp-page">
        <header className="vp-bar">
          <Back onClick={onBack} />
        </header>
        <h1>History</h1>
        <EmptyHistory onDemo={onDemo} />
      </div>
    );
  if (!wide)
    return (
      <div className="vp-page">
        <header className="vp-bar">
          <Back onClick={onBack} />
        </header>
        <h1>History</h1>
        <Rows list={list} onOpen={onOpen} onDemo={onDemo} />
        <p className="vp-mute vp-foot-note">Kept on this device only. Audio is never stored.</p>
      </div>
    );
  // Big screens: one centred box, the conversations on the left, the open transcript on the right.
  return (
    <div className="vp-page vp-history-wide">
      <header className="vp-bar">
        <Back onClick={onBack} />
      </header>
      <div className="vp-split">
        <aside className="vp-split-list">
          <h1>History</h1>
          <Rows list={list} selected={selected.id} onOpen={setSelected} onDemo={onDemo} />
          <p className="vp-mute vp-foot-note">Kept on this device only. Audio is never stored.</p>
        </aside>
        <section className="vp-split-pane vp-frost" aria-live="polite">
          <Presence id={selected.id} exitMs={160} className="vp-split-presence">
            <div className="vp-split-scroll">
              <TranscriptBody c={selected} dark={dark} paused={paused} {...callbacks} />
            </div>
          </Presence>
        </section>
      </div>
    </div>
  );
}

export function Transcript({
  c,
  dark,
  paused,
  onBack,
  onDelete,
  ...callbacks
}: { c: HistoryItem | undefined; dark: boolean; paused: boolean; onBack: () => void } & TranscriptCallbacks) {
  return (
    <div className="vp-page">
      <header className="vp-bar">
        <Back onClick={onBack} label="History" />
      </header>
      {c ? (
        <TranscriptBody
          c={c}
          dark={dark}
          paused={paused}
          onDelete={(id) => {
            onDelete(id);
            onBack();
          }}
          {...callbacks}
        />
      ) : null}
    </div>
  );
}
