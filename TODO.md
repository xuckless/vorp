# Vorp roadmap

Submission: Friday 27 November 2026, midnight. Booth demo: Saturday 28 November, Collège Boréal.
Design decisions are in `AGENTS.md`. Phases run in order; the day is a target, not a rule. Sprint
mode applies: reach breadth first, harden in phase 7.

## Phase 0: Foundations (Sat 21)

- [x] `AGENTS.md`, `.gitignore`, `LICENSE` (Apache-2.0), git repository
- [x] Design interview; decisions recorded in `AGENTS.md`
- [x] First commit
- [ ] Create the public GitHub repository `xuckless/vorp` and push
- [x] Scaffold Expo SDK 58 (TypeScript, Expo Router) with Bun; web export builds and renders
- [ ] Confirm Android and iOS start (needs a device or emulator)
- [x] Folder layout from `AGENTS.md`: `src/{app,core,services,features,ui,config}`, `server/`
      (`src/app` exists; the rest arrive with their first file)
- [x] Strict TypeScript, `@/` path alias, ESLint (Expo config)
- [ ] ESLint import-boundary rule (`core` imports nothing outward); Prettier
- [x] Replace the placeholder Expo icons and splash image with Vorp's own
- [x] `bun test` running with one passing reducer test
- [x] `THIRD_PARTY_NOTICES.md` with the first entries
- [x] `.env.example`; `README.md` stub

## Phase 1: Prove the pipeline (Sun 22)

Verified on 21 November against real `gemini-3.8-live` with `bun run e2e:live` (headless
Chromium, recorded English and French speech through the web build).

- [x] Spike: read the current Gemini Live API docs. Record the model id, audio formats, supported
      languages and voices, session limits and the short-lived token flow in `src/config`
- [x] Spike: the browser streams the microphone to a Live session and gets translated audio
      back, English ↔ French, with both transcripts
- [x] Spike: does the model report the input language? Not on transcripts (`languageCode` is
      never sent); it does through a declared function call (`report_language`), reliably
- [x] Token server in `server/` with Anole: `POST /token` returns a short-lived Live token
- [x] `src/core`: `Participant`, `Utterance`, `Session` types; the utterance lifecycle enum
- [x] `src/core`: `transition(state, event) -> [state, effects]` with tests for the basic turn
- [x] Effect runner: executes effects, feeds results back as events
- [x] `AudioInput` interface and web implementation (AudioWorklet, 16 kHz PCM, echo cancellation
      on). Fixed: it stalled after one chunk
- [x] `AudioOutput` interface and web implementation (gapless PCM playback queue, output level
      tap for the visualiser). Lifecycle verified; nobody has listened to it on speakers yet
- [x] `Translator` interface and Gemini Live implementation (connect, stream, transcripts)
- [ ] Translator reconnect with a fresh token after a drop or `goAway` (built; not exercised live)
- [x] Interpreter system prompt, built from the participants table
- [x] Bare screen: two push-to-talk buttons, captions as plain text. **Milestone: a two-way
      conversation works on web**

## Phase 2: Asynchronous and hands-free (Mon 23)

Verified live on 21 November unless noted. Findings are under "Hands-free turns" in `AGENTS.md`.

- [x] Playback queue in the reducer: utterances speak in order while capture continues
- [x] Reducer tests: speech during playback, three utterances in flight, a failure mid-queue
- [x] Voice activity detection ends the turn (the Live API's own, with `NO_INTERRUPTION`)
- [x] Microphone audio is held while the model replies and sent when the reply completes: the
      model does not listen during its own reply (`E2E_GAP=1.5 bun run e2e:live`)
- [x] Language routes the utterance: the model calls `report_language`; captions show the right
      speaker and direction
- [x] Echo guard: drop captured utterances whose transcript matches the one being spoken
      (reducer tests only; needs a real loudspeaker and microphone to verify)
- [x] `pauseMicWhileSpeaking` emergency flag (reducer tests only)
- [x] Push-to-talk overrides detection while held: the button names the speaker and release
      ends the turn (`E2E_PRESS="French:1.5:8.5" bun run e2e:live`)
- [x] Overlap policy as a table row (`queue`), with the reducer reading the policy
- [x] Error paths as events: microphone denied, token failure, socket drop, session time limit
      (a refused session was seen live; the others are reducer tests only)
- [x] Input transcripts attach to the utterance being captured, not the oldest unanswered one
- [x] Bare screen shows the mode (hands-free or held button) and the queue as plain text
- [x] **Milestone: hands-free two-way conversation on web, listening while speaking**
- [ ] Try it by hand on a real device with a loudspeaker: echo, real voices, a noisy room
- [x] On-device voiceprint (WeSpeaker ResNet34-LM in a Web Worker, served same origin):
      enrolment state machine and storage, voice routing, Vorp's-own-voice echo filter (unit
      tests; model checked in Node and headless Chrome, `bun run smoke:voiceprint`)
- [ ] Enrolment screen (owner's design) on `features/enrolment`; remove the "Them" hold button
- [ ] Tune `VOICE_THRESHOLDS` by hand with real voices, on iPhone Safari and desktop Chrome;
      check Safari loads the worker and WASM
- [x] The model sometimes speaks a placeholder such as "<no speech detected>" for noise; make
      it stay silent or drop those replies
- [ ] A long session: `goAway`, reconnect and resumption

## Phase 3: Design system and effects (Tue 24)

- [x] Tokens module: colour (graphite, gold, participant hues), type, spacing, radius; light and
      dark (values provisional until the design prototype)
- [x] Motion tokens and helpers for the 19 motion rules (durations, easings, press scale, exit
      ratio, stagger); reduced-motion switch
- [x] Primitives: `Pressable` (0.97), `Text`, `Surface`, `IconButton`, `Sheet`, `Popover`, `Chip`
- [x] Slot registry: typed contracts for `thinkingIndicator`, `voiceVisualiser`, `agentAvatar`,
      `messageSurface`, `captionTransition`; the registry table; plain stand-ins for each
- [x] Copy vendor engines from the wallpaper project into `src/ui/effects/vendor`: thinking-orbs,
      border-beam, distortion-waves, bot-avatars, voice-ring. Preact → React, keep licence files,
      add notices
- [x] Wrap each engine as a slot implementation; no app code imports a vendor path (ESLint rule)
- [x] Drive the voice ring from our `AudioInput` / `AudioOutput` levels instead of its own
      microphone hook (the slot takes a level; `AudioInput` still needs a `level()`)
- [ ] Expo DOM component wrappers so the same effects render on native (built and render on
      web; never run on a device or emulator)
- [x] Effects pause offscreen, when the app is backgrounded, and under reduced motion (web:
      reduced motion and offscreen checked in headless Chromium; backgrounding and native not run)
- [x] Gallery route (dev only): every slot implementation and primitive on one page (slots done,
      `/gallery`; primitives not built yet)

## Phase 4: The conversation experience (Wed 25)

- [x] Stage screen: language header, centre stage, caption cards, participant buttons
- [x] Centre stage wired to session state: ring on mic level while listening, thinking orbs while
      translating, ring on output level while speaking, lean toward the active speaker
- [x] Caption cards: streaming original text, distortion wave into the translation, golden glow
      on the card being spoken
- [x] Queue made visible: waiting translations shown in order
- [x] Inline setup: tap a language chip or the people count to change it
- [x] Language picker: searchable, English and French pinned, from the generated table
- [x] Voice picker for the single interpreter voice (in Settings; no audio preview yet)
- [x] Transcript page behind the top button: full history of the conversation, both languages
- [x] Microphone permission flow and first-run hint
- [x] States for empty, connecting, reconnecting and error
- [x] Responsive layout: phone portrait, tablet, laptop; readable from two metres at the booth
- [ ] Accessibility pass: labels, focus order, touch targets, contrast

## Phase 5: Interpreter behaviours and persistence (Thu 26, morning)

- [x] Behaviour table: each row adds prompt text and optional tool declarations
- [x] Tone and register, with a per-conversation setting
- [x] Cultural notes as a caption-only annotation on the card
- [x] Asks when unsure, behind a flag; evaluate and keep or cut
- [x] Recap: bilingual summary when a conversation ends; share and copy
- [x] Storage interface with web and native implementations
- [x] Settings persisted; conversation history list, open and delete
- [x] Settings screen: theme, overlap policy, behaviours, slot choices, flags
- [x] Three participants: sequential output per language, best effort
- [ ] Stretch: a voice per person, only once everything above works

## Phase 6: Deploy and native (Thu 26, afternoon)

- [x] `expo export` for web; the Anole server serves the static build (`WEB_DIR`) and `/token`
- [x] Token endpoint: rate limit per client, short expiry, single-session tokens
- [ ] Spend cap on the Gemini key (Google Cloud console)
- [ ] GCE instance, domain, TLS certificate, service unit, deploy script
- [ ] Native `AudioInput` / `AudioOutput` implementations (voice-communication mode for echo
      cancellation)
- [ ] Android development build; conversation works on a real phone
- [ ] iOS build if a signing path is available; otherwise note it in the README
- [ ] Test matrix by hand: Chrome, Safari, Firefox desktop; Chrome Android; Safari iOS

## Phase 7: Harden and submit (Fri 27)

- [ ] Noisy-room test with a real second speaker; tune detection thresholds and the fallback
- [ ] Long-session test: reconnection, token refresh, session time limits
- [ ] Performance check by hand on the demo devices; trim effects that drop frames
- [ ] Review pass for the code principles: no stray booleans, no duplicated tables
- [x] README: what it is, how Gemini is used, architecture diagram, run instructions, screenshots
- [x] `THIRD_PARTY_NOTICES.md` complete
- [ ] Five-minute pitch video (optional alongside the repository)
- [ ] Submit on the MLH event page before midnight

## Built on 21 November, not yet checked by hand

- [ ] Cultural notes and ask-when-unsure against the real model (the note tool is declared and
      handled; only the demo has shown a note)
- [ ] Three people in one real session
- [ ] Light theme and a screen-reader pass
- [ ] Voice preview in Settings
- [ ] Primitives in the gallery (`Press`, `Layer`)

## Pair by QR code: live translation across two devices (owner, 22 November)

The owner's plan for the demo. One person (likely us at the booth) starts a session and shows a
QR code. Someone scans it with their own phone; the page that opens asks only one thing, their
native language. The two devices are then wired into one live translation session: each person
speaks into their own phone and hears the other in their own language.

Owner's answers (22 November): each phone runs its own Gemini session that translates its owner's
speech into the other's language, and the token server relays the translated voice and captions.
Each person hears only the other, translated; captions show both sides. The guest picks a
language and taps Join (the tap grants the microphone). Either side's Stop ends it for both. One
guest per QR code, a fresh code each session, unused codes expire after 10 minutes; joining is by
QR only. The host keeps the conversation in History; the guest keeps nothing and is sent to the
product landing page. The host starts pairing from a second button on the Start page. The design
session designs the screens.

- [x] Design and implementation questions answered by the owner
- [ ] Server: rooms on the token server (WebSocket relay, one-time codes, guest tokens)
- [ ] Host: start a paired session from Start and show its QR code
- [ ] Guest: scan, pick your native language, Join
- [ ] Live translation across the two devices
- [ ] Guest redirect to the landing page after the session
- [ ] Product landing page: a standalone static page for GitHub Pages with a "vote for us" link
      kept as one config value (the hackathon has no voting page yet)
- [ ] Phone test over HTTPS: deploy to Google Compute Engine, maybe behind a Cloudflare tunnel
      (owner: test later)
- [ ] Booth check on two real phones over the venue network

Pair mode is the main demo, so its UX gets the most care (owner, 22 November):

- [ ] Turn-taking queue: a translation arriving while this phone's owner speaks waits, shown as
      greyed text, and plays when they stop (mic and speaker take turns)
- [ ] Live "they're talking": the other person's words appear as they speak, then "Translating"
- [ ] Speaker sees delivery: "Playing on their phone" while it plays over there, then a tick
- [ ] Light guest page: no voiceprint model, effects load after first paint, about 1 s to paint
- [ ] Phone-to-phone echo guard: ignore speech not in the owner's language, filter Vorp's voice
- [ ] Keep screens awake (Wake Lock); reconnect if a phone locks anyway
- [ ] iPhone Safari: the Join tap also unlocks audio playback
- [ ] Booth loop: after a session the host gets a fresh QR automatically (countdown, "Not now")
- [ ] Join cues: a short sound and haptic on both phones at join and at go-live
- [ ] Guest ends on the landing page; LANDING_URL is one config value (GitHub Pages or
      Cloudflare Pages, undecided)

## Booth (Sat 28)

- [ ] QR code to the live URL; a printed one-line instruction
- [x] Demo script: two languages, one idiom for a cultural note, a recap at the end
- [x] Offline plan: headset or directional microphone, push-to-talk mode, a recorded video
- [ ] Check the key's quota and spend cap in the morning

## After the hackathon

- [ ] One device per person (rooms)
- [ ] Ducking and barge-in overlap policies
- [ ] Facing-split layout as a second registered layout
- [ ] Skia ports of the hot-path effects on native
- [ ] Speaker diarisation for participants who share a language
- [ ] Cascaded `Translator` implementation as a fallback
