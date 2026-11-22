# Vorp brand

The mark is the voice ring reduced to two strokes of light: a full loop and a thinner second pass
that runs inside it, touching at the lower left and parting at the upper right, like one voice
traced twice in a long exposure. Its only colour is the ring's own spectrum, blue at the lower
left to warm orange at the upper right. The wordmark is "Vorp" in Geist Medium, as outlines.

## Colours

| Role | Hex |
| --- | --- |
| Spectrum stop at 0 (blue) | `#4c8dff` |
| Spectrum stop at 0.3 (violet) | `#8f6bff` |
| Spectrum stop at 0.7 (pink) | `#f25cc4` |
| Spectrum stop at 1 (warm orange) | `#ffa24c` |
| Graphite (background, ink on light) | `#0d0f11` |
| Paper (light surface) | `#f5f3ee` |
| Ink on dark | `#f2efe8` |

The spectrum is a linear gradient from (120, 412) to (392, 100) in the mark's 512 box. It is used
only as the ring's light, never as a background.

## Rules

- Clear space: keep half the mark's diameter free on every side of the mark, and the same around
  the lockup.
- Minimum size: mark 16 px; wordmark and lockup 64 px wide.
- On photos or mid-tone surfaces use a mono version.
- The soft glow in the app icon, splash and social card is for graphite only.

## Files

- `logo-trace.svg`: the app's header logo standing still ("vorp" traced twice in light, its o the
  voice ring at rest); live in the app as `src/ui/dom/Mark.tsx`. Works on graphite and paper
- `mark.svg`: the mark in spectrum, transparent
- `mark-mono-light.svg`: graphite mark for light surfaces
- `mark-mono-dark.svg`: ink mark for dark surfaces
- `wordmark.svg`, `wordmark-light.svg`: for dark and light surfaces
- `lockup.svg`, `lockup-light.svg`: mark and wordmark, for dark and light surfaces
- `og.png`: 1200 × 630 social card
- `explore-2.svg`, `explore-3.svg`: runner-up directions (open loop, overshooting loop), not for use
- App icons in `../images/`: `icon.png`, `android-icon-foreground.png`,
  `android-icon-background.png`, `android-icon-monochrome.png`, `splash-icon.png`, `favicon.png`
