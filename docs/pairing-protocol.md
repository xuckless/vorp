# Pairing protocol

Two phones in one interpreted conversation. The host starts a paired session and shows a QR
code; the guest scans it, picks their language and taps Join. Each phone runs **its own** Gemini
Live session (tokens from `POST /token`, as today) that turns its owner's speech into the other
person's language. The token server only **relays** between the two phones: translated audio,
captions, turn and playback marks. It never sees microphone audio and never calls Gemini for a
pairing.

The server side is `server/src/pairing.zig` (endpoints, relay) and `server/src/rooms.zig` (room
states). This document is the contract for the app.

## Overview

```
host phone                      token server                      guest phone
──────────                      ────────────                      ───────────
POST /rooms ───────────────────▶ 201 {code, hostKey, expiresAt}
WS /rooms/{code}
  hello {role:host, key, language} ▶
  ◀ welcome {role:host, expiresAt}
show QR: https://<origin>/join/{code}
                                                     ◀──────────── WS /rooms/{code}
                                 ◀ hello {role:guest, language} ── 
                                 ──▶ welcome {role:guest, peerLanguage, key}
  ◀ peer_joined {peerLanguage}
start Gemini (target: peerLanguage)                  start Gemini (target: peerLanguage)
  ═══════ captions, turns, speaking, playback, binary audio: relayed both ways ═══════
  end ▶                                              
  ◀ ended {host_stopped}         ──▶ ended {host_stopped}
```

The host learns the guest's language from `peer_joined`; the guest learns the host's from its
`welcome`. Each phone sets its own Gemini session to translate its owner's speech into the
peer's language.

## Endpoints

All on the token server's origin (production serves the web app from it; in development the app
uses `EXPO_PUBLIC_TOKEN_URL`'s origin, for example `http://localhost:8787`). Use `https:` /
`wss:` in production.

### `POST /rooms`

Creates a room for the host. No body. Not cached (`Cache-Control: no-store`). CORS as for
`/token` (the dev origin `http://localhost:8081` is allowed in development).

`201 Created`:

```json
{
  "code": "qXc4jgXzapFpvDqaYKaILg",
  "hostKey": "B4gEYEuR89edCHssuM45Mw",
  "expiresAt": 1795326399513,
  "expiresIn": 600
}
```

- `code`: 22 characters, base64url (`A–Z a–z 0–9 - _`), 128 random bits. Unguessable and
  single-use. It goes into the QR URL. Never show it as text to type.
- `hostKey`: 22 characters, the host's secret. Keep it in memory only (never in the URL or the
  QR). The host says hello with it, and rejoins with it.
- `expiresAt`: Unix milliseconds when the unused code stops working. `expiresIn`: the same as
  seconds from now (600). Count down from `expiresIn` on receipt; the phone's clock may be off.

Errors (JSON `{"error": "..."}`):

| Status | When |
| --- | --- |
| 429 | Over the per-client request rate (`ROOM_RATE_LIMIT`, 30 a minute, shared with socket opens), or this client address already has `ROOMS_PER_CLIENT` (10) rooms open or paired. `Retry-After` is set for the rate case. |
| 503 | The server holds `MAX_ROOMS` (100) open or paired rooms, or has no randomness. Try again later. |

### QR URL

The server does not read it. Suggested: `https://<origin>/join/<code>` (the web build is a
single-page app, so any path serves the app). The guest page takes the code from the path.

### `WS /rooms/{code}`

One WebSocket per phone, the same path for host and guest. Plain GET without an upgrade: `426`.
Opening the socket counts against the same per-client rate as `POST /rooms`. Any page origin may
open it: the socket uses no cookies; the code and the keys are what let a phone in.

- A code that names no room (malformed, never made, or forgotten) is refused at once with
  `error not_found`, close `4404`.
- Otherwise the server waits for the first message, which must be `hello`.

## Messages

Text frames are JSON objects with a `type`. Binary frames are audio. Field names are camelCase.
Unknown fields are ignored by the server. The server reads only `type` on relayed messages and
forwards the frame byte for byte; the shapes below are the contract between the two phones.

### Client to server

#### `hello` (first message, exactly once per socket)

Host, opening its room:

```json
{"type": "hello", "role": "host", "key": "B4gEYEuR89edCHssuM45Mw", "language": "en-US"}
```

Guest, joining (no `key`):

```json
{"type": "hello", "role": "guest", "language": "fr-CA"}
```

Either side rejoining a paired room after its socket dropped (see Reconnecting), with its own
key: `hostKey` for the host, the `key` from the guest's `welcome` for the guest. `language` is
required but ignored on a rejoin (the room keeps the one from the first hello):

```json
{"type": "hello", "role": "guest", "key": "Yp3k0cR2b9mV7eQx1LwZsA", "language": "fr-CA"}
```

- `language`: a BCP-47 tag, 2–35 characters of letters, digits and `-`, starting with a letter
  (`en`, `fr-CA`, `zh-Hant-TW`). Only its shape is checked; use the app's languages table.
- A malformed hello, or any other first message, is `error bad_message`, close `4400`.

#### `ping`

```json
{"type": "ping"}
```

Answered with `{"type": "pong"}`. **Send one every 15 seconds** while the socket is open. It is
how a phone learns, without other traffic, that its code expired or that the peer has been away
too long (the server checks time when a message arrives; it runs no timers).

#### `end`

```json
{"type": "end"}
```

The owner pressed Stop. The room ends for both: the sender gets `ended`, then close `1000`; the
peer gets the same `ended`. Works while waiting too (the host cancels the QR).

### Server to client

#### `welcome`

Host, after its hello:

```json
{"type": "welcome", "role": "host", "expiresAt": 1795326399513}
```

Guest, after its hello. `peerLanguage` is the host's language; `key` is the guest's own secret
for rejoining, kept in memory only:

```json
{"type": "welcome", "role": "guest", "peerLanguage": "en-US", "key": "Yp3k0cR2b9mV7eQx1LwZsA"}
```

Either side, after a rejoin:

```json
{"type": "welcome", "role": "host", "peerLanguage": "fr-CA", "rejoined": true}
```

#### `peer_joined` (to the host)

```json
{"type": "peer_joined", "peerLanguage": "fr-CA"}
```

The guest is in. Start (or reconfigure) the host's Gemini session to translate into
`peerLanguage`. Nothing the host sends is relayed before this.

#### `peer_away`, `peer_back`

```json
{"type": "peer_away"}
```

```json
{"type": "peer_back"}
```

The peer's socket dropped (locked phone, lost network) and it has 60 seconds to rejoin; show
"Reconnecting to their phone". `peer_back`: it rejoined; recover. If it does not come back in
time, `ended` with `host_left` / `guest_left` follows. A side that rejoins while its peer is away
gets `peer_away` right after its `welcome`.

#### `pong`

```json
{"type": "pong"}
```

#### `ended`

```json
{"type": "ended", "reason": "guest_stopped"}
```

The room is over; the server closes the socket with `1000` after it (close your side too if it
is still open). `reason`:

| reason | meaning |
| --- | --- |
| `host_stopped` | The host pressed Stop. |
| `guest_stopped` | The guest pressed Stop. |
| `host_left` | The host's socket closed while waiting for the guest (the code is dead), or the host was away for 60 seconds. |
| `guest_left` | The guest was away for 60 seconds. |
| `expired` | No guest joined within 10 minutes (sent to the waiting host). |

#### `error`

```json
{"type": "error", "code": "taken", "message": "this code has been used"}
```

Most errors close the socket right after, with the close code below. `bad_message` after a
successful hello does **not** close: the message is dropped and the socket goes on.

| code | close | when |
| --- | --- | --- |
| `bad_message` | 4400 | Malformed or unknown message. Closes only when it was the first message (the hello). Also: text over 4 KiB, odd-length audio, an `audio` type in text. |
| `bad_key` | 4403 | The host's key is wrong; a guest sent a key to a room not yet paired; a rejoin key is wrong. |
| `not_found` | 4404 | No room has this code (malformed, never made, or ended more than about 10 minutes ago). |
| `taken` | 4409 | The code is spent: a guest already joined (now or earlier), or the host is already connected. |
| `expired` | 4410 | The code was not used within 10 minutes. |
| `host_gone` | 4411 | The host is not connected (it left or pressed Stop before anyone joined). |
| `replaced` | 4412 | This side rejoined on another socket; this one is retired. Do not show an error: the new socket carries on. |
| `rate_limited` | 4429 | The socket sent faster than the relay limit. Treated like a drop: the peer gets `peer_away` and the side may rejoin. |

Other closes: `1009` for a frame over 64 KiB; `1001` when the server shuts down; `1000` after
`ended`. Any close without `ended` before it means the socket dropped: rejoin (see below).

### Relayed between the phones

Relayed only while the room is paired and the peer is connected; otherwise dropped silently
(nothing is queued for a phone that is away). Delivered to the peer in the order sent. The
sender never gets its own messages back.

**Turn ids.** Each phone numbers its owner's utterances: `turn` is a string the sender assigns,
unique within the session for that sender, for example `"h1"`, `"h2"` on the host and `"g1"` on
the guest. Every relayed message about an utterance carries it. A `playback` message carries
the id of the turn it is about, which is the other phone's id.

#### `speaking`: the owner is talking

```json
{"type": "speaking", "talking": true}
```

```json
{"type": "speaking", "talking": false}
```

Sent when the owner starts and stops talking (the phone's voice activity: Gemini's
`ACTIVITY_START` / `ACTIVITY_END`, or the hold button). Only on changes. The receiver holds
playback of incoming translations while the peer's owner is talking (owner-speaking state drives
the queue). Not tied to a turn.

#### `turn`: one utterance's lifecycle

```json
{"type": "turn", "turn": "h3", "state": "talking"}
```

`state`, in this order for one turn:

| state | meaning on the receiving phone |
| --- | --- |
| `talking` | The peer's owner started this utterance: "They're talking". Source deltas follow. |
| `translating` | The utterance ended; the translation is being made. |
| `ready` | The translation is arriving: translation deltas and audio chunks follow. |
| `done` | Everything for this turn has been sent (audio and text). |
| `failed` | No translation will come (Gemini gave none, or the session failed). Final. |

Each state is sent once per turn; `done` or `failed` is the last message about the turn. A turn
may skip `ready` (no audio) and go straight to `done` or `failed`.

#### `caption`: words, as deltas

```json
{"type": "caption", "turn": "h3", "side": "source", "delta": "Where is the "}
```

```json
{"type": "caption", "turn": "h3", "side": "translation", "delta": "Où est la "}
```

- `side: "source"`: what the speaker said, in the speaker's language (Gemini's input
  transcript), sent while they are still talking when the transcript arrives in pieces, before
  any translation exists.
- `side: "translation"`: what the sender's Gemini said in the receiver's language (the output
  transcript), the caption for the audio.
- `delta`: text to **append** to that turn's text on that side. Concatenate deltas in arrival
  order; the sender sends only new text, never the whole caption again.
- Batch: at most about 10 caption messages a second per side; merge pieces that arrive faster.

#### Audio: binary frames

Raw PCM, 16-bit signed little-endian, mono, 24 kHz: the bytes of Gemini's
`serverContent.modelTurn.parts[].inlineData` after base64 decoding, sent as they arrive. Each
binary frame has an even length and is at most 64 KiB (split bigger chunks on an even byte
boundary). No header: audio frames belong to the sender's current turn, the latest one it put
in `ready` and has not yet marked `done` or `failed`. A sender finishes one turn's audio before
starting the next turn's (Gemini answers in order, so this holds naturally).

#### `playback`: from the listening phone back to the speaking phone

```json
{"type": "playback", "turn": "h3", "state": "queued"}
```

```json
{"type": "playback", "turn": "h3", "state": "playing", "progress": 0.42}
```

```json
{"type": "playback", "turn": "h3", "state": "heard"}
```

| state | meaning on the speaking phone |
| --- | --- |
| `queued` | The translation has arrived and is held, because the listener's owner is talking: "Waiting for them to finish". |
| `playing` | Playing on their phone; `progress` is 0 to 1 of the turn's audio received so far. Send at most 4 times a second, not per audio chunk. |
| `heard` | Playback finished: the "Heard" tick. Final for this turn. |

`turn` is the speaking phone's turn id. `queued` may be skipped when playback starts at once.

## States

### A room

```
                POST /rooms
                     │
                     ▼
               ┌──────────┐  host hello (key)
               │   open   │────────────────────┐
               │ no host  │                    ▼
               └──────────┘              ┌───────────┐
                     │ 10 min            │   open    │  host socket closes ─▶ ended host_left
                     ▼                   │  waiting  │  host end ───────────▶ ended host_stopped
               ended expired ◀───────────│           │  10 min ─────────────▶ ended expired
                                         └───────────┘
                                               │ guest hello (no key): code spent
                                               ▼
                                         ┌───────────┐
                                         │  paired   │  either end ────▶ ended host_/guest_stopped
                                         │           │
                                         └───────────┘
                                           │       ▲
                          a socket closes  │       │ hello with its key
                          (peer: peer_away)▼       │ (peer: peer_back)
                                         ┌───────────┐
                                         │  paired,  │  away 60 s ─────▶ ended host_/guest_left
                                         │ side away │  the other's end ▶ ended *_stopped
                                         └───────────┘
```

An ended room is remembered for about 10 minutes (from its expiry or its end, whichever is
later), so a late scan is told `taken`, `expired` or `host_gone`; after that, `not_found`.

### A phone

```
host:   POST /rooms ─▶ connect ─▶ hello ─▶ welcome ─▶ show QR ─▶ peer_joined ─▶ live ─▶ ended
guest:  scan ─▶ pick language ─▶ Join ─▶ connect ─▶ hello ─▶ welcome ─▶ live ─▶ ended
live:   socket drops ─▶ reconnect ─▶ hello with key ─▶ welcome (rejoined) ─▶ live
```

## Reconnecting

A paired phone whose socket closes without `ended` (screen lock, network change, a close
other than `1000`) should reconnect right away and keep trying for up to 60 seconds: open
`WS /rooms/{code}` and send `hello` with its role and key. The peer sees `peer_away`, then
`peer_back`. Messages sent while one side was away are lost: a turn in progress may arrive
without its end; the receiver should drop turns it never sees finish when `peer_back` arrives.

If the server still holds the old socket (it has not noticed the drop yet), the rejoin replaces
it; the old socket gets `error replaced` (4412) if it is ever used again.

A waiting host whose socket drops loses the code (`ended host_left` on that room); make a new
room. Gemini Live reconnects are separate and unchanged: each phone renews its own session.

## Limits

| What | Limit | Why |
| --- | --- | --- |
| Unused code | 10 minutes | Owner's decision. |
| Guests per code | one, ever | Owner's decision: single-use code. |
| Rejoin window | 60 seconds away | Long enough for a phone to lock and unlock; short enough that a vanished phone frees the room. |
| Socket lifetime | 60 minutes from open | Bounds a forgotten session; a rejoin opens a new socket. |
| Frame size | 64 KiB (close 1009) | An audio chunk is about 1 KiB to 20 KiB; captions are small. |
| Text message | 4 KiB | Every relayed text type is a small object with a delta. |
| Relay rate per side | 600 tokens a second, burst 3000; a message costs 1 plus 1 per KiB | About six times what live translated speech needs (24 kHz audio is 47 KiB/s). |
| Relay queue per phone | 1 MiB waiting to be sent (about 20 s of audio) | A phone that stops reading is cut off instead of growing memory. |
| `POST /rooms` and socket opens | 30 a minute per client address (`ROOM_RATE_LIMIT`) | The endpoints are public. |
| Rooms per client address | 10 open or paired (`ROOMS_PER_CLIENT`) | Phones behind the venue's NAT share an address. |
| Rooms in total | 100 open or paired (`MAX_ROOMS`) | One small server at the booth. |
| Client rates (by contract) | `ping` every 15 s; `caption` at most about 10/s per side; `playback` `playing` at most 4/s; `speaking` only on changes | Keeps messages small and rare. |

Behind the TLS proxy, set `ANOLE_PROXY_TRUSTED` (or `ANOLE_DEPLOYMENT=behind_proxy`) so the
per-client limits see the phone's address, as for `/token`.

## Example session

```
host  → POST /rooms                               ← 201 {"code":"qXc4…","hostKey":"B4gE…",…}
host  → {"type":"hello","role":"host","key":"B4gE…","language":"en-US"}
host  ← {"type":"welcome","role":"host","expiresAt":1795326399513}
guest → {"type":"hello","role":"guest","language":"fr-CA"}
guest ← {"type":"welcome","role":"guest","peerLanguage":"en-US","key":"Yp3k…"}
host  ← {"type":"peer_joined","peerLanguage":"fr-CA"}
host  → {"type":"speaking","talking":true}                → guest
host  → {"type":"turn","turn":"h1","state":"talking"}     → guest
host  → {"type":"caption","turn":"h1","side":"source","delta":"Where is "}   → guest
host  → {"type":"speaking","talking":false}               → guest
host  → {"type":"turn","turn":"h1","state":"translating"} → guest
host  → {"type":"turn","turn":"h1","state":"ready"}       → guest
host  → <binary PCM> <binary PCM> …                       → guest
host  → {"type":"caption","turn":"h1","side":"translation","delta":"Où est "} → guest
host  → {"type":"turn","turn":"h1","state":"done"}        → guest
guest → {"type":"playback","turn":"h1","state":"playing","progress":0.3}     → host
guest → {"type":"playback","turn":"h1","state":"heard"}   → host
guest → {"type":"end"}
guest ← {"type":"ended","reason":"guest_stopped"}, close 1000
host  ← {"type":"ended","reason":"guest_stopped"}, close 1000
```
