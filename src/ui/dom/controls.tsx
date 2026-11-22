// The design's controls, as DOM: presence (overlapping old and new states), a segmented control,
// a toggle, a dropdown, a back link and word-by-word text. Ported from the owner's Vorp design
// (the-wallpaper-project src/vorp/controls.tsx) to React.

import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

type Item = { id: string; node: ReactNode };

/** Keeps the previous child on screen while it exits, so old and new states overlap. Children are keyed by `id`. */
export function Presence({ id, children, exitMs = 180, className = '' }: { id: string; children: ReactNode; exitMs?: number; className?: string }) {
  const [shown, setShown] = useState<Item>({ id, node: children });
  const [exiting, setExiting] = useState<Item[]>([]);
  if (shown.id !== id) {
    // The id changed: the last thing shown leaves (same key, so its DOM node stays) while the new one enters.
    setExiting((list) => [...list.filter((x) => x.id !== id && x.id !== shown.id), shown]);
    setShown({ id, node: children });
  } else if (shown.node !== children) {
    setShown({ id, node: children });
  }
  useEffect(() => {
    if (exiting.length === 0) return;
    const t = setTimeout(() => setExiting([]), exitMs);
    return () => clearTimeout(t);
  }, [exiting, exitMs]);
  return (
    <div className={`vp-presence ${className}`}>
      {exiting.map((p) => (
        <div key={p.id} className="vp-out" aria-hidden="true">
          {p.node}
        </div>
      ))}
      <div key={id} className="vp-in">
        {children}
      </div>
    </div>
  );
}

const MOVE = 'cubic-bezier(.65,0,.35,1)';

/** A segmented control whose knob stretches as it moves. */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const prev = useRef<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(`[data-v="${value}"]`);
    const k = knob.current;
    if (!el || !k) return;
    const next = { x: el.offsetLeft, w: el.offsetWidth };
    k.style.transform = `translateX(${next.x}px)`;
    k.style.width = `${next.w}px`;
    if (prev.current && prev.current.x !== next.x) move(k, prev.current, next);
    prev.current = next;
  }, [value]);
  return (
    <div className="vp-seg" ref={box} role="radiogroup" aria-label={label}>
      <div className="vp-seg-knob" ref={knob} />
      {options.map((o) => (
        <button key={o.value} data-v={o.value} role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function move(el: HTMLElement, a: { x: number; w: number }, b: { x: number; w: number }) {
  // The knob stretches 12% on its way across (motion rule 5).
  const mid = { x: (a.x + b.x) / 2, w: ((a.w + b.w) / 2) * 1.12 };
  el.animate(
    [
      { transform: `translateX(${a.x}px)`, width: `${a.w}px` },
      { transform: `translateX(${mid.x - (mid.w - (a.w + b.w) / 2) / 2}px)`, width: `${mid.w}px`, offset: 0.5 },
      { transform: `translateX(${b.x}px)`, width: `${b.w}px` },
    ],
    { duration: 240, easing: MOVE },
  );
}

/** An on/off switch; the knob stretches 12% on its way across. */
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const knob = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    knob.current?.animate([{ scale: '1 1' }, { scale: '1.12 0.94', offset: 0.5 }, { scale: '1 1' }], { duration: 220, easing: MOVE });
  }, [on]);
  return (
    <button className={`vp-toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}>
      <span ref={knob} />
    </button>
  );
}

export type Option<T extends string> = { value: T; label: string; detail?: string; disabled?: string };

/** A dropdown that grows from its trigger and shrinks back into it. */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  search,
}: {
  value: T;
  options: readonly Option<T>[];
  onChange: (v: T) => void;
  label: string;
  search?: boolean;
}) {
  const [state, setState] = useState<'closed' | 'open' | 'closing'>('closed');
  const [query, setQuery] = useState('');
  const wrap = useRef<HTMLDivElement>(null);
  const close = () => setState((s) => (s === 'open' ? 'closing' : s));
  useEffect(() => {
    if (state === 'closing') {
      const t = setTimeout(() => {
        setState('closed');
        setQuery('');
      }, 160);
      return () => clearTimeout(t);
    }
    if (state !== 'open') return;
    const down = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setState((s) => (s === 'open' ? 'closing' : s));
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setState((s) => (s === 'open' ? 'closing' : s));
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    wrap.current?.querySelector<HTMLElement>(search ? 'input' : '[aria-selected=true]')?.focus({ preventScroll: true });
    wrap.current?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'center' });
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [state, search]);
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => (o.label + ' ' + (o.detail ?? '')).toLowerCase().includes(q)) : options;
  const current = options.find((o) => o.value === value);
  return (
    <div className="vp-select" ref={wrap}>
      <button className="vp-select-trigger" aria-haspopup="listbox" aria-expanded={state === 'open'} aria-label={label} onClick={() => (state === 'open' ? close() : setState('open'))}>
        <span>{current?.label}</span>
        <Chevron />
      </button>
      {state !== 'closed' && (
        <div className={`vp-pop vp-frost vp-frost-thick ${state === 'closing' ? 'vp-pop-out' : ''}`} role="listbox" aria-label={label}>
          {search && <input className="vp-pop-search" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />}
          <div className="vp-pop-list">
            {shown.map((o, i) => (
              <button
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                className="vp-pop-row"
                disabled={!!o.disabled}
                aria-disabled={o.disabled ? 'true' : undefined}
                style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                onClick={() => {
                  onChange(o.value);
                  close();
                }}
              >
                <span>{o.label}</span>
                {/* A language the other side speaks can't be picked: the reason stands in for the detail. */}
                {o.disabled ? <span className="vp-mute">{o.disabled}</span> : o.detail && <span className="vp-mute">{o.detail}</span>}
              </button>
            ))}
            {!shown.length && <div className="vp-pop-empty vp-mute">No match</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export const Chevron = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3.5 5.5 7 9l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Back = ({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) => (
  <button className="vp-link vp-back" onClick={onClick}>
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    {label}
  </button>
);

/**
 * Text that arrives word by word. Words keep their element as more arrive (keyed by position), so
 * only new ones animate; words that arrive together are staggered so they still read in order.
 */
export function Words({ text }: { text: string }) {
  const words = text.split(/ +/).filter(Boolean);
  const [seen, setSeen] = useState(words.length);
  const [from, setFrom] = useState(0);
  if (words.length !== seen) {
    setFrom(Math.min(seen, words.length));
    setSeen(words.length);
  }
  return (
    <>
      {words.map((w, i) => (
        <Fragment key={i}>
          <span className="vp-word" style={i >= from ? { animationDelay: `${(i - from) * 60}ms` } : undefined}>
            {w}
          </span>{' '}
        </Fragment>
      ))}
    </>
  );
}
