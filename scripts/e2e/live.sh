#!/usr/bin/env bash
# End-to-end check against the real Gemini Live API, by hand (not part of `bun test`).
# Speaks an English then a French sentence into the web build through Chromium's fake
# microphone and prints the page text as captions arrive. Costs real API usage.
# Needs: GEMINI_API_KEY in .env, zig 0.17, chromium, ffmpeg.   Run: bun run e2e:live
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
tmp="$(mktemp -d)"
trap 'kill $(jobs -p) 2>/dev/null || true; pkill -f "zig-out/bin/[v]orp-token" || true; rm -rf "$tmp"' EXIT
chromium="$(command -v chromium-browser || command -v chromium || command -v google-chrome)"

# The two sentences were spoken by Gemini's speech model (fixtures/README.md); Gemini Live's voice
# detection ignores robotic voices such as espeak's.
fx="$root/scripts/e2e/fixtures"
ffmpeg -loglevel error -y -f lavfi -t 3 -i anullsrc=r=48000:cl=mono -i "$fx/en.wav" \
  -f lavfi -t 9 -i anullsrc=r=48000:cl=mono -i "$fx/fr.wav" -f lavfi -t 25 -i anullsrc=r=48000:cl=mono \
  -filter_complex "[1]aresample=48000[a];[3]aresample=48000[b];[0][a][2][b][4]concat=n=5:v=0:a=1" -ac 1 -ar 48000 "$tmp/talk.wav"

cd "$root"
bun run export:web >/dev/null
WEB_DIR=dist bun run token-server >"$tmp/server.log" 2>&1 &
"$chromium" --headless=new --no-first-run --user-data-dir="$tmp/chrome" --remote-debugging-port=9223 \
  --use-fake-ui-for-media-stream --use-fake-device-for-media-stream \
  --use-file-for-fake-audio-capture="$tmp/talk.wav%noloop" --autoplay-policy=no-user-gesture-required \
  about:blank >"$tmp/chrome.log" 2>&1 &
for _ in $(seq 60); do curl -sf localhost:8787/healthz >/dev/null && curl -sf localhost:9223/json >/dev/null && break; sleep 1; done
bun run scripts/e2e/drive.ts "${1:-16}"
