// The aurora, ported from the owner's Vorp design (the-wallpaper-project src/vorp/Aurora.tsx) to React.

import { useEffect, useRef, useState } from 'react';

import { loop, settle, SPECTRUM, type Light } from './light';

// The room: the ring's light, spilled into the background. Them at the top, you at the bottom; each side
// brightens while that side's voice is in the air.
//
// Drawn by a small WebGL shader: the blobs are computed in float and dithered per pixel by under one colour
// level, so the dark gradients never band. (Canvas 2D gradients carry Skia's ordered dither, and six of them
// stacked additively showed as a grid once the old CSS blur was removed.) Canvas 2D is the fallback.

type Blob = { color: string; x: number; y: number; r: number; side?: "you" | "them"; sx: number; sy: number; ph: number };

const BLOBS: Blob[] = [
  { color: SPECTRUM.orange, x: 0.72, y: 0.05, r: 0.55, side: "them", sx: 0.08, sy: 0.04, ph: 0 },
  { color: SPECTRUM.pink, x: 0.25, y: 0.12, r: 0.45, side: "them", sx: 0.1, sy: 0.05, ph: 2.1 },
  { color: SPECTRUM.violet, x: 0.85, y: 0.55, r: 0.4, sx: 0.06, sy: 0.08, ph: 4.2 },
  { color: SPECTRUM.violet, x: 0.12, y: 0.62, r: 0.35, sx: 0.07, sy: 0.06, ph: 1.3 },
  { color: SPECTRUM.blue, x: 0.3, y: 0.98, r: 0.6, side: "you", sx: 0.1, sy: 0.04, ph: 3.3 },
  { color: SPECTRUM.blue, x: 0.8, y: 0.92, r: 0.4, side: "you", sx: 0.08, sy: 0.05, ph: 5.1 },
];
const N = BLOBS.length;

/** Where each blob is this frame, in pixels, and how strongly it glows. */
function place(light: Light, t: number, w: number, h: number) {
  const m = Math.max(w, h);
  const time = light.reduced ? 0 : t / 1000;
  return BLOBS.map((b) => {
    const energy = b.side ? light[b.side] : Math.max(light.you, light.them) * 0.4;
    const a = Math.min(1, (light.dark ? 0.16 : 0.22) + energy * (light.dark ? 0.28 : 0.25));
    const breathe = 1 + 0.06 * Math.sin(time * 0.35 + b.ph) + energy * 0.12;
    return {
      x: (b.x + b.sx * Math.sin(time * 0.09 + b.ph)) * w,
      y: (b.y + b.sy * Math.cos(time * 0.07 + b.ph * 1.7)) * h,
      r: b.r * m * breathe,
      a,
      rgb: rgb(b.color),
    };
  });
}

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform vec3 uBg;
uniform float uDark;
uniform vec4 uBlob[${N}];
uniform vec3 uCol[${N}];
// The 2D version's gradient: 1 at the centre, .35 at 55%, 0 at the rim.
float profile(float t) {
  t = clamp(t, 0.0, 1.0);
  return t < 0.55 ? mix(1.0, 0.35, t / 0.55) : mix(0.35, 0.0, (t - 0.55) / 0.45);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec3 c = uBg;
  for (int i = 0; i < ${N}; i++) {
    float f = profile(length(p - uBlob[i].xy) / uBlob[i].z) * uBlob[i].w;
    // dark: light adds (as 'lighter'); paper: colour multiplies (as 'multiply')
    c = uDark > 0.5 ? c + uCol[i] * f : c * mix(vec3(1.0), uCol[i], f);
  }
  c += (hash(p) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`;

function startGL(canvas: HTMLCanvasElement, light: Light) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: false });
  if (!gl) return null;
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, "attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }"));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = (n: string) => gl.getUniformLocation(prog, n);
  const uRes = u("uRes"), uBg = u("uBg"), uDark = u("uDark"), uBlob = u("uBlob"), uCol = u("uCol");
  const blobs = new Float32Array(N * 4), cols = new Float32Array(N * 3);

  const draw = (t: number) => {
    const w = canvas.width, h = canvas.height;
    gl.viewport(0, 0, w, h);
    place(light, t, w, h).forEach((b, i) => {
      blobs.set([b.x, b.y, b.r, b.a], i * 4);
      cols.set(b.rgb.map((v) => v / 255), i * 3);
    });
    gl.uniform2f(uRes, w, h);
    gl.uniform3fv(uBg, (light.dark ? [13, 15, 17] : [245, 243, 238]).map((v) => v / 255));
    gl.uniform1f(uDark, light.dark ? 1 : 0);
    gl.uniform4fv(uBlob, blobs);
    gl.uniform3fv(uCol, cols);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const dispose = () => {
    gl.deleteBuffer(buf);
    gl.deleteProgram(prog);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };
  return { draw, dispose };
}

function start2D(canvas: HTMLCanvasElement, light: Light) {
  const ctx = canvas.getContext("2d")!;
  const draw = (t: number) => {
    const w = canvas.width, h = canvas.height;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = light.dark ? "#0d0f11" : "#f5f3ee";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = light.dark ? "lighter" : "multiply";
    for (const b of place(light, t, w, h)) {
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      const [r, gg, bb] = b.rgb;
      g.addColorStop(0, `rgba(${r},${gg},${bb},${b.a})`);
      g.addColorStop(0.55, `rgba(${r},${gg},${bb},${b.a * 0.35})`);
      g.addColorStop(1, `rgba(${r},${gg},${bb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  };
  return { draw, dispose: () => {} };
}

/** A phone that asked to save data, or has little memory or few cores: the guest gets the plain background. */
const constrained = () => {
  const n = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  return !!n.connection?.saveData || (n.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency ?? 8) <= 2;
};

/** `defer` (the guest's cold page): first paint is the plain background; the light fades in once the
 *  page is idle, and never on a constrained phone. */
export function Aurora({ light, defer = false }: { light: Light; defer?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [skip] = useState(() => defer && constrained());

  useEffect(() => {
    if (skip) return;
    const canvas = ref.current!;
    const host = canvas.parentElement!;
    // One canvas pixel per CSS pixel: the light is soft, so device pixels would only cost.
    const size = () => {
      canvas.width = Math.max(8, Math.ceil(host.clientWidth));
      canvas.height = Math.max(8, Math.ceil(host.clientHeight));
    };
    let stop = () => {};
    const begin = () => {
      const ro = new ResizeObserver(size);
      ro.observe(host);
      size();
      const painter = startGL(canvas, light) ?? start2D(canvas, light);
      const halt = loop(30, (t, dt) => {
        settle(light, dt);
        painter.draw(t);
      });
      stop = () => {
        halt();
        ro.disconnect();
        painter.dispose();
      };
    };
    if (!defer) {
      begin();
      return () => stop();
    }
    // Deferred: nothing is compiled or drawn until the page is idle, then the light fades in.
    canvas.style.opacity = '0';
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    let fade: ReturnType<typeof setTimeout> | undefined;
    const show = () => {
      begin();
      fade = setTimeout(() => {
        canvas.style.transition = 'opacity 900ms ease-out';
        canvas.style.opacity = '1';
      }, 300);
    };
    const idle = w.requestIdleCallback ? w.requestIdleCallback(show, { timeout: 1500 }) : undefined;
    const late = idle === undefined ? setTimeout(show, 900) : undefined;
    return () => {
      if (idle !== undefined) w.cancelIdleCallback?.(idle);
      clearTimeout(late);
      clearTimeout(fade);
      stop();
    };
  }, [light, defer, skip]);

  if (skip) return null;
  return <canvas ref={ref} className="vp-aurora" aria-hidden="true" />;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
