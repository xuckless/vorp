// STUBBED OUT (owner, 22 November 2026): the language swap is not rendered anywhere (SHOW_SWAP in
// ./flags.ts). "You" is always the owner's own language, so swapping has no use in the owner model.
// Kept as ported from the owner's Vorp design (the-wallpaper-project src/vorp/Swapper.tsx).

import { useEffect, useRef, useState } from "react";

import { BorderBeam } from "../effects/vendor/border-beam";
import { Liquid } from "../effects/vendor/liquid-gooey";

// The language switcher: one round ⇄ button beside Hold to talk. Pressing it pops two liquid drops out of the
// button (Ultra Reactivate's liquid plus menu), each wearing a language code: yours in blue, theirs in orange.
// The drops trade places as the languages swap, then merge back into the button, so you see what changed.
// The button and drops are frosted glass (real backdrop blur); the liquid under them is a faint milk that
// only shows as the necks between them, since a goo silhouette can't carry a backdrop blur itself.

const SHADOW = "0 2px 6px 0 rgba(0,0,0,0.10), 0 10px 32px 0 rgba(0,0,0,0.22)";
/** Where the two drops float, relative to the button: yours up and left, theirs up and right. */
const SLOT = { you: { x: -6, y: -78 }, them: { x: 62, y: -52 } } as const;
const OPEN = { duration: 520, ease: "cubic-bezier(0.34, 1.4, 0.64, 1)" };
const MOVE = { duration: 560, ease: "cubic-bezier(0.65, 0, 0.35, 1)" };
const CLOSE = { duration: 260, ease: "cubic-bezier(0.22, 1, 0.36, 1)" };

export function Swapper({ you, them, dark, onSwap }: { you: string; them: string; dark: boolean; onSwap: () => void }) {
  const [phase, setPhase] = useState<"closed" | "open" | "swapped">("closed");
  const [turns, setTurns] = useState(0);
  const [ready, setReady] = useState(false);
  const timers = useRef<number[]>([]);
  // Let the first paint settle before the liquid measures anything (as Ultra Reactivate does).
  useEffect(() => {
    const r = requestAnimationFrame(() => setReady(true));
    const list = timers.current;
    return () => {
      cancelAnimationFrame(r);
      list.forEach(clearTimeout);
    };
  }, []);

  const press = () => {
    if (phase !== "closed") return;
    setPhase("open");
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    at(560, () => {
      onSwap();
      setTurns((n) => n + 1);
      setPhase("swapped");
    });
    at(1650, () => setPhase("closed"));
  };

  const open = phase !== "closed";
  const tr = phase === "open" ? OPEN : phase === "swapped" ? MOVE : CLOSE;
  // Drops are keyed by language, so a language keeps its drop and travels to its new side.
  const drops = [
    { code: you, side: "you" as const },
    { code: them, side: "them" as const },
  ].sort((a, b) => a.code.localeCompare(b.code));

  return (
    <div className="vp-swapper">
      {ready && (
        <Liquid blur={6} contrast={18} fill={dark ? "#aab3d0" : "#ffffff"} shadow={SHADOW} className={`vp-swapper-liquid ${open ? "open" : ""}`}>
          {drops.map(({ code, side }, i) => (
            <Liquid.Item key={code} className="vp-swapper-slot drop" radius={24} x={open ? SLOT[side].x : 0} y={open ? SLOT[side].y : 0} transition={tr} delay={phase === "open" ? i * 40 : 0}>
              <span className={`vp-swapper-drop vp-frost ${side}`} aria-hidden="true">
                <span>{code.toUpperCase()}</span>
              </span>
            </Liquid.Item>
          ))}
          <Liquid.Item className="vp-swapper-slot" radius={32}>
            <BorderBeam className="vp-stop-host" size="sm" colorVariant="colorful" theme={dark ? "dark" : "light"} borderRadius={32}>
            <button className="vp-swapper-main vp-frost" aria-label={`Swap languages: you speak ${you}, they speak ${them}`} title="Swap languages" onClick={press}>
              <svg width="22" height="22" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${turns * 180}deg)` }}>
                <path d="M3 6.5h12M12 3.5l3 3-3 3M15 11.5H3M6 8.5l-3 3 3 3" />
              </svg>
            </button>
            </BorderBeam>
          </Liquid.Item>
        </Liquid>
      )}
    </div>
  );
}
