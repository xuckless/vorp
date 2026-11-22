// The design's stylesheet, scoped under .vp. Ported from the owner's signed-off Vorp design
// (xuckless/the-wallpaper-project src/vorp/style.ts, 22 November 2026). Colours, glass tiers and
// curves come from the tokens; the rest are the design's own measurements.
//
// Rendering lessons kept from the design (Chrome): never animate CSS `filter` on anything that holds
// canvases or backdrop-filter (blank frames); pages fade and slide; text blurs with text-shadow;
// animation fill-mode `backwards`, not `both`; scroll containers are padded for glass shadows.

import { cssEasing, easing, GLASS as G, palettes } from '@/ui/tokens';

const { dark, light } = palettes;
const out = cssEasing(easing.enter);
const inOut = cssEasing(easing.move);

export const CSS = /* css */ `
.vp {
  --bg: ${dark.background}; --ink: ${dark.text}; --mute: ${dark.textMuted};
  --surface: ${dark.surface}; --surface-2: ${dark.control}; --press: ${dark.press}; --knob: #30363c; --pop: ${dark.pop};
  --glass: rgba(29, 33, 37, .55); --shadow: 0 16px 48px rgba(0,0,0,.45);
  /* Frosted glass, Wubble's coloured frost (tiers from ui/tokens/glass.ts): heavy blur keeps the colour behind and loses its detail. */
  --frost: rgb(190 198 216 / ${G.regular.fill}); --frost-thin: rgb(255 255 255 / .08); --frost-press: rgb(255 255 255 / .13);
  --frost-filter: blur(${G.regular.blur}px) saturate(${G.regular.saturate * 100}%);
  --frost-edge: inset 0 0 0 1px rgb(255 255 255 / ${G.regular.rim}), inset 0 1px 0 rgb(255 255 255 / ${G.regular.top});
  --frost-shadow: 0 ${G.regular.shadow[0]}px ${G.regular.shadow[1]}px rgb(0 0 0 / ${G.regular.shadow[2]});
  /* Thick frost for things that float over content: it also dims what's behind, so text stays legible. */
  --frost-thick: rgb(70 74 86 / ${G.thick.fill}); --frost-thick-filter: blur(${G.thick.blur}px) saturate(${G.thick.saturate * 100}%) brightness(${G.thick.brightness});
  --frost-thick-shadow: 0 ${G.thick.shadow[0]}px ${G.thick.shadow[1]}px rgb(0 0 0 / ${G.thick.shadow[2]});
  /* Coloured frost: violet for what's selected, blue for you, orange for them. The card solids are what
     the distortion wave pictures a frosted card on (--dw-bg). */
  --tint: rgb(143 107 255 / .32); --you-frost: rgb(76 141 255 / .24); --them-frost: rgb(255 162 76 / .2); --you-card-solid: rgb(55 90 175); --them-card-solid: rgb(84 68 82); --you-held: rgb(76 141 255 / .5);
  --you: ${dark.participants[0]}; --them: ${dark.participants[1]}; --danger: ${dark.danger};
  position: absolute; inset: 0; overflow: hidden;
  background: var(--bg); color: var(--ink);
  font: 400 16px/1.4 Geist, ui-sans-serif, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased; -webkit-tap-highlight-color: transparent;
}
.vp[data-theme="light"] {
  --bg: ${light.background}; --ink: ${light.text}; --mute: ${light.textMuted};
  --surface: ${light.surface}; --surface-2: ${light.control}; --press: ${light.press}; --knob: #fbfaf7; --pop: ${light.pop};
  --glass: rgba(251, 250, 247, .55); --shadow: 0 16px 48px rgba(60,50,30,.16);
  --frost: rgb(255 255 255 / .42); --frost-thin: rgb(255 255 255 / .5); --frost-press: rgb(255 255 255 / .72);
  --frost-filter: blur(${G.regular.blur}px) saturate(${G.regular.saturate * 100}%) brightness(1.04);
  --frost-edge: inset 0 0 0 1px rgb(255 255 255 / .35), inset 0 1px 0 rgb(255 255 255 / .6);
  --frost-shadow: 0 14px 36px rgb(80 60 40 / .12);
  --frost-thick: rgb(250 248 244 / .62); --frost-thick-filter: blur(${G.thick.blur}px) saturate(${G.thick.saturate * 100}%) brightness(1.06);
  --frost-thick-shadow: 0 20px 50px rgb(80 60 40 / .18);
  --tint: rgb(143 107 255 / .24); --you-frost: rgb(76 141 255 / .18); --them-frost: rgb(255 162 76 / .2); --you-card-solid: rgb(206 218 245); --them-card-solid: rgb(246 226 214); --you-held: rgb(76 141 255 / .42);
  --you: ${light.participants[0]}; --them: ${light.participants[1]}; --danger: ${light.danger};
}
.vp *, .vp *::before, .vp *::after { box-sizing: border-box; }
:where(.vp) button { font: inherit; color: inherit; cursor: pointer; -webkit-user-select: none; user-select: none; }
:where(.vp) button:focus-visible { outline: 2px solid var(--you); outline-offset: 2px; }
:where(.vp) p { margin: 0; }
.vp-mute { color: var(--mute); }
.vp small { display: block; font-size: 13.5px; line-height: 1.35; margin-top: 2px; font-weight: 400; }

/* No CSS filter: it is drawn tiny and scaled up, so it is already soft, and a filtered canvas under frosted
   glass made Chrome drop frames (blank aurora) whenever a page switched. Its own stable layer. */
.vp-aurora { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; will-change: transform; transform: translateZ(0); }

/* Presence: old and new overlap in one grid cell. */
.vp-presence { display: grid; }
.vp-presence > * { grid-area: 1 / 1; min-width: 0; }
.vp-in { animation: vp-enter 280ms ${out} backwards; }
.vp-out { animation: vp-exit 180ms ease-in forwards; pointer-events: none; }
/* Blur is drawn with text-shadow, never filter: animated filters over canvases and frosted glass made Chrome
   paint black bars and squares (21 Nov 2026). */
@keyframes vp-enter { from { opacity: 0; color: transparent; text-shadow: 0 0 6px var(--ink); transform: translateY(6px); } }
@keyframes vp-exit { to { opacity: 0; color: transparent; text-shadow: 0 0 6px var(--ink); transform: translateY(-4px); } }

.vp-views { position: absolute; inset: 0; grid-template: 100% / 100%; }
/* Whole pages fade and slide, never blur: a blur over a page full of frosted glass and canvases forces
   Chrome to rebuild its layers and drop a frame (seen as a black flash on Stop, 21 Nov 2026). */
.vp-views > .vp-in { animation: vp-page-in 280ms ${out} backwards; }
.vp-views > .vp-out { animation: vp-page-out 160ms ease-in forwards; }
@keyframes vp-page-in { from { opacity: 0; transform: translateY(6px); } }
@keyframes vp-page-out { to { opacity: 0; } }
.vp-views > * { overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; }

/* Pages */
.vp-page { max-width: 520px; margin: 0 auto; padding: env(safe-area-inset-top) 20px 0; min-height: 100%; display: flex; flex-direction: column; }
.vp-bar { display: flex; align-items: center; justify-content: space-between; min-height: 80px; flex: none; }
/* The blob as tinted glass, in the speaker's hue like the caption cards. Eyes stay solid. */
.vp-glass-blob { display: inline-block; --bt: 143 107 255; }
.vp-glass-blob[data-tint="you"] { --bt: 76 141 255; }
.vp-glass-blob[data-tint="them"] { --bt: 255 162 76; }
/* The body is several overlapping shapes: painted solid, then made see-through once as a group,
   so it reads as one body (no seams where the shapes overlap). */
.vp-glass-blob .mo-bob > g:not(.mo-eyes) { fill: url(#vp-blob-glass); opacity: .8; }
.vp-glass-blob stop { transition: stop-color 500ms ${inOut}; }
.vp-glass-blob .vp-bg-a { stop-color: color-mix(in srgb, rgb(var(--bt)) 50%, white); }
.vp-glass-blob .vp-bg-b { stop-color: color-mix(in srgb, rgb(var(--bt)) 85%, white); }
.vp-glass-blob .vp-bg-c { stop-color: color-mix(in srgb, rgb(var(--bt)) 80%, black); }
.vp-glass-blob .mo-eyes { fill: #0d0f11; }

/* The logo, large enough to be the page's signature. */
.vp-logo { display: inline-flex; align-items: center; line-height: 1; }
.vp-logo-word { font-size: clamp(30px, 4.2vw, 40px); font-weight: 600; letter-spacing: 0; }
.vp-logo-o { display: inline-block; width: .74em; height: .74em; margin: .13em .035em 0; flex: none; }
.vp-logo-o svg { display: block; width: 100%; height: 100%; }
.vp-logo-live { width: .86em; height: .86em; margin: .1em -.02em 0; }
.vp-trace { position: relative; display: block; height: clamp(40px, 5.2vw, 54px); aspect-ratio: 172 / 82; }
.vp-logo-trace { display: block; width: 100%; height: 100%; overflow: visible; }
/* The ring over the o's place in the 172 × 82 box: x 26–78, y −6–46. */
.vp-trace-o { position: absolute; left: 19.77%; top: 4.88%; width: 30.23%; height: 63.41%; }
.vp-trace-part.p1 .vp-trace-a { animation-delay: .35s; }
.vp-trace-part.p1 .vp-trace-b { animation-delay: .6s; }
.vp-trace-o { animation: vp-fade-in .6s ${out} .15s backwards; }
@keyframes vp-fade-in { from { opacity: 0; transform: scale(.8); } }
.vp-trace-a, .vp-trace-b { stroke-dasharray: 1 1; animation: vp-trace 1.5s ${out} backwards; }
.vp-trace-b { opacity: .85; animation-delay: .28s; }
@keyframes vp-trace { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
[data-reduced] .vp-trace-a, [data-reduced] .vp-trace-b { animation: none; }
.vp-link { background: none; border: 0; color: var(--mute); font-size: 15px; min-height: 44px; padding: 0 4px; transition: color 150ms; }
.vp-link:hover { color: var(--ink); }
.vp-back { display: inline-flex; align-items: center; gap: 4px; margin-left: -4px; }
.vp h1 { font-size: 30px; line-height: 1.15; font-weight: 500; margin: 12px 0 24px; text-wrap: balance; }
.vp h2 { font-size: 17px; font-weight: 500; margin: 32px 0 12px; }
.vp-lede { font-size: 16px; line-height: 1.45; margin: -12px 0 24px; }

.vp-bar-3 { display: grid; grid-template-columns: 1fr auto 1fr; }
.vp-bar-3 > :last-child { justify-self: end; }
.vp-icon-btn { width: 44px; height: 44px; margin-left: -10px; border: 0; border-radius: 14px; background: none; color: var(--ink); display: grid; place-items: center; transition: transform 120ms ${out}, background 150ms; }
.vp-icon-btn:hover, .vp-icon-btn.on {
  background: var(--frost-thin); -webkit-backdrop-filter: var(--frost-filter); backdrop-filter: var(--frost-filter); box-shadow: var(--frost-edge);
}
.vp-icon-btn:active { transform: scale(.97); }
.vp-settings { position: relative; justify-self: start; }
.vp-panel {
  position: absolute; left: -10px; top: calc(100% + 6px); z-index: 30; width: min(380px, calc(100vw - 20px));
  padding: 6px 18px 10px; border-radius: 22px; max-height: calc(100dvh - 96px); overflow-y: auto; overscroll-behavior: contain;
  transform-origin: 22px 0; animation: vp-pop-in 220ms ${out} backwards;
}
.vp-panel-out { animation: vp-pop-out 170ms ease-in forwards; }
.vp-panel h2 { margin: 12px 0 4px; }
.vp-panel > .vp-row { animation: vp-row-in 260ms ${out} backwards; }
${[...Array(7)].map((_, i) => `.vp-panel > .vp-row:nth-child(${i + 2}) { animation-delay: ${40 + i * 30}ms; }`).join("\n")}

.vp-hero { padding: 8px 0 4px; display: flex; flex-direction: column; align-items: center; text-align: center; }
.vp-hero h1 { margin-top: 4px; }
.vp-halo { --halo: 264px; --halo-r: 112px; --blob-scale: 1; position: relative; width: var(--halo); height: var(--halo); display: grid; place-items: center; }
.vp-halo-blob { position: relative; width: 112px; height: 112px; transform: scale(var(--blob-scale)); }
.vp-halo-ring { position: absolute; inset: 0; animation: vp-orbit 90s linear infinite; }
.vp-halo-orb { position: absolute; left: 50%; top: 50%; width: 32px; height: 32px; margin: -16px 0 0 -16px;
  transform: rotate(calc(var(--i) * 360deg / var(--n))) translateY(calc(var(--halo-r) * -1)) rotate(calc(var(--i) * -360deg / var(--n))); }
.vp-halo-orb > span { display: block; animation: vp-orbit 90s linear infinite reverse; }
.vp-halo-orb canvas { display: block; }
@keyframes vp-orbit { to { transform: rotate(360deg); } }

:where(.vp-frost) { position: relative; }
.vp-frost {
  isolation: isolate; background: var(--frost);
  -webkit-backdrop-filter: var(--frost-filter); backdrop-filter: var(--frost-filter);
  box-shadow: var(--frost-edge), var(--frost-shadow);
}
.vp-frost::after { /* a breath of light at the top, not a specular band */
  content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: -1;
  background: linear-gradient(180deg, rgb(255 255 255 / .035), rgb(255 255 255 / 0) 50%);
}
/* Controls sitting on frost are thin frost themselves. */
.vp-frost { --surface-2: var(--frost-thin); --press: var(--frost-press); }
.vp-group { border-radius: 22px; padding: 4px 16px; z-index: 1; }
.vp-frost-thick {
  --frost: var(--frost-thick); --frost-filter: var(--frost-thick-filter); --frost-shadow: var(--frost-thick-shadow);
}
.vp-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 60px; padding: 10px 0; flex-wrap: wrap; }
.vp-row > span:first-child { flex: 1 1 140px; }
.vp-swap {
  position: absolute; left: 50%; top: 46px; margin-left: -18px; width: 36px; height: 36px; border-radius: 18px; border: 0;
  background: var(--surface-2); color: var(--mute); display: grid; place-items: center; z-index: 1;
  transition: transform 300ms ${inOut}, color 150ms;
}
.vp-swap:hover { color: var(--ink); }
.vp-swap:active { scale: .97; }
.vp-btn {
  display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 14px 0 12px; border: 0; border-radius: 14px;
  --frost: var(--frost-thin); color: var(--ink); font-size: 15px; font-weight: 500; transition: transform 120ms ${out}, background 150ms;
}
.vp-btn:hover { --frost: var(--frost-press); }
.vp-btn:active { transform: scale(.97); }
.vp-btn svg { color: var(--mute); }
.vp-text-btn { background: none; border: 0; font-weight: 500; min-height: 44px; padding: 0 4px; }
.vp-row-actions { display: flex; gap: 14px; flex: none; }
.vp-danger { color: var(--danger); }

/* Select */
.vp-select { position: relative; }
.vp-select-trigger { display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 12px 0 14px; border: 0; border-radius: 12px; background: var(--surface-2); font-weight: 500; transition: transform 120ms ${out}; }
.vp-select-trigger:active { transform: scale(.97); }
.vp-select-trigger svg { color: var(--mute); }
.vp-pop {
  position: absolute; right: 0; top: calc(100% + 6px); width: 264px; max-height: 340px; z-index: 20;
  display: flex; flex-direction: column; border-radius: 16px;
  transform-origin: top right; animation: vp-pop-in 200ms ${out} backwards;
}
.vp .vp-pop { /* nested inside other frost it can only blur that pane, so it carries most of its own body */
  --frost: color-mix(in srgb, var(--pop) 97%, transparent);
}
.vp-pop-out { animation: vp-pop-out 160ms ease-in forwards; }
@keyframes vp-pop-in { from { opacity: 0; transform: scale(.95); } }
@keyframes vp-pop-out { to { opacity: 0; transform: scale(.95); } }
.vp-pop-search { flex: none; margin: 8px 8px 0; height: 40px; border: 0; border-radius: 10px; background: var(--frost-thin); color: var(--ink); padding: 0 12px; font: inherit; font-size: 15px; outline: none; }
.vp-pop-list { overflow-y: auto; padding: 6px; }
.vp-pop-row { display: flex; justify-content: space-between; gap: 12px; width: 100%; min-height: 44px; align-items: center; padding: 0 10px; border: 0; border-radius: 10px; background: none; text-align: left; font-size: 15px; animation: vp-row-in 220ms ${out} backwards; }
.vp-pop-row:hover, .vp-pop-row:focus-visible { background: var(--frost-thin); outline: none; }
.vp-pop-row[aria-selected="true"] { background: var(--tint); font-weight: 500; }
.vp-pop-row:disabled { color: var(--mute); cursor: default; background: none; }
.vp-pop-row:disabled > span:first-child { opacity: .55; }
.vp-pop-empty { padding: 12px 10px; font-size: 15px; }
@keyframes vp-row-in { from { opacity: 0; transform: translateY(-4px); } }

/* Segmented */
.vp-seg { position: relative; display: inline-flex; background: var(--surface-2); border-radius: 12px; padding: 3px; }
.vp-seg button { position: relative; z-index: 1; border: 0; background: none; color: var(--mute); height: 36px; padding: 0 13px; font-size: 14.5px; font-weight: 500; border-radius: 9px; transition: color 200ms; }
.vp-seg button.on { color: var(--ink); }
.vp-seg-knob { position: absolute; top: 3px; bottom: 3px; left: 0; background: var(--tint); box-shadow: var(--frost-edge); border-radius: 9px; }

/* Toggle */
.vp-toggle { position: relative; flex: none; width: 50px; height: 30px; border-radius: 15px; border: 0; padding: 0; background: var(--press); transition: background 200ms ${inOut}; }
.vp-toggle::before { content: ""; position: absolute; inset: -7px; }
.vp-toggle span { position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 12px; background: var(--ink); transition: transform 220ms ${inOut}, background 200ms; }
.vp-toggle.on { background: var(--tint); box-shadow: var(--frost-edge); }
.vp-toggle.on span { transform: translateX(20px); background: var(--ink); }

/* Primary */
.vp-start-slot { position: sticky; bottom: 0; margin-top: auto; padding: 28px 0 calc(16px + env(safe-area-inset-bottom)); pointer-events: none; }
.vp-primary { pointer-events: auto; width: 100%; height: 58px; border: 0; border-radius: 18px; background: var(--ink); color: var(--bg); font-size: 17px; font-weight: 500; transition: transform 120ms ${out}, background 200ms, color 200ms; }
.vp-primary:active { transform: scale(.97); }
.vp-primary:disabled { background: var(--surface-2); color: var(--mute); cursor: default; }

/* Talk */
.vp-talk { position: relative; height: 100%; max-width: 640px; margin: 0 auto; padding: env(safe-area-inset-top) 20px 0; display: flex; flex-direction: column; }
.vp-pair {
  display: inline-flex; align-items: center; gap: 10px; height: 40px; padding: 0 16px; border-radius: 14px;
  font-size: 15px; font-weight: 500; --frost: var(--frost-thin);
}
.vp-pair svg { color: var(--mute); }
.vp-stage { display: flex; flex-direction: column; align-items: center; gap: 2px; margin-top: 4px; flex: none; }
.vp-ring { position: relative; }
.vp-ring canvas { position: absolute; inset: 0; }
.vp-blob { position: absolute; inset: 0; display: grid; place-items: center; }
.vp-anchor { position: absolute; left: 50%; width: 1px; height: 1px; }
.vp-anchor-top { top: -80px; }
.vp-anchor-bottom { bottom: -120px; }
.vp-status { font-size: 15px; min-height: 24px; justify-items: center; }
.vp-captions { flex: 1; min-height: 0; width: 100%; max-width: 560px; margin: 0 auto; padding-top: 14px; text-align: center; display: flex; flex-direction: column; }
.vp-earlier { min-height: 24px; margin-bottom: 10px; font-size: 16px; }
.vp-big { font-size: clamp(24px, 6.6vw, 34px); line-height: 1.22; font-weight: 500; text-wrap: balance; }
.vp-small { font-size: 16px; margin-top: 12px; }
.vp-word { display: inline-block; animation: vp-word-in 380ms ${out} backwards; }
@keyframes vp-word-in { from { opacity: 0; color: transparent; text-shadow: 0 0 .28em var(--ink); transform: translateY(.3em); } }
.vp-settled { color: var(--mute); transition: color 400ms ${inOut}; }
.vp-note-slot { margin-top: 18px; }
/* The caption card (Vorp's MessageSurface + CaptionTransition): tinted frost, the corner nearest the
   speaker tightened, the rainbow beam while Vorp speaks, a distortion wave from what was said to its translation. */
.vp-card { border-radius: 22px; text-align: left; isolation: isolate; }
.vp-card.you { --frost: var(--you-frost); border-bottom-left-radius: 8px; --dw-bg: var(--you-card-solid); }
.vp-card.them { --frost: var(--them-frost); border-bottom-right-radius: 8px; --dw-bg: var(--them-card-solid); }
.vp-card-quiet { text-align: center; }
.vp-card-problem { text-align: center; }
.vp-card-title { font-size: clamp(20px, 4.6vw, 24px); font-weight: 500; line-height: 1.25; }
.vp-card-problem .vp-card-small { max-width: 340px; margin: 8px auto 0; text-wrap: pretty; }
.vp-card-action { margin-top: 16px; }
.vp-hold-host.off { opacity: .45; transition: opacity 250ms ${inOut}; }
.vp-hold:disabled { cursor: default; }
.vp-card-wave { border-radius: inherit; }
.vp-card-face { padding: clamp(18px, 3.4vw, 26px) clamp(20px, 3.6vw, 28px); }
.vp-card-big { font-size: clamp(21px, 5.2vw, 28px); line-height: 1.3; font-weight: 500; text-wrap: pretty; }
.vp-card-small { font-size: 15px; margin-top: 10px; }
.vp-note { font-size: 14.5px; color: var(--mute); max-width: 420px; margin: 0 auto; }
.vp-talk-foot {
  flex: none; display: flex; flex-direction: column; align-items: center; gap: 14px; width: 100%; max-width: 500px; margin: 0 auto;
  padding: 12px 0 calc(clamp(28px, 7vh, 72px) + env(safe-area-inset-bottom));
}
.vp-talk-row { display: flex; align-items: center; gap: 12px; width: 100%; }
/* The language switcher: a liquid button whose drops show the languages trading places. */
.vp-swapper { position: relative; flex: none; width: 64px; height: 64px; z-index: 2; }
.vp .vp-swapper-liquid { position: absolute !important; left: -20px; bottom: 0; width: 200px; height: 170px; pointer-events: none; }
.vp-swapper-slot { position: absolute; left: 20px; top: 106px; }
.vp-swapper-slot.drop { left: 28px; top: 114px; }
.vp-swapper-main { pointer-events: auto; width: 64px; height: 64px; border: 0; border-radius: 32px; display: grid; place-items: center; color: var(--ink); transition: transform 150ms ${out}; }
.vp-swapper-main:active { transform: scale(.97); }
.vp-swapper-main svg { transition: transform 560ms ${inOut}; }
.vp-swapper-drop { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 24px; font-size: 14px; font-weight: 500; letter-spacing: .02em; }
.vp-swapper-drop span { opacity: 0; transition: opacity 120ms ease, color 400ms ${inOut}; }
.vp-swapper-liquid.open .vp-swapper-drop span { opacity: 1; transition: opacity 180ms ease 140ms, color 400ms ${inOut}; }
.vp-swapper-main:hover { --frost: var(--frost-press); }
/* The goo is only the milky necks between the frosted drops. */
.vp-swapper-liquid [data-gooey-svg] { opacity: .22; }
.vp[data-theme="light"] .vp-swapper-liquid [data-gooey-svg] { opacity: .55; }
.vp-swapper-drop.you { color: var(--you); }
.vp-swapper-drop.them { color: var(--them); }
.vp-talk-row .vp-hold-host { flex: 1; max-width: none; }
/* Stop: Ultra Reactivate's round stop button, a drawn square inside a border beam. */
.vp .vp-stop-host { flex: none; width: 64px; height: 64px; border-radius: 32px; }
.vp-stop { width: 64px; height: 64px; border: 0; border-radius: 32px; display: grid; place-items: center; transition: transform 150ms ${out}; }
.vp-stop:hover { --frost: var(--frost-press); }
.vp-stop:active { transform: scale(.97); }
.vp-stop-sq { display: block; width: 16px; height: 16px; border-radius: 4px; background: var(--ink); }
.vp-hold-host { width: 100%; max-width: 420px; border-radius: 22px; transition: transform 120ms ${out}, background 200ms; }
.vp-hold-host:has(.vp-hold:active), .vp-hold-host.held { transform: scale(.97); }
.vp-hold-host.held { --frost: var(--you-held); }
.vp-hold { display: block; width: 100%; height: 64px; border: 0; border-radius: inherit; background: none; font-size: 17px; font-weight: 500; touch-action: none; }
.vp .vp-glow-layer { position: absolute; inset: 0; z-index: -1; pointer-events: none; }
.vp-glow-fill { position: absolute; inset: 0; }
.vp-start .vp-spacer-before { flex: 0.45 1 0; }
.vp-start .vp-spacer-after { flex: 1 1 0; }
.vp-start .vp-start-slot { margin-top: 0; padding-top: 20px; }

/* Big screens: two columns. The interpreter and the line on the left, large; the card and Start on the right. */
@media (min-width: 960px) and (min-height: 600px) {
  .vp-page.vp-start { max-width: none; padding: 0 clamp(32px, 5vw, 88px); }
  .vp-start .vp-bar { width: 100%; max-width: 1280px; margin: 0 auto; min-height: 76px; }
  .vp-start-main {
    display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(380px, 1fr); align-items: center;
    gap: clamp(48px, 7vw, 120px); width: 100%; max-width: 1280px; margin: 0 auto;
  }
  .vp-start .vp-hero { padding: 0; }
  .vp-start .vp-halo { --halo: clamp(280px, min(34vw, 50vh), 460px); --halo-r: calc(var(--halo) * .43); --blob-scale: 1.45; }
  .vp-start .vp-hero h1 { font-size: clamp(36px, 3.4vw, 52px); line-height: 1.1; margin: 20px 0 0; }
  .vp-start-panel { width: 100%; max-width: 520px; justify-self: start; }
  .vp-start .vp-group { padding: 8px 24px; border-radius: 26px; }
  .vp-start .vp-row { min-height: 72px; font-size: 17px; }
  .vp-start .vp-swap { top: 56px; }
  .vp-start .vp-start-slot { position: static; padding: 20px 0 0; }
  .vp-start .vp-primary { height: 64px; border-radius: 20px; font-size: 18px; }
  .vp-start .vp-spacer-before { flex: 1 1 0; }
  .vp-start .vp-spacer-after { flex: 1.2 1 0; }
}
.vp-talk-preview { justify-content: center; padding-top: 0; }
.vp-talk-preview .vp-captions { flex: none; min-height: 30%; max-width: 760px; }
.vp-talk-preview .vp-card-big { font-size: 34px; }
.vp-talk-preview .vp-earlier, .vp-talk-preview .vp-small { font-size: 19px; }

/* Enrol */
.vp-enrol { text-align: center; }
.vp-enrol .vp-bar { text-align: left; }
.vp-enrol-ring { display: flex; justify-content: center; margin: 4px 0 8px; }
.vp-pulse { animation: vp-pulse 640ms ${out}; }
@keyframes vp-pulse { 40% { transform: scale(1.06); } }
.vp-read { font-size: 26px; line-height: 1.3; font-weight: 500; min-height: 2.6em; text-wrap: balance; }
.vp-read-word {
  background: linear-gradient(90deg, var(--ink) 50%, var(--mute) 50%) 100% 0 / 200% 100% no-repeat;
  -webkit-background-clip: text; background-clip: text; color: transparent;
  transition: background-position 320ms ${out};
}
.vp-read-word.read { background-position: 0 0; }
.vp-count { font-size: 14px; margin-top: 10px; max-width: 380px; margin-left: auto; margin-right: auto; text-wrap: pretty; }
.vp-read-msg { font-size: 22px; min-height: 0; }
.vp-enrol-actions { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.vp-skip { min-height: 44px; }

/* History */
.vp-demo-row { display: flex; align-items: center; gap: 14px; width: 100%; border: 0; border-radius: 20px; padding: 14px 16px; text-align: left; font-weight: 500; transition: transform 120ms ${out}, background 150ms; }
.vp-list { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.vp-list-row { display: flex; flex-direction: column; gap: 4px; width: 100%; border: 0; border-radius: 20px; padding: 14px 16px; text-align: left; transition: transform 120ms ${out}; }
.vp-demo-row:hover, .vp-list-row:hover { --frost: var(--frost-thin); }
.vp-demo-row:active, .vp-list-row:active { transform: scale(.97); }
.vp-list-top { display: flex; justify-content: space-between; gap: 12px; font-weight: 500; }
.vp-list-top .vp-mute { font-weight: 400; font-size: 14px; }
.vp-list-line { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vp-stagger { animation: vp-row-in 260ms ${out} backwards; }
.vp-foot-note { font-size: 13.5px; text-align: center; margin: 24px 0 32px; }

/* History on big screens: a centred box split 35 / 65, list left, transcript right. */
.vp-page.vp-history-wide { max-width: 1240px; height: 100%; padding: 0 clamp(24px, 4vw, 56px); }
.vp-history-wide .vp-bar { flex: none; }
.vp-split {
  flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(300px, 35fr) 65fr; gap: 24px;
  padding-bottom: clamp(24px, 5vh, 56px);
}
/* Scrolls, so it clips: padded wide enough for the rows' 36px shadows, and pulled back by the same. */
.vp-split-list { min-height: 0; overflow-y: auto; padding: 4px 40px 56px; margin: -4px -40px 0; }
.vp-split-list h1 { margin-top: 0; }
.vp-list-row.on { --frost: var(--tint); }
.vp-split-pane { min-height: 0; border-radius: 26px; overflow: hidden; }
.vp-split-presence { height: 100%; }
.vp-split-scroll { height: 100%; overflow-y: auto; padding: 28px clamp(24px, 3vw, 40px) 8px; }
.vp-split-scroll h1 { margin-top: 0; }

/* History before the first conversation */
.vp-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; padding: 56px 0 32px; }
.vp-empty-title { font-size: 20px; font-weight: 500; margin-top: 10px; }
.vp-empty-line { max-width: 340px; text-wrap: pretty; margin-bottom: 14px; }
/* Transcript: Copy and Delete beside the title; the recap's writing and failed states */
.vp-transcript-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.vp-actions { display: flex; gap: 8px; margin-top: 4px; }
.vp-actions .vp-btn { height: 36px; font-size: 14px; padding: 0 12px 0 10px; }
.vp-recap-status { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

/* Transcript */
.vp-bubbles { display: flex; flex-direction: column; gap: 10px; }
.vp-bubble { max-width: 82%; padding: 12px 18px; border-radius: 22px; }
.vp-bubble.you { align-self: flex-start; --frost: var(--you-frost); border-bottom-left-radius: 8px; }
.vp-bubble.them { align-self: flex-end; --frost: var(--them-frost); border-bottom-right-radius: 8px; }
.vp-bubble p + p { margin-top: 4px; font-size: 15px; }
.vp-bubble-note { font-size: 13.5px; color: var(--mute); margin-top: 8px !important; }
.vp-recap { font-size: 16px; line-height: 1.5; margin-bottom: 14px; }
.vp-recap:last-child { margin-bottom: 40px; }

.vp[data-reduced] *, .vp[data-reduced] *::before, .vp[data-reduced] *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }

/* Vorp: the start slot lets touches through to the page, so every action in it takes them back
   (the design's "Not now" link had none and could not be pressed). */
.vp-enrol-actions > * { pointer-events: auto; }
/* Vorp: a card whose speaker is not known yet carries no hue; the wave pictures it on the plain surface. */
.vp-card.unknown { --dw-bg: var(--surface-2); }

/* Pair by QR, from the owner's design (src/vorp/style.ts, 22 November 2026). */

.vp-start-actions { display: flex; flex-direction: column; gap: 10px; }
.vp-secondary { display: inline-flex; align-items: center; justify-content: center; gap: 10px; width: 100%; height: 52px; border: 0; border-radius: 18px; font-size: 16px; font-weight: 500; color: var(--ink); --frost: var(--frost-thin); transition: transform 120ms ${out}; }
.vp-secondary:hover { --frost: var(--frost-press); }
.vp-secondary:active { transform: scale(.97); }
.vp-secondary svg { color: var(--mute); }
.vp-pair, .vp-guest { text-align: center; }
.vp-pair-main, .vp-guest-main { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding-bottom: 6vh; }
.vp-pair h1, .vp-guest h1 { margin: 0; text-wrap: balance; }
.vp-pair-lede { max-width: 360px; margin: 10px auto 22px; text-wrap: pretty; }
.vp-qr-frame { position: relative; width: fit-content; margin: 0 auto; padding: 14px; border-radius: 30px; isolation: isolate; }
.vp-pair-cancel { margin-top: 6px; min-height: 44px; }
.vp-talk-row.solo { justify-content: center; }
.vp-qr { position: relative; display: block; }
.vp-qr svg { display: block; }
.vp-qr-blob { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: grid; place-items: center; }
.vp-qr-frame.expired .vp-qr { opacity: .12; transition: opacity 300ms ${inOut}; }
.vp-qr-over { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; font-size: 19px; font-weight: 500; }
.vp-primary-sm { width: auto; height: 48px; padding: 0 26px; font-size: 16px; }
.vp-pair-expiry { margin-top: 16px; font-size: 14px; font-variant-numeric: tabular-nums; }
.vp-pair-joined { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.vp-pair-joined h1 { margin-top: 10px; }
.vp-pair-lang { font-size: 19px; }
.vp-pair-lang strong { font-weight: 500; color: var(--them); }
.vp-guest-bar { justify-content: center; }
.vp-guest-hero { display: flex; flex-direction: column; align-items: center; gap: 12px; width: 100%; max-width: 420px; }
.vp-guest-hero h1 { margin-top: 8px; font-size: clamp(26px, 7vw, 34px); }
.vp-guest-body { max-width: 340px; text-wrap: pretty; }
.vp-guest-pick { width: 100%; margin-top: 14px; padding: 4px 10px 4px 18px; border-radius: 20px; text-align: start; }
.vp-row-fixed { color: var(--mute); }
.vp-fixed-lang { padding: 0 14px; opacity: .7; }
.vp-guest-actions { width: 100%; margin-top: 10px; }
.vp-guest-note { font-size: 13.5px; margin-top: 10px; }
/* The other phone, in the conversation header */
.vp-peer { display: inline-flex; align-items: center; gap: 10px; text-align: end; font-size: 14px; font-weight: 500; line-height: 1.2; }
.vp-peer small { display: block; font-size: 13px; font-weight: 400; }
.vp-peer-signal { display: inline-flex; align-items: flex-end; gap: 2px; height: 14px; order: 2; }
.vp-peer-signal i { width: 3px; border-radius: 2px; background: var(--them); transition: opacity 300ms; }
.vp-peer-signal i:nth-child(1) { height: 6px; } .vp-peer-signal i:nth-child(2) { height: 10px; } .vp-peer-signal i:nth-child(3) { height: 14px; }
.vp-peer.reconnecting .vp-peer-signal i { animation: vp-signal 1.2s ${inOut} infinite; }
.vp-peer.reconnecting .vp-peer-signal i:nth-child(2) { animation-delay: .15s; } .vp-peer.reconnecting .vp-peer-signal i:nth-child(3) { animation-delay: .3s; }
.vp-peer.ended .vp-peer-signal i { opacity: .25; background: var(--mute); }
@keyframes vp-signal { 50% { opacity: .2; } }
[data-reduced] .vp-peer-signal i { animation: none !important; }
/* Paired conversation: a short feed, newest at the bottom, older ones fading off the top. */
.vp-pair-talk .vp-stage { flex: none; }
.vp-feed {
  flex: 1; min-height: 0; width: 100%; max-width: 560px; margin: 0 auto; padding: 8px 2px 4px; display: flex; flex-direction: column; justify-content: flex-end; gap: 10px;
  overflow: hidden; -webkit-mask-image: linear-gradient(transparent, #000 56px); mask-image: linear-gradient(transparent, #000 56px);
}
.vp-feed-slot { display: flex; flex-direction: column; animation: vp-row-in 260ms ${out} backwards; }
.vp-feed-card { max-width: 88%; padding: 12px 18px 14px; border-radius: 22px; text-align: left; transition: opacity 300ms ${inOut}, background-color 400ms ${inOut}; }
.vp-feed-card.you { align-self: flex-start; --frost: var(--you-frost); border-bottom-left-radius: 8px; }
.vp-feed-card.them { align-self: flex-end; --frost: var(--them-frost); border-bottom-right-radius: 8px; }
.vp-feed-slot:has(.them) { align-items: flex-end; }
.vp-feed-label { font-size: 12.5px; color: var(--mute); margin-bottom: 4px; }
.vp-feed-label > span { display: inline-flex; align-items: center; gap: 6px; }
.vp-feed-big { font-size: 19px; line-height: 1.32; font-weight: 500; }
.vp-feed-small { font-size: 14.5px; margin-top: 4px; }
/* Waiting its turn: untinted, greyed, its words dim until it plays. */
.vp-feed-card.queued, .vp-feed-card.queuedLive { --frost: var(--frost-thin); opacity: .62; }
.vp-feed-card.queued .vp-feed-big, .vp-feed-card.queuedLive .vp-feed-big { color: var(--mute); }
.vp-feed-shelf { align-self: flex-end; width: 80%; margin-top: -6px; padding: 12px 18px 6px; border-radius: 0 0 18px 18px; background: var(--frost-thin); font-size: 12.5px; text-align: right; opacity: .7; }
/* Playing: each word lights from grey to ink as it's spoken (a mask, not a fade). */
.vp-lit { background: linear-gradient(90deg, var(--ink) var(--lit), var(--mute) var(--lit)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.vp-feed-progress { display: block; height: 3px; margin-top: 10px; border-radius: 2px; background: var(--frost-thin); overflow: hidden; }
.vp-feed-progress i { display: block; height: 100%; background: var(--you); transform-origin: left; }
.vp-heard { color: var(--ink); }
.vp-heard svg { color: #5fd08a; animation: vp-pulse 640ms ${out}; }
.vp-dots { display: inline-flex; gap: 3px; }
.vp-dots i { width: 4px; height: 4px; border-radius: 2px; background: var(--them); animation: vp-signal 1s ${inOut} infinite; }
.vp-dots i:nth-child(2) { animation-delay: .15s; } .vp-dots i:nth-child(3) { animation-delay: .3s; }
.vp-feed-aside { text-align: center; }
/* Join cues: the ring lights up with one ripple as the conversation goes live (and on "They're in"). */
.vp-arrive .vp-ring { animation: vp-ignite 700ms ${out}; }
@keyframes vp-ignite { from { transform: scale(.9); opacity: .4; } }
.vp-ripple { position: relative; }
.vp-ripple::after { content: ""; position: absolute; inset: -30%; border-radius: 50%; box-shadow: 0 0 0 2px var(--them); animation: vp-ripple 900ms ${out} forwards; pointer-events: none; }
@keyframes vp-ripple { from { transform: scale(.6); opacity: .8; } to { transform: scale(1.6); opacity: 0; } }
/* iPhone kept audio locked: one tap turns it on. */
.vp-sound { display: flex; align-items: center; gap: 14px; width: 100%; padding: 16px 18px; border: 0; border-radius: 20px; text-align: start; color: var(--ink); animation: vp-row-in 260ms ${out} backwards; }
.vp-sound svg { width: 22px; height: 22px; flex: none; }
.vp-sound strong { display: block; font-weight: 500; font-size: 17px; }
.vp-sound small { display: block; font-size: 14px; margin-top: 2px; }
/* Booth loop: saved, then a fresh code, counting down. */
.vp-next { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 16px; font-size: 15px; }
.vp-next strong { font-weight: 500; font-variant-numeric: tabular-nums; }
.vp-next-ring { width: 26px; height: 26px; transform: rotate(-90deg); }
.vp-next-ring circle { fill: none; stroke-width: 3; }
.vp-next-ring .track { stroke: var(--frost-thin); }
.vp-next-ring .fill { stroke: var(--ink); stroke-dasharray: 94.25; stroke-linecap: round; transition: stroke-dashoffset 1s linear; }
.vp-end-actions { display: flex; justify-content: center; align-items: center; gap: 18px; margin-top: 14px; }
/* Hands-free, speaker not known yet (the app learns it at the end of an utterance): an untinted card. */
.vp-card.unknown { --frost: var(--frost-thin); border-radius: 22px; }

/* Vorp: the unknown card tints and tightens the speaker's corner as the speaker resolves (the design's solo-mode note). */
.vp-card.vp-frost { transition: background-color 400ms ${inOut}, border-radius 400ms ${inOut}; }
/* Vorp: playback progress arrives four times a second (the contract's rate); the bar and the lit
   words glide between reports instead of stepping. */
@property --lit { syntax: '<percentage>'; inherits: false; initial-value: 0%; }
.vp-lit { transition: --lit 260ms linear; }
.vp-feed-progress i { transition: transform 260ms linear; }
`;
