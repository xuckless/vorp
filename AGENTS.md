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

## Architecture

```
app/            routes only: compose features, no logic
src/core/       pure domain: types, the session reducer, effects as data. No React, no I/O.
src/services/   I/O behind interfaces: audio capture, audio playback, translator, storage
src/features/   screens and their view models (setup, conversation, settings)
src/ui/         design system: tokens, primitives, slots, effects
src/config/     data tables: languages, voices, models, feature flags, policies
```

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
- The token endpoint is public, so it is rate-limited, issues single-session tokens with a short
  expiry, and the key carries a spend cap.

### Platforms

- **Web is the demo target** and must be flawless. Android and iOS build from the same code and
  get the remaining polish time.
- **Imported effects run as Expo DOM components** on native: the same web code inside a web
  view. Surfaces that wear an effect (caption cards with the glow, the centre stage) are
  therefore rendered inside the DOM component on native, not wrapped around native views.

### Conversation

- **One shared device**: one microphone, one speaker, placed between the participants.
- **Two people must work flawlessly; three is best effort.** The data model is N-person from the
  start. With three languages the translation is spoken once per other language, in turn.
- **Hands-free with a fallback.** Voice activity detection ends the turn; the detected language
  identifies the speaker and the direction. A per-person button stays available for noisy rooms
  and for participants who share a language.
- **Overlap policy: keep talking, queue the next.** Vorp finishes the current translation while
  capturing new speech, then speaks the next one in order. The policy is a value in a table, so
  ducking or barge-in can be added as rows.
- **Echo**: platform echo cancellation, plus a guard that drops a captured utterance whose
  transcript matches what Vorp is speaking. `pauseMicWhileSpeaking` exists as an emergency flag,
  off by default.
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
- **Look**: graphite base with gold as the single brand accent; each participant has an accent
  hue. Light and dark both ship.

### Data and licence

- **Persistence**: settings and conversation history on the device only. No accounts, no cloud.
  Audio is never stored.
- **Licence**: Apache-2.0, public repository.
