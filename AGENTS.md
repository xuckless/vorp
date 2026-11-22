# Vorp

A live, agentic voice translator. People speak normally; when a speaker stops, Vorp speaks the
translation in the listener's language, and keeps listening while it talks. Built for the GDG
Sudbury hackathon (theme: Language and culture). Submission is due Friday 27 November 2026 at
midnight; the booth demo is Saturday 28 November at Collège Boréal. The project must use the
Gemini API.

`TODO.md` is the roadmap. This file holds the design decisions and the rules of the repo. When a
decision changes, change it here in the same commit as the code.

## Product

- **Conversation setup.** Pick how many people are talking and each person's language. Vorp
  translates every utterance for everyone else.
- **Turn flow.** Listen, detect the end of the utterance, translate, speak. No step blocks
  another: capture continues while a translation is being produced or spoken.
- **Hands-free is the goal.** Push-to-talk per person is the first working version only. The
  target is no buttons: voice activity detection ends the turn and the detected language picks the
  speaker and the direction.
- **The agent is an interpreter, not a chatbot.** It conveys meaning, tone and register, never
  answers on its own behalf, and never adds or drops content.

## Stack

- Expo (React Native, TypeScript, Expo Router) targeting Android, iOS and web from one codebase.
- Bun as package manager and script runner. Fall back to pnpm only if a tool breaks under Bun, and
  record the reason here.
- Gemini API for speech understanding, translation and speech output. Model ids, voices and
  prompts are data in one config module, never string literals in feature code.
- Real-time audio needs native modules, so native runs in a development build, not Expo Go.

### Commands

```bash
bun install                  # install dependencies
bun run web                  # dev server in the browser (also: android, ios)
bun run lint                 # ESLint
bun run typecheck            # tsc --noEmit
bun test                     # unit tests
bun run token-server         # the Anole token server on :8787 (needs Zig 0.17; reads .env)
bun run test:server          # the token server's routes, in memory
bun run e2e:live             # by hand: recorded speech through the web build against real Gemini
bun run export:web           # static web build into dist/
bunx expo install <package>  # add a dependency at the version this Expo SDK expects
bunx expo-doctor             # check dependency and config health
bun run token-server         # Anole token server on :8787 (needs Zig 0.17 and GEMINI_API_KEY)
```

For local development, copy `.env.example` to `.env`, export `GEMINI_API_KEY` for the token
server, and set `EXPO_PUBLIC_TOKEN_URL=http://localhost:8787/token` for the dev app.

Run lint and typecheck before calling a task done. Add packages with `bunx expo install`, not
`bun add`. Expo changes between SDK releases: read the versioned docs for the `expo` major in
`package.json` (`https://docs.expo.dev/versions/v<major>.0.0/`) instead of relying on memory.
`android/` and `ios/` are generated; configure native behaviour in `app.json`.

The web build is a single-page app (`web.output: "single"`), because the app is all client-side
audio and canvas and is served as static files by the token server.

## Architecture

```
src/app/        routes only (Expo Router): compose features, no logic
src/core/       pure domain: types, the session reducer, effects as data. No React, no I/O.
src/services/   I/O behind interfaces: audio capture, audio playback, translator, storage
src/features/   screens and their view models (setup, conversation, settings)
src/ui/         design system: tokens, primitives, slots, effects
src/config/     data tables: languages, voices, models, feature flags, policies
```

`server/` (the token server) sits at the repository root, outside the app.

Dependencies point inward: `app → features → ui / services → core`. `core` imports nothing from
the other folders.

### The session is one state machine

- An **utterance** is the unit of work. Its lifecycle is one enum:
  `capturing → translating → queued → speaking → done | failed`.
- The whole conversation is one state value and one pure function:
  `transition(state, event) -> [state, effects]`. Effects are plain data (`startCapture`,
  `sendAudio`, `enqueuePlayback`, ...) executed by a single effect runner that feeds results back
  as events.
- Asynchrony falls out of the model: many utterances can be in different lifecycle stages at
  once. Listening while speaking is not a special mode.
- The reducer is tested with plain event sequences. No mocks of audio or network are needed to
  test behaviour.

### Services implement shared interfaces

- `AudioInput`, `AudioOutput` and `Translator` are each one interface in `src/services`.
  Platform code (web, native) and provider code (Gemini) implement the interface; nothing outside
  `src/services` knows which implementation is running.
- Platform splits use Expo's `.web.ts` / `.native.ts` file resolution on the implementation only.
  The interface and its tests are shared.

### UI

- **Slots make components hot-swappable.** Each visual role (listening indicator, thinking
  indicator, message surface, agent avatar, voice visualiser) is a slot with a typed contract. A
  registry table maps a slot to an implementation; swapping one is a one-line data change, and
  can be done at runtime from settings.
- **Every component is customisable on its own** through props that default to design tokens.
  No component reads another component's internals or global CSS.
- **Design tokens** (colour, type, spacing, radius, motion) live in one module. Light and dark
  both ship.
- **Motion** follows the rules in the next section. Durations, easings and distances are motion
  tokens; components never hard-code them.
- Accessibility is part of the spec: screen-reader labels, 44pt touch targets, captions for every
  spoken translation, and no information carried by colour or sound alone.

### Motion rules

The governing principle is **Overlap**: nothing waits for something else to finish, and an
interruption retargets from the current value instead of restarting. Reduced motion overrides
every rule below. The imported effects keep their own internal motion.

1. Ease-out for entrances.
2. Dropdowns take 150–250ms.
3. Stagger list rows by 30ms.
4. Scale to 0.97 on press.
5. Stretch moving knobs 12%.
6. Stagger as details settle.
7. Objects move along arcs.
8. Pulse to confirm success.
9. Ease-in-out for moves.
10. Popovers start at 0.95 scale.
11. Enter from the trigger.
12. Exit to the trigger.
13. No bounce on everyday UI.
14. Don't tween while held: a held control follows the finger directly.
15. Exits are 20% shorter than entrances.
16. Overlap old and new states.
17. Masks for reveals and colour changes.
18. Crossfade icons with blur.
19. Rubber band past bounds.

### Imported effects

Source: `xuckless/the-wallpaper-project`, `src/ultra-reactivate/vendor/` (engines originally from
Libraries.dev, MIT, © 2026 Jakub Antalik).

| Role in Vorp | Source | Renders with |
| --- | --- | --- |
| Thinking indicator | `thinking-orbs` | Canvas 2D |
| Golden glow around message surfaces | `border-beam` | CSS |
| Voice distortion | `distortion-waves` | WebGL + DOM snapshot |
| Agent avatar | `bot-avatars` | Canvas 2D + CSS |
| Voice visualiser (candidates) | `voice-ring`, `voice-glow` | Canvas 2D / WebGL, Web Audio |

These are browser code (DOM, canvas, WebGL, Web Audio) ported to Preact. They move to React here,
keep their engine files unchanged where possible, and sit behind slots so the app never imports a
vendor path directly. How they run on native is recorded under Decisions.

## Code principles

1. **Declarative first.** UI is a function of state: components render from the store and
   derive everything else. Config, keybindings, policies and feature tables are data.
2. **No implicit state machines.** A lifecycle is one enum plus one pure
   `transition(state, event) -> [state, effects]`. No scattered booleans, no behaviour that
   depends on callback ordering, no lifecycle hidden in `useEffect` chains.
3. **One owner per state.** Each piece of state lives in one place; everything else derives from
   it. React component state is for local, visual-only concerns.
4. **No duplicated code.** Reuse or extend before writing new. Per-platform code implements one
   shared interface. Two copies of a constant, token or table are duplication.

## Working rules

- **Copy first.** Look for a package or a proven implementation and port it before writing new
  code. Vorp is Apache-2.0, so copied code must be MIT, BSD, Apache-2.0 or MPL-2.0; no GPL or
  AGPL code. Each copy carries a source comment and an entry in `THIRD_PARTY_NOTICES.md`.
- **No performance-dependent tests.** Nothing in `bun test` or CI asserts timings, fps, latency
  or throughput. Performance is measured by hand on the owner's devices.
- **Sprint mode.** Breadth first to spec, each item reviewed for correctness and simplicity.
  Hardening comes at the end of the build-out.
- **Secrets.** No API key is committed or shipped in a client bundle. `.env*` files are ignored.
- **Commits.** Small, one concern each, imperative subject line.

## Decisions

From the design interview with the owner on 21 November 2026.

### Pipeline and backend

- **Gemini Live API** is the pipeline: one streaming session carries audio in and translated
  audio out, with input and output transcripts turned on for captions. There is no cascaded
  fallback; the `Translator` interface leaves room for one.
- **Token server written with Anole** (the owner's Zig server, `xuckless/anole`), in `server/`.
  It holds the Gemini key and issues short-lived Live API tokens to the app. It also serves the
  exported web app, so the demo is one origin with no CORS. It runs on **Google Compute Engine**
  behind TLS (the browser microphone requires HTTPS).
- **Use what Anole ships; hand-roll nothing in `server/`.** Settings come from
  `anole.config.load` (typed, `.env` in development, `anole.Secret` for the key), limits from
  `anole.ratelimit`, probes from `app.health`, plus its CORS, request ids, access log, static
  files, outbound client and `anole.testing` client. Anole's docs for the pinned version are
  its `templates/` and source under `server/zig-pkg/`; the local checkout may be older.
- The token endpoint is public, so it is rate-limited, issues single-session tokens with a short
  expiry, and the key carries a spend cap.

### Gemini Live (docs spike, 21 November 2026)

Read from `aistudio.google.com/docs/live-api` (where `ai.google.dev/gemini-api/docs/live` now
redirects). The tables live in `src/config` (`models.ts`, `voices.ts`, `languages.ts`).

- **Model: `gemini-3.8-live`** for the interpreter, in one session with a system instruction.
  Google also ships **`gemini-3.5-live-translate-preview`**, a dedicated speech-to-speech
  translator, but it takes one `targetLanguageCode` per session, has no voice selection and no
  tools, so two-way would need one session per target language. Not used for now; it is the
  first thing to try if `3.8-live` answers instead of interpreting.
- **Audio**: input raw 16-bit LE mono PCM at 16 kHz (`audio/pcm;rate=16000`, ~100 ms chunks);
  output 16-bit LE mono PCM at 24 kHz, base64 in `serverContent.modelTurn.parts[].inlineData`.
- **Transcripts**: `inputAudioTranscription: {}` and `outputAudioTranscription: {}` in the
  setup; read `serverContent.inputTranscription.text` / `outputTranscription.text`.
- **Push-to-talk turns** (`detection: 'manual'`, the noisy-room fallback):
  `automaticActivityDetection.disabled = true`, and the client sends `activityStart` /
  `activityEnd` around the audio.
- **Languages**: native-audio models pick the output language themselves (no `languageCode`);
  the system instruction steers it. The capabilities page now lists 99 languages.
- **Voices**: any of the 30 prebuilt TTS voices, via
  `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName`. The interpreter uses one voice.
- **Limits**: a connection lasts about 10 minutes; an audio-only session 15 minutes without
  context compression. The app turns on `contextWindowCompression.slidingWindow` and session
  resumption (handles valid 2 h), and reconnects on `goAway` or a drop with a fresh token.
- **Ephemeral tokens**: the server `POST`s `/v1beta/auth_tokens` with `x-goog-api-key`; the
  token is the response's `name` (`auth_tokens/...`). Defaults: `uses: 1`, 30 min expiry
  (max under 20 h), 60 s to start a session; resuming does not count as a use. Tokens work
  only on `v1beta`. The browser passes the token as the SDK's `apiKey`, which switches it to the
  `BidiGenerateContentConstrained` endpoint with `access_token`.
- **Client library**: the official `@google/genai` SDK (Apache-2.0) works in the browser under
  Metro (its `browser` export is picked; web export verified), so the socket is not hand-rolled.
- **Token server**: `server/` depends on Anole `v0.6.0` (git URL in `build.zig.zon`) and needs
  **Zig 0.17.0**; Zig 0.16 cannot build Anole. `POST /token` sends `{"uses":1}` and keeps
  Google's expiry defaults, answers `{token, expireTime}` with `Cache-Control: no-store`, and
  allows any CORS origin for the dev server. Not yet: rate limit, locking the token to the model
  (`bidiGenerateContentSetup` / `fieldMask`), serving `dist/`.
- Platform split: implementations are `*.web.ts` / `*.native.ts`; `tsconfig` sets
  `moduleSuffixes: [".web", ""]` so `tsc` resolves the web file and checks both.
- TypeScript 6 includes no global `types` by default; test files start with
  `/// <reference types="bun" />` so Bun globals stay out of app code.

### Hands-free turns (21 November 2026)

Read from `aistudio.google.com/docs/live-api/capabilities`, `/session-management`,
`/best-practices`, `/models/gemini-3.8-live` and `/api-reference/live`, then checked against
real `gemini-3.8-live` sessions with `bun run e2e:live`.

**Verified live:**

- `voiceActivity` (`ACTIVITY_START` / `ACTIVITY_END`) arrives, and the input transcript arrives
  whole at the end of the utterance.
- **Transcripts carry no `languageCode`.** The model reports the language itself through a
  declared function, `report_language` (`languageTool` in `prompts.ts`), called at the end of the
  utterance; the reducer routes the speaker from it (`sourceLanguage`). The call ends a model
  turn of its own, so the translator swallows that turn's `turnComplete`. It adds no noticeable
  delay. Identifying the language from the transcript text was tried and dropped: trigram
  detection gets short phrases wrong ("Merci beaucoup").
- **With `NO_INTERRUPTION` the model does not listen while it produces a reply**: speech sent
  during a reply is lost. So the runner holds microphone audio from the end of a turn until that
  reply's `turnComplete` and then sends it in one burst, which the server accepts and transcribes
  correctly. The hold is derived state (`replying`) and capped by the overlap row's `holdSeconds`.
- The interpreter prompt holds: the model interprets both ways and does not answer questions.
- Tokens work on `v1beta`, although the SDK warns they are `v1alpha` only.
- Gemini Live's voice detection ignores robotic synthetic voices (espeak); the test fixtures are
  spoken by `gemini-3.8-flash-tts`.
- For noise the model may speak a placeholder such as "<no speech detected>" instead of staying
  silent. Not fixed yet.

**From the docs, as built:**

- **The server's detection is used; no client-side VAD.** Automatic activity detection stays on
  (`detection: 'auto'`, the default). End of turn is `silenceDurationMs: 700` (`LIVE_VAD` in
  `models.ts`; the docs recommend 500–800 ms, server default about 800 ms). Sensitivities and
  `prefixPaddingMs` stay at server defaults (the guide and the SDK describe `prefixPaddingMs`
  differently).
- **Barge-in is off by setting, not by workaround.** By default start of speech interrupts the
  model (`START_OF_ACTIVITY_INTERRUPTS`: generation is cancelled and `interrupted` is sent).
  `realtimeInputConfig.activityHandling = NO_INTERRUPTION` ("the model's response will not be
  interrupted") gives the `queue` overlap policy; the translator maps the policy row to it. The
  docs do not say how the model schedules the reply to speech that arrives during its own reply;
  Vorp assumes replies come in input order, one `turnComplete` each.
- **Push-to-talk inside hands-free is the docs' "hybrid VAD".** Activity signals are only for
  manual detection, so a held button sends nothing at press and `audioStreamEnd` at release,
  which the server treats as immediate end of turn. The button names the speaker. A pause longer
  than the silence threshold while held can still end the server's turn early; the reducer then
  opens a second utterance for the same held speaker.
- **Pausing the stream** (`pauseMicWhileSpeaking`) sends `audioStreamEnd` too, as the docs ask
  for any pause over a second.
- **Language signal**: the reference documents `languageCode` (BCP-47) on
  `BidiGenerateContentTranscription`, for input and output transcripts, and
  `inputAudioTranscription.languageCodes` as hints (Vorp sends the participants' languages). The
  guide pages never mention it, so whether `gemini-3.8-live` fills it is unverified. Routing:
  held button, else input `languageCode`, else (two people) the participant whose language
  differs from the output transcript's `languageCode`, else unknown. In practice neither is
  filled; see `report_language` above.
- **Speech start / end events**: the reference documents a top-level `voiceActivity`
  (`type: ACTIVITY_START | ACTIVITY_END`); the SDK passes Gemini API messages through raw. If it
  does not arrive, an utterance opens on its first input transcript and ends on the first model
  output for it (or `turnComplete`).
- **Transcript ordering**: input transcription has "no guaranteed ordering" with the rest. An
  input transcript belongs to the utterance being captured, else the newest sent turn (this
  fixed the phase 1 bug where it went to the oldest unanswered turn).
- `gemini-3.8-live` has proactive audio permanently on (may choose not to answer) and no
  affective dialogue; `turnComplete` with no output fails the utterance as "no translation".
- **Time limits**: `goAway.timeLeft` warns before the ~10 minute connection ends "as ABORTED"; no
  specific close code is documented for the session limit. Vorp treats `goAway` as the
  `timeLimit` error kind and reconnects with the resumption handle.
- **Error kinds** are data on the session: `micDenied`, `mic`, `token`, `socket`, `timeLimit`.
  Services throw `ServiceError(kind)`; the runner maps it to `audioFailed`, `connectFailed` or
  `connectionLost`.
- The guide recommends 20–40 ms input chunks (100 ms is still within its "20–100 ms"); unchanged.

### Platforms

- **Web is the demo target** and must be flawless. Android and iOS build from the same code and
  get the remaining polish time.
- **Imported effects run as Expo DOM components** on native: the same web code inside a web
  view. Surfaces that wear an effect (caption cards with the glow, the centre stage) are
  therefore rendered inside the DOM component on native, not wrapped around native views.

### Design system plumbing (phase 3, 21 November 2026)

- **Layout**: `src/ui/tokens` (`theme.ts` colour / type / spacing / radius, `motion.ts` pure
  motion tokens and helpers, `reduced-motion.ts` the switch), `src/ui/slots` (contracts,
  stand-ins, registry), `src/ui/effects` (engine-backed slot implementations, `dom/` Expo DOM
  components, `vendor/` the copied engines). Token values are provisional until the design
  prototype replaces them.
- **Slots**: `thinkingIndicator`, `voiceVisualiser`, `agentAvatar`, `messageSurface`,
  `captionTransition`. `SLOT_REGISTRY` in `src/ui/slots/registry.tsx` is the one table;
  `DEFAULT_SLOTS` picks, `chooseSlot` switches at runtime. Every slot has a `plain` stand-in.
  Contracts are plain data so they can cross to a DOM component, except `messageSurface`'s
  `children`. ESLint forbids importing `@/ui/effects` or any `vendor` path outside `src/ui`.
- **One DOM component per engine** (`'use dom'`, `src/ui/effects/dom/*Dom.tsx`), used on both
  platforms: on web it renders inline, on native in `@expo/dom-webview` (bundled with SDK 58, no
  install). The `dom` prop sizes the web view. Inside a web view the page is made transparent.
- **Deviation from "Platforms" above, for the owner to confirm**: the border beam is a DOM
  layer laid *over* the native caption card (pointer events off), so the card stays native and
  `messageSurface` can take children. The distortion wave needs to picture the DOM it crosses,
  so `captionTransition` takes the two caption texts and draws them inside its DOM component.
- **Voice ring level**: the ring is never given a stream; the slot takes `level` as a number or
  a getter. On web the getter goes straight to the engine (sampled per frame, no React renders);
  on native it is sampled at 20 Hz and sent as numbers (`effects/level.native.ts`).
  `useMicrophone` was removed from the vendored copy. The listening level is computed from the
  microphone's PCM chunks and the speaking level comes from `AudioOutput.level()`
  (`features/conversation/levels.ts`).
- **The avatar talks**: the slot's `talk` level opens the bot's mouth while the interpreter
  speaks. This is the one behavioural change to a vendored engine (`bot-avatars`, marked "Vorp").
- **Engines keep their own colours.** The ring's spectrum, the bot's palette and the orb's ink
  are used as Ultra Reactivate ships them; a slot's `color` prop overrides only when given.
- **Pausing**: `useEffectsPaused` = reduced motion (user switch or system) or app not active
  (`AppState`, which follows page visibility on web); it sets each engine's `paused` /
  `active`. Offscreen pausing is the engines' own IntersectionObserver, which works on web but
  inside a native web view sees only the web view's own viewport.
- **Vendored code** is not linted and opts out of the React Compiler with `'use no memo'` (it
  writes refs during render). The thinking orb is tuned at 64/32/20 px only; other sizes draw at
  the nearest tuned size below and scale with CSS.

### Conversation

- **One shared device**: one microphone, one speaker, placed between the participants.
- **Two people must work flawlessly; three is best effort.** The data model is N-person from the
  start. With three languages the translation is spoken once per other language, in turn.
- **Hands-free with a fallback.** Voice activity detection ends the turn; the detected language
  identifies the speaker and the direction. A per-person button stays available for noisy rooms
  and for participants who share a language.
- **Overlap policy: keep talking, queue the next.** Vorp finishes the current translation while
  capturing new speech, then speaks the next one in order. The policy is a value in a table, so
  ducking or barge-in can be added as rows (`OVERLAP_POLICIES` in `src/config/policies.ts`,
  handed to the reducer in `SessionSettings`; `core` never imports config).
- **Echo**: platform echo cancellation, plus a guard that drops a captured utterance whose
  transcript matches what Vorp is speaking (60% of its words, `ECHO_MATCH`). The dropped
  utterance stays in the response order so the model's reply to it is dropped too. Held-button
  speech is never treated as echo. `pauseMicWhileSpeaking` exists as an emergency flag, off by
  default.
- **The microphone is derived state**: `micOpen(session)` decides whether audio flows, and
  `transition` emits `startCapture` / `stopCapture` when it changes.
- **One interpreter voice first.** The build-out uses a single Gemini voice and one Live session
  (owner, 21 November 2026). A voice per person is wanted but comes after everything else works;
  `Participant` carries a `voice` field from the start so adding it later is not a rewrite.
- **Start in one tap.** The app opens on the stage with the last-used setup (default: two
  people, English and French). Languages, voices and the people count are edited inline.
- **Languages**: everything the Live model supports, from one generated table, with English and
  French pinned first.

### Agent behaviours

- **Tone and register**: carried across, with a per-conversation setting (casual, formal, ...).
- **Cultural notes**: idioms and references get a caption-only note; never spoken.
- **Asks when unsure**: asks the speaker to repeat, in the speaker's language. Experimental;
  behind a flag until it proves reliable.
- **Recap**: a bilingual summary at the end of a conversation.

Each behaviour is a row in a feature table that contributes prompt text and, where needed, a
tool declaration. Turning one off removes its row's contribution; no feature code branches on it.

### Interface

- **Orb stage with captions** is the main screen: the centre stage, the last few utterances as
  caption cards below it, participant buttons at the bottom, and a button at the top that opens
  the full **transcript page**.
- **Centre stage**: the bot avatar inside the voice ring. The ring follows the microphone level
  while listening and the output level while speaking, and leans toward the active speaker.
  Thinking orbs take over while a translation is being produced.
- **Golden glow** (border beam) marks the caption card being spoken.
- **Distortion wave** carries the original caption card into its translation.
- **Look** (owner, 21 November 2026): sleek and minimal. Graphite base, Geist in two weights, the
  real Ultra Reactivate widgets as the only ornament, plain text and space for everything else.
  The stage is one column: wordmark and languages, the ring with the avatar inside, one status
  line, the caption being spoken, one button per person. Light and dark both ship.
- **Avoid, unless there is a very strong reason**: tags and pills, italics, serif display faces,
  negative kerning, detailed UI, dividers, colour shades and opacities, bordered containers,
  diagrams, redundant text, code breadcrumbs, section numbering, eyebrows, dithering, ASCII
  images, squircles, mono fonts, all-caps subtitles, gradient backgrounds, periods in titles.

### Data and licence

- **Persistence**: settings and conversation history on the device only. No accounts, no cloud.
  Audio is never stored.
- **Licence**: Apache-2.0, public repository.
