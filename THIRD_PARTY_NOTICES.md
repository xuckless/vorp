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
  `bot-avatars`, `voice-ring`, `voice-glow`, `liquid-gooey`.
- **Changes:** imports moved back from Preact (`preact/compat`) to React 19; a
  `'use no memo'` directive at the top of the component and hook files keeps the React Compiler
  off them; `voice-ring/useMicrophone.ts` removed (Vorp supplies the audio level itself). `bot-avatars` gained a `talk`
  level that opens the mouth while the interpreter speaks (marked "Vorp" in `types.ts`,
  `BotAvatar.tsx` and `draw.ts`). `voice-glow/useMicrophone.ts` removed for the same reason as
  the ring's. `liquid-gooey`: `createPortal` imported from `react-dom`, Vite's `import.meta.hot`
  guard removed and `import.meta.env.DEV` read as `__DEV__` (Metro has no `import.meta`).
  `distortion-waves/capture.ts` `backgroundOf` reads a `--dw-bg` custom property first, so a
  frosted (translucent) card names the solid colour the wave pictures it on (from the owner's
  Vorp design, `xuckless/the-wallpaper-project` `src/vorp/distortion-waves`, 22 November 2026).
  Each folder's `index.ts` carries a source comment.

## blobatar

- **Source:** [Alain00/blobatar](https://github.com/Alain00/blobatar), `packages/blobatar/src` and
  the Preact adapter `packages/preact/src` (`index.tsx`, `gaze.ts`), commit
  `2c29a50bc162a2f78ad26548dca02988813fe473` (v2.7.0), taken via the owner's Vorp design
  (`xuckless/the-wallpaper-project`, `src/vorp/blobatar`).
- **Licence:** MIT, Copyright (c) 2026 Alain. Full text in
  `src/ui/effects/vendor/blobatar/LICENSE`.
- **Copied into:** `src/ui/effects/vendor/blobatar/` (the adapter in `react/`).
- **Changes:** the Preact adapter is ported back to React 19 (hooks from `react`, `className`,
  React's JSX types) and opts out of the React Compiler with `'use no memo'`. The core is
  unchanged.

## Vorp design (the owner's)

- **Source:** the owner's signed-off Vorp design, `xuckless/the-wallpaper-project` `src/vorp/`
  (Preact prototype, 22 November 2026). The owner's own work, contributed to Vorp under
  Apache-2.0.
- **Copied into:** `src/ui/dom/` (styles, controls, aurora, ring, logo, caption card, glow,
  swapper) and the DOM screens in `src/features/app/dom/`.
- **Changes:** Preact to React 19, wired to the app's session, settings, enrolment and history
  instead of the prototype's scripted data.

## Wubble glass

- **Source:** the owner's wubble design, `xuckless/the-wallpaper-project`
  (`src/wubble/core/tokens.ts` `glass` and `src/wubble/core/wubble.css` `.wb-thin/.wb-regular/.wb-thick`,
  commit `598f814`). The owner's own work, contributed to Vorp under Apache-2.0.
- **Copied into:** `src/ui/tokens/glass.ts` (the tier values) and `src/ui/primitives/Glass.tsx`.
- **Changes:** the neutral milk fill takes a tint; shadows are scaled down on the light theme;
  the 3.5% top gradient is left out.

## WeSpeaker ResNet34-LM voiceprint model (weights, CC-BY-4.0)

Data, not code: the one licence exception, approved by the owner on 21 November 2026 (see
`AGENTS.md`, Working rules).

- **Model:** WeSpeaker ResNet34-LM speaker embedding model, trained on VoxCeleb.
- **Authors:** the WeSpeaker project ([wenet-e2e/wespeaker](https://github.com/wenet-e2e/wespeaker);
  Hongji Wang et al., "WeSpeaker: A research and production oriented speaker embedding learning
  toolkit", ICASSP 2023), packaged by pyannote
  ([pyannote/wespeaker-voxceleb-resnet34-LM](https://huggingface.co/pyannote/wespeaker-voxceleb-resnet34-LM))
  and exported to ONNX by onnx-community
  ([onnx-community/wespeaker-voxceleb-resnet34-LM](https://huggingface.co/onnx-community/wespeaker-voxceleb-resnet34-LM),
  commit `6a61a1833ff2583aabeba044f5c8221f00b67ceb`).
- **Licence:** Creative Commons Attribution 4.0 International,
  <https://creativecommons.org/licenses/by/4.0/>.
- **Copied into:** `public/models/onnx-community/wespeaker-voxceleb-resnet34-LM/`
  (`config.json`, `preprocessor_config.json`, `README.md`, `onnx/model_quantized.onnx`), served
  with the web build.
- **Changes:** none to the weights; only the 8-bit quantised file is kept. Its `README.md` gains
  this attribution.

## Voiceprint runtime in the web build

Not committed: `scripts/voiceprint/assets.ts` copies these from installed packages into
`public/voiceprint/`, so the web build redistributes them with their licences beside them.

- **transformers.js** (`@huggingface/transformers`, `dist/transformers.min.js`): Apache-2.0,
  Copyright Hugging Face. Licence copied as `transformers.LICENSE.txt`.
- **ONNX Runtime Web** (`onnxruntime-web`, `dist/ort-wasm-simd-threaded.{mjs,wasm}`): MIT,
  Copyright (c) Microsoft Corporation. The package ships no licence file, so a notice is written
  as `onnxruntime-web.LICENSE.txt`.
