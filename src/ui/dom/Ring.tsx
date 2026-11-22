// The ring: Ultra Reactivate's voice ring (light bending with the voice), with Vorp's pulses on it as
// a long exposure, and the interpreter inside. Light runs from the speaker's side (them at the top,
// you at the bottom) around both halves of the ring to the listener's side. Ported from the owner's
// Vorp design (the-wallpaper-project src/vorp/Ring.tsx) to React.

import { useEffect, useRef } from 'react';

import { useGaze } from '../effects/vendor/blobatar/react/gaze';
import { VoiceRing, type VoiceOrbState } from '../effects/vendor/voice-ring';
import { Blob, type Mood } from './blob';
import { loop, SIDE, SPECTRUM, type Light, type Phase, type Who } from './light';

const TOP = -Math.PI / 2;
const BOTTOM = Math.PI / 2;

type Comet = { from: number; span: number; age: number; life: number; a: string; b: string; w: number };

const RING_STATE: Record<Phase, VoiceOrbState> = { listening: 'idle', hearing: 'listening', translating: 'processing', speaking: 'speaking' };

export function Ring({
  light,
  phase,
  who,
  size,
  mood,
  rest,
}: {
  light: Light;
  phase: Phase;
  /** Undefined while nobody knows yet who is speaking: the blob stays at rest. */
  who?: Who;
  size: number;
  mood?: Mood;
  /** Not live (connecting, a problem): the blob rests in violet. */
  rest?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const gaze = useGaze({ travel: 3.2 });
  const { lookAt } = gaze;

  useEffect(() => {
    if ((phase === 'hearing' || phase === 'speaking') && who) {
      // Hearing: look at the speaker. Speaking: look at the listener.
      const at = (phase === 'hearing') === (who === 'them') ? top.current : bottom.current;
      lookAt(at);
    } else lookAt(phase === 'translating' ? 'rest' : null);
  }, [phase, who, lookAt]);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = c.height = Math.round(size * dpr);
    const comets: Comet[] = [];
    let spawn = 0;
    let orbit = 0;

    return loop(60, (t, dt) => {
      const s = c.width;
      const cx = s / 2;
      const lw = s * 0.022;
      const time = t / 1000;
      const energy = Math.max(light.you, light.them);
      // The voice ring rests at 0.56 of its half-size and swells with the voice; the pulses ride on it.
      const R = (s / 2) * 0.56 * (1 + 0.14 * energy);
      const radius = (th: number, k: number) => R * k * (1 + 0.012 * Math.sin(3 * th + time * 0.8) + 0.035 * energy * Math.sin(5 * th - time * 3.1));
      const at = (th: number, k = 1): [number, number] => [cx + Math.cos(th) * radius(th, k), cx + Math.sin(th) * radius(th, k)];

      // Long exposure: what was drawn fades instead of being cleared.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0,0,0,${light.reduced ? 1 : 1 - Math.exp(-dt / 140)})`;
      ctx.fillRect(0, 0, s, s);
      ctx.globalCompositeOperation = 'source-over';

      if (light.reduced) {
        ctx.globalAlpha = 1;
        return;
      }

      // Spawn light from the speaker's side, both ways round, toward the listener.
      const active = light.phase === 'hearing' || light.phase === 'speaking';
      if (active) {
        spawn += dt * (0.0008 + 0.0016 * light.level);
        while (spawn > 1) {
          spawn -= 1;
          const from = light.who === 'them' ? TOP : BOTTOM;
          const listener = light.who === 'them' ? 'you' : 'them';
          const a = SIDE[light.who];
          const b = light.phase === 'speaking' ? SIDE[listener] : SPECTRUM.violet;
          const jitter = (Math.random() - 0.5) * 0.5;
          const life = 900 + Math.random() * 500;
          comets.push({ from: from + jitter, span: Math.PI - jitter, age: 0, life, a, b, w: 0.6 + light.level * 0.8 });
          comets.push({ from: from - jitter, span: -(Math.PI - jitter), age: 0, life, a, b, w: 0.6 + light.level * 0.8 });
        }
      } else {
        // Listening: one faint pass going round. Translating: the interpreter thinks, faster, in violet.
        const thinkingNow = light.phase === 'translating';
        orbit += dt * (thinkingNow ? 0.0042 : 0.0011);
        const th = orbit;
        comets.push({ from: th, span: 0.0001, age: 0, life: 1, a: thinkingNow ? SPECTRUM.violet : SPECTRUM.pink, b: SPECTRUM.violet, w: thinkingNow ? 0.9 : 0.45 });
        if (thinkingNow) comets.push({ from: th + Math.PI, span: 0.0001, age: 0, life: 1, a: SPECTRUM.blue, b: SPECTRUM.orange, w: 0.7 });
      }

      for (let i = comets.length - 1; i >= 0; i--) {
        const m = comets[i];
        m.age += dt;
        const p = Math.min(1, m.age / m.life);
        const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2; // ease-in-out along the arc
        const [x, y] = at(m.from + m.span * e);
        const fade = Math.sin(Math.PI * Math.min(1, p * 1.05 + 0.02));
        const r = lw * (0.3 + 0.25 * m.w);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
        const col = mix(m.a, m.b, e);
        g.addColorStop(0, rgba(mix(col, '#ffffff', 0.45), 0.42 * fade));
        g.addColorStop(0.35, rgba(col, 0.26 * fade));
        g.addColorStop(1, rgba(col, 0));
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 2, 0, Math.PI * 2);
        ctx.fill();
        if (m.age >= m.life) comets.splice(i, 1);
      }
      ctx.globalAlpha = 1;
    });
  }, [size, light]);

  const expression: Mood = mood ?? (phase === 'translating' ? 'thinking' : phase === 'speaking' ? 'happy' : 'idle');

  return (
    <div className="vp-ring" style={{ width: size, height: size }}>
      <div ref={top} className="vp-anchor vp-anchor-top" />
      <VoiceRing type="ring" size={size} state={RING_STATE[phase]} level={() => light.level} theme={light.dark ? 'dark' : 'light'} paused={light.reduced} aria-hidden="true" />
      <canvas ref={canvas} style={{ width: size, height: size }} aria-hidden="true" />
      <div className="vp-blob" data-blob="">
        <Blob size={Math.round(size * 0.27)} mood={expression} tint={rest || phase === 'listening' || !who ? 'rest' : who} title="Vorp" elementRef={gaze.ref} />
      </div>
      <div ref={bottom} className="vp-anchor vp-anchor-bottom" />
    </div>
  );
}

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number) {
  const x = rgb(a);
  const y = rgb(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
function rgba(hex: string, a: number) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}
