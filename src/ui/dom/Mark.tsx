// The Vorp logo: lowercase "vorp" written as a stroke of light traced twice (a thick pass and a thin
// second pass slightly off it, the mark's long exposure), drawing itself in. Its o is a small live
// voice ring that breathes when idle, swells with the voice in the air and leans blue or orange toward
// whoever is speaking. Ported from the owner's Vorp design (the-wallpaper-project src/vorp/Mark.tsx,
// the "trace" direction the owner picked) to React. assets/brand/logo-trace.svg is its static form.

import { useEffect, useRef } from 'react';

import { loop, SPECTRUM, type Light } from './light';

const STOPS: [number, string][] = [
  [0, SPECTRUM.blue],
  [0.3, SPECTRUM.violet],
  [0.7, SPECTRUM.pink],
  [1, SPECTRUM.orange],
];

/** A loop has no ends, so the spectrum runs out to orange and back to blue. */
const LOOP: [number, string][] = [
  [0, SPECTRUM.blue],
  [0.22, SPECTRUM.violet],
  [0.45, SPECTRUM.pink],
  [0.62, SPECTRUM.orange],
  [0.8, SPECTRUM.pink],
  [0.92, SPECTRUM.violet],
  [1, SPECTRUM.blue],
];

/** "vorp" as a line of light, x-height 40, baseline 40, descender 64, in a 172 × 82 box. The o is left
 *  out: the breathing ring sits there (centre 52,20, radius 20), and the line runs into it and out of it. */
export const TRACE_V = 'M2 2 L15 40 L28 2 C31 0 33 2 35 8';
export const TRACE_RP =
  'M67 6 C74 2 80 5 84 12 L84 40 L84 16 C88 6 96 1 104 3 C108 4 112 1 116 1 L116 64 L116 30 C116 8 130 0 136 0 C148 0 155 10 155 20 C155 32 146 40 136 40 C126 40 118 34 116 28';

/** The o as a live voice ring: two passes of light around a wobbling loop, drawn on a small canvas. */
function LiveO({ light, radius, weight, className }: { light: Light; radius: number; weight: number; className: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let energy = 0;
    return loop(30, (t, dt) => {
      const css = canvas.clientWidth;
      const dpr = Math.min(devicePixelRatio || 1, 3);
      const px = Math.round(css * dpr);
      if (canvas.width !== px) canvas.width = canvas.height = px;
      const time = light.reduced ? 0 : t / 1000;
      energy += (light.level - energy) * Math.min(1, dt / 120);
      const side = light.you - light.them; // >0 you (blue), <0 them (orange)
      const s = px / 2;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, px, px);
      ctx.translate(s, s);
      // The spectrum turns slowly, and leans toward the speaker's hue.
      const g = ctx.createConicGradient(time * 0.6 + side * 1.2, 0, 0);
      LOOP.forEach(([o, c]) => g.addColorStop(o, c));
      ctx.strokeStyle = g;
      ctx.lineCap = 'round';
      const R = s * radius * (1 + energy * 0.12);
      const pass = (w: number, wob: number, ph: number, r: number) => {
        ctx.beginPath();
        for (let i = 0; i <= 96; i++) {
          const a = (i / 96) * Math.PI * 2;
          const k = 1 + wob * (Math.sin(3 * a + time * 1.3 + ph) * 0.6 + Math.sin(5 * a - time * 0.9 + ph) * 0.4);
          const x = Math.cos(a) * r * k;
          const y = Math.sin(a) * r * k;
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.lineWidth = w;
        ctx.stroke();
      };
      const wob = 0.025 + energy * 0.09;
      ctx.globalAlpha = 0.1 + energy * 0.32; // the soft spill of light round the loop
      pass(s * 0.34 * weight, wob, 0, R);
      ctx.globalAlpha = 1;
      pass(s * 0.15 * weight, wob, 0, R);
      pass(s * 0.065 * weight, wob * 1.6, 2.1, R * 0.86);
    });
  }, [light, radius, weight]);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}

export function Mark({ light }: { light: Light }) {
  return (
    <span className="vp-logo" role="img" aria-label="Vorp">
      <span className="vp-trace">
        <svg className="vp-logo-trace" viewBox="-8 -10 172 82" aria-hidden="true">
          <defs>
            <linearGradient id="vp-trace-spectrum" gradientUnits="userSpaceOnUse" x1="0" y1="56" x2="156" y2="-4">
              {STOPS.map(([o, c]) => (
                <stop key={o} offset={o} stopColor={c} />
              ))}
            </linearGradient>
          </defs>
          <g fill="none" stroke="url(#vp-trace-spectrum)" strokeLinecap="round" strokeLinejoin="round">
            {[TRACE_V, TRACE_RP].map((d, i) => (
              <g key={i} className={`vp-trace-part p${i}`}>
                <path className="vp-trace-a" d={d} pathLength={1} strokeWidth="6.5" />
                <path className="vp-trace-b" d={d} pathLength={1} strokeWidth="2.4" transform="translate(3.2 -3.4)" />
              </g>
            ))}
          </g>
        </svg>
        <LiveO light={light} radius={0.77} weight={1.45} className="vp-trace-o" />
      </span>
    </span>
  );
}
