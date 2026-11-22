# Third-party notices

Vorp is licensed under Apache-2.0. This file lists third-party code that is copied into this
repository. Packages installed as dependencies (for example `@google/genai`, Apache-2.0) are not
copies and are not listed here; their licences ship with the packages.

## Libraries.dev effect engines

- **Source:** [Libraries.dev](https://github.com/Jakubantalik/Libraries.dev) (`packages/*/src`),
  taken via `xuckless/the-wallpaper-project` (`src/ultra-reactivate/vendor/`, commit `598f814`).
- **Licence:** MIT, Copyright (c) 2026 Jakub Antalik. Full text in
  `src/ui/effects/vendor/LICENSE`.
- **Copied into:** `src/ui/effects/vendor/`: `thinking-orbs`, `border-beam`, `distortion-waves`,
  `bot-avatars`, `voice-ring`.
- **Changes:** imports moved back from Preact (`preact/compat`) to React 19; a
  `'use no memo'` directive at the top of the component and hook files keeps the React Compiler
  off them; `voice-ring/useMicrophone.ts` removed (Vorp supplies the audio level itself). Each
  folder's `index.ts` carries a source comment.
