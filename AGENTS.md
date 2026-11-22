# Vorp

A live, agentic voice translator. People speak normally; when a speaker stops, Vorp speaks the
translation in the listener's language, and keeps listening while it talks. Built for the GDG
Sudbury hackathon (theme: Language and culture). Submission is due Friday 27 November 2026 at
midnight; the booth demo is Saturday 28 November at Collège Boréal. The project must use the
Gemini API.

`TODO.md` is the roadmap. This file holds the design decisions and the rules of the repo. When a
decision changes, change it here in the same commit as the code.

## Product

- **One owner's interpreter** (owner, 21 November 2026). Vorp is one person's device, with no
  accounts. The owner ("you") sets their native language; the other person ("them") gets a
  language the owner picks. Everything that is not in the owner's language is translated into
  it, whatever language it is. The owner's speech goes into the picked language or, with
  auto-detect, into the language the other person last spoke.
- **Turn flow.** Listen, detect the end of the utterance, translate, speak. No step blocks
  another: capture continues while a translation is being produced or spoken.
- **Hands-free is the goal.** Push-to-talk is the first working version only. The target is no
  buttons: voice activity detection ends the turn and the detected language picks the speaker
  (the owner's language is the owner, any other is the other person) and so the direction.
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
bun run test:server          # the token server's routes (pairing over a loopback socket)
                             # one group: cd server && zig build test -Dtest-filter=pairing
bun run e2e:live             # by hand: recorded speech through the web build against real Gemini
bun run smoke:voiceprint     # by hand: the voiceprint model on recorded voices, cosine scores
bun run voiceprint:assets    # voiceprint runtime into public/voiceprint/ (web and export:web run it)
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

- `AudioInput`, `AudioOutput`, `Translator` and `VoiceEmbedder` are each one interface in `src/services`.
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
  **One exception, approved by the owner (21 November 2026):** the voiceprint model's weights
  (WeSpeaker ResNet34-LM, `onnx-community/wespeaker-voxceleb-resnet34-LM`) are CC-BY-4.0. They
  are data, not code, and ship with attribution in `THIRD_PARTY_NOTICES.md`. Any other non-code
  licence needs the owner's approval too.
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
  allows the dev server's CORS origin. `/token` and `/recap` share a per-client limit
  (`TOKEN_RATE_LIMIT`, 20 a minute), keyed on the client address. Behind the TLS proxy or load
  balancer that address is the proxy's unless Anole trusts it: set `ANOLE_PROXY_TRUSTED` (its
  addresses or CIDR ranges) or `ANOLE_DEPLOYMENT=behind_proxy`, and Anole takes the client from
  `X-Forwarded-For`. Visitors behind one NAT still share a bucket, so raise `TOKEN_RATE_LIMIT`
  for the booth. Not yet: locking the token to the model (`bidiGenerateContentSetup` /
  `fieldMask`).
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
  utterance; the reducer routes the speaker from it (`sourceLanguage`). It takes any BCP-47 code,
  not an enum of the setup's languages (an enum made Hindi in an English and French session come
  back as "<no speech detected>"); the translator maps the report onto the languages table with
  `normaliseLanguage` (exact code, else primary subtag, else language name, else kept as is).
  The call ends a model
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
- For noise or echo the model may answer with a stage direction such as "<no speech detected>" or
  "<no speech>{pause}" instead of staying silent. The prompt forbids it; the app ignores it (see
  Noise below).

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
  `inputAudioTranscription.languageCodes` as hints (Vorp sends the owner's and the picked
  language). The guide pages never mention it, so whether `gemini-3.8-live` fills it is
  unverified. **Routing** (owner, 21 November 2026): the owner's held button, else a voice verdict
  (`speakerRecognised`, `routedBy: 'voice'`, see "Voiceprint" below), else the language: the owner's language is the owner, any other is the other person. The
  language comes from `report_language`, else the input `languageCode`; with neither, a reply in
  the owner's language means the other person spoke. Language reports on the other person's
  utterances (not in the owner's language) set `otherLanguage`, which the UI shows and which the
  conversation ending (stopped or failed), a new conversation or a new setup clears.
- **Auto-detect is a prompt rule.** The Live API takes the system instruction only at setup, so
  the prompt tells the model: the owner's speech goes into the language the other person spoke
  most recently, the picked one until they have spoken; with auto-detect off, always the picked
  one. `theirLanguage(session)` is the reducer's view of the same rule.
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

### Behaviours, recap, storage and the demo (21 November 2026)

- **Behaviours are rows** (`src/config/behaviours.ts`): `TONES` (one chosen) and `BEHAVIOURS`
  (each on or off). A row adds a rule to the interpreter's prompt and, where it needs one, a tool
  declaration. `SessionSettings` carries the chosen ids to the translator; the reducer does not
  read them. Cultural notes use the `add_note` tool: the note arrives as a `note` event and lands
  on the utterance being answered; it is shown under the caption and never spoken.
- **The setup changes only between sessions**, with one `configure` event (people and
  settings). The Live API takes the system instruction, tools and voice at session setup.
- **A conversation is archived when it stops or fails** (`archive` effect, only if something was
  heard; a failure also releases the microphone and the socket),
  and `start` begins a new one. The history keeps text only, the newest 50, on the device.
- **Recap**: `POST /recap` on the token server sends the conversation to `gemini-3.8-flash` and
  returns one summary per language; the key stays on the server. The route is bounded (400 lines,
  24 KB, 4 languages) and shares the token rate limit. It runs when a conversation ends, if the
  recap row is on, and the transcript opens to show it.
- **Storage** is one `KeyValueStorage` interface over AsyncStorage, which is localStorage on web.
  The owners of state do not move: `features/settings/saved.ts` snapshots the session's setup,
  the slot choices and the theme and motion preferences, and puts a snapshot back at start,
  keeping only values the tables still know (`snapshot.ts`, pure).
- **The demo is the real stage on scripted services** (`services/demo.ts`, script in
  `config/demo.ts`): recorded voices play through the real audio output, so the ring, the mouth,
  the wave and the glow all run as they do live. It needs no microphone, network or key, ends
  after its last line and shows a canned recap. It keeps nothing.
- **Noise**: a reply made only of bracketed `<...>` / `{...}` tokens is not a translation
  (`isPlaceholder` in `core/session.ts`, the one definition). `wasHeard` rejects it, so it is not
  a caption, a transcript line, a history line or recap input; history read from storage drops
  such lines too. The prompt tells the model to produce nothing for noise.
- **Brand**: the mark is the voice ring as two strokes in its own spectrum (`assets/brand`, with
  its README). App icons, favicon and splash are generated from it.
- **Glass** (owner, 21 November 2026): wubble's coloured frost (`src/ui/tokens/glass.ts`, the
  `Glass` primitive): backdrop blur, saturate 170%, a translucent fill, a faint inner light and a
  soft shadow, in wubble's three tiers. The fill takes a tint; transcript lines are chat bubbles
  of `regular` glass in their speaker's hue. This is a chosen exception to "no opacities" and "no
  bordered containers". On native there is no backdrop blur, only the fill and shadows.
- **Primitives** (`src/ui/primitives`): `Press` (scale 0.97 while held), `Layer` (a popover that
  grows from its trigger, or a sheet that rises; exits 20% faster), `usePresence`, `transition`.

### Pairing (22 November 2026)

The client contract is `docs/pairing-protocol.md`; change it with the server.

**Owner's decisions:**

- Two phones in one live translation session for the booth demo. The host starts a paired
  session from a second button on the Start page and shows a QR code; the guest scans it, picks
  their native language and taps Join (the tap grants the microphone). Joining is by QR only, no
  typed code.
- Each phone runs its own Gemini Live session (tokens from `POST /token`) that translates its
  owner's speech into the other person's language. The server only relays: translated audio,
  captions (both sides) and control messages. Each person hears only the other, translated.
- Either side's Stop ends it for both. One guest per code, a fresh code per session, unused
  codes expire after 10 minutes, the code is single-use and unguessable.
- The host keeps the conversation in History; the guest keeps nothing and is sent to the product
  landing page.

**Server design** (`server/src/pairing.zig`, `server/src/rooms.zig`):

- `POST /rooms` makes a room: a 128-bit code (base64url, for the QR) and a host key (kept by the
  host, never in a URL). `WS /rooms/:code` is one socket per phone; the first message is
  `hello` with the role, the language and, for the host, its key. The guest's hello pairs the
  room and spends the code; the host learns the guest's language from `peer_joined`, the guest
  the host's from its `welcome`.
- In memory only, one server instance. Room states are a pure value (`rooms.Registry`: every
  call takes the time, so tests move a fake clock), under one mutex in `Pairing`. The relay is
  Anole's `websocket.Rooms` (one room per code): a phone that stops reading fills only its own
  1 MiB queue and is cut off. Sockets are Anole WebSocket callbacks.
- **No timers.** Expiry is checked when something touches the room: a message from either side
  (phones ping every 15 s), a hello, or the next `POST /rooms` (which sweeps every room and tells
  waiting hosts `expired`).
- **A drop is not an end** (added for the paired design's "Reconnecting to their phone"): a
  paired side whose socket closes is away for up to 60 s; the peer gets `peer_away`, and the side
  rejoins with its key (the guest's key comes in its `welcome`), the peer then getting
  `peer_back`. A rejoin replaces a socket the server still holds (an epoch per side). Past 60 s
  the room ends (`host_left` / `guest_left`). A waiting host that drops loses its code. Stop
  always ends it for both.
- **Relayed types** are the phones' own and the server reads only `type`: `speaking` (owner
  talking or not, drives the playback hold), `turn` (talking, translating, ready, done, failed,
  keyed by a turn id the sender assigns), `caption` (source or translation text as deltas),
  `playback` (queued, playing with progress, heard, from the listener back to the speaker) and
  binary frames of 24 kHz 16-bit PCM. Nothing is relayed before pairing or while the peer is
  away.
- **Bounds**: 64 KiB frames, 4 KiB text messages, a per-socket relay rate on Anole's memory
  limiter (600 tokens a second, burst 3000, a message costing 1 plus 1 per KiB), 60-minute
  sockets, `ROOM_RATE_LIMIT` (30 a minute per client, room creation and socket opens),
  `ROOMS_PER_CLIENT` (10) and `MAX_ROOMS` (100). Ended rooms are remembered about 10 minutes so
  a late scan hears `taken`, `expired` or `host_gone`, at most three per live-room slot.
- The socket accepts any page origin (`allowed_origins = .any`): it carries no cookies, and the
  code and keys admit it. Anole takes WebSocket upgrade options at compile time, so the runtime
  `CORS_ORIGIN` cannot feed an origin list. `POST /rooms` uses the same CORS as `/token`.
- WebSocket tests run over a loopback socket (as Anole's realtime template does): under
  `anole.testing` a WebSocket callback route panics on a plain GET (`res._conn` is null), which
  is reported upstream, not worked around.

### Conversation

- **One owner's device** (owner, 21 November 2026): one microphone, one speaker, between the
  owner and one other person. Exactly two roles, `owner` and `other` (`People` in
  `core/session.ts`); three-person mode is gone.
- **Auto-detect their language** is a setting, on by default (`autoDetect` in
  `SessionSettings`). On: the owner's speech goes into the language the other person last spoke,
  the picked one until they speak. Off: always the picked one.
- **Hands-free with a fallback.** Voice activity detection ends the turn; the owner's voiceprint,
  else the detected language, identifies the speaker and the direction. A hold-to-talk button
  stays available for noisy rooms, **for the owner only** (owner, 21 November 2026): the reducer
  ignores `pressTalk` for `other`, and `held` can only be `'owner'`. The current stage still
  draws a "Them" button, which now does nothing; the owner's redesign removes it.
- **You and them never share a language** (owner, 21 November 2026). `configure` refuses a setup
  where `sameLanguage(owner, other)` (primary subtag, so `pt-BR` and `pt-PT` count as one) and
  keeps the previous one; `validPeople` is the rule, `pickableLanguages(people, role)` and
  `withLanguage` in `features/conversation/people.ts` are what pickers call, and a saved
  snapshot with both the same is repaired on read.
- **After a conversation stops, "them" goes back to the picked language**: the detected
  language is forgotten (`otherLanguage` cleared on stop or failure; `theirLanguage` and
  `shownLanguage` then return the pick). The archive still records what they spoke. Auto-detect
  keeps the picked language as a transcription hint, and the other person speaking the owner's
  language does not change their language.
- **Overlap policy: keep talking, queue the next.** Vorp finishes the current translation while
  capturing new speech, then speaks the next one in order. The policy is a value in a table, so
  ducking or barge-in can be added as rows (`OVERLAP_POLICIES` in `src/config/policies.ts`,
  handed to the reducer in `SessionSettings`; `core` never imports config).
- **Echo**: platform echo cancellation, plus two guards that drop a captured utterance as an
  echo. The transcript guard drops one whose transcript matches what Vorp is speaking or has just
  spoken (its last two finished translations, since held audio arrives late; 60% of its words,
  `ECHO_MATCH`). The voice guard drops one whose voice matches Vorp's own (see "Voiceprint"). The
  dropped utterance stays in the response order so the model's reply to it is dropped too.
  Held-button speech is never treated as echo. The owner chose "keep listening, filter": the
  microphone stays open while Vorp speaks; `pauseMicWhileSpeaking` exists as an emergency flag,
  off by default.
- **The microphone is derived state**: `micOpen(session)` decides whether audio flows, and
  `transition` emits `startCapture` / `stopCapture` when it changes.
- **One interpreter voice first.** The build-out uses a single Gemini voice and one Live session
  (owner, 21 November 2026). A voice per person is wanted but comes after everything else works;
  `Person` carries a `voice` field from the start so adding it later is not a rewrite.
- **Start in one tap.** The app opens on the stage with the last-used setup (default: you
  English, them French, auto-detect on). Snapshots from before the owner model map the first
  saved participant to the owner and the second to the other; history entries the same way.
  Languages and voices are edited inline.
- **Languages**: everything the Live model supports, from one generated table, with English and
  French pinned first.

### Voiceprint (phase 2, 21 November 2026)

Owner decisions: speaker recognition with a voiceprint, on the device; the model ships with the
app; a voice echo filter instead of muting the microphone.

- **Model**: WeSpeaker ResNet34-LM (VoxCeleb), the onnx-community ONNX export, 8-bit
  (`onnx/model_quantized.onnx`, 6.7 MB, commit `6a61a18`), run with transformers.js
  (`@huggingface/transformers`, Apache-2.0) on ONNX Runtime Web's CPU WASM backend (MIT):
  `WeSpeakerFeatureExtractor` (80-dim Kaldi fbank at 16 kHz) in, a 256-dim embedding
  (`last_hidden_state`) out. Table in `src/config/voiceprint.ts`. CC-BY-4.0 weights, the
  licence exception under Working rules.
- **Shipped, same origin**: the model files are committed under `public/models/` (Expo copies
  `public/` into `dist/`, which the token server serves). The runtime (transformers.js's
  self-contained `transformers.min.js`, ONNX Runtime's plain `ort-wasm-simd-threaded.{mjs,wasm}`,
  14 MB, and the worker) is copied from node_modules into `public/voiceprint/` by
  `scripts/voiceprint/assets.ts`, gitignored, so versions always match the lockfile; the script
  refuses an onnxruntime-web that is not the one transformers.js pins. Remote models are off and
  the WASM paths are set before the first session: nothing is fetched from Hugging Face or a CDN
  (checked in headless Chrome against `dist/`). The worker is not in the Metro bundle.
- **In a Web Worker** (`services/voice-worker.ts`, built by the assets script; protocol in
  `voice-protocol.ts`), one embedding at a time, single-threaded unless the page is
  cross-origin isolated. `VoiceEmbedder` is the interface; `voice-embedder.web.ts` drives the
  worker, `voice-embedder.native.ts` (and the demo) is `NO_VOICE`, unavailable, so language
  routing applies. One embedder per page (`voiceEmbedder()`), shared by enrolment and
  conversations.
- **Enrolment**: the owner reads three sentences in their own language
  (`ENROLMENT_SENTENCES` in `config/enrolment.ts`, a data table; English for languages without
  a row). `features/enrolment/enrolment.ts` is the state machine
  (`loading → notEnrolled | enrolled | unavailable`, then `recording` sentence 1..3 `→ computing →
  enrolled | failed`); a reading with under 2 s of voice is asked for again. The three
  embeddings are averaged (unit vectors, `average` in `core/voiceprint.ts`) and stored with
  `KeyValueStorage` under `vorp.voiceprint.v1`: the embedding, model id, language and date, never
  audio. Redo keeps the old print until a new one replaces it; delete removes it. A print from
  another model is discarded on read. `createEnrolment` (`controller.ts`) is the runner,
  created once at boot; the UI calls `begin(language)`, `next`, `cancel`, `remove` and reads
  `useEnrolment`, `currentSentence`, `enrolmentProgress`, `needsEnrolment`, `level()`.
- **Routing**: whenever an utterance stops capturing (not dropped), the reducer emits
  `recogniseVoice`. The runner takes the microphone audio *sent to the translator* since the
  previous one (so audio held during a reply counts when it is released), at most the last 8 s,
  drops quiet frames (`voicedSamples`, an energy gate for the embedding only; turns stay the
  server's) and, with at least 1.5 s of voice left, embeds it and judges it (`judgeVoice`):
  `speakerRecognised { speaker, utteranceId }` when confident, nothing when unsure, not
  enrolled or too short. The verdict names its utterance because it arrives after newer speech
  may have started.
- **Voice echo filter**: Vorp's own voice is learnt per conversation from the translations it
  plays (24 kHz output resampled to 16 kHz; the first five long enough are averaged, reset when
  the interpreter voice changes). An utterance closer to it than to the owner's print and above
  the echo threshold is `echoRecognised`, dropped through the same path as a transcript echo,
  while it is still capturing or translating (too late once its reply plays). It works without
  enrolment. The transcript guard stays.
- **Thresholds are provisional** (`VOICE_THRESHOLDS`: owner 0.4, other 0.25, echo 0.4; clip
  minimum 1.5 s): set from `bun run smoke:voiceprint` on TTS voices and to be tuned by hand on
  the owner's devices. No test asserts them or any timing. On the TTS clips, single 1–3 s clips
  of one voice scored 0.08–0.49 against each other and different voices up to 0.38; two-clip
  prints separated better (same voice 0.52, others at most 0.16; Vorp's voice 0.43–0.48 against
  its print, other voices at most 0.30). Short utterances will often be unsure.

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
  caption cards below it, hold-to-talk buttons at the bottom, and a button at the top that opens
  the full **transcript page**.
- **Centre stage**: the bot avatar inside the voice ring. The ring follows the microphone level
  while listening and the output level while speaking, and leans toward the active speaker (the
  owner on the left, the other person on the right).
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

- **Persistence**: settings, conversation history and the owner's voiceprint (an embedding) on
  the device only. No accounts, no cloud. Audio is never stored.
- **Licence**: Apache-2.0, public repository.
