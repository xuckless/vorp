#!/usr/bin/env bash
# Builds Vorp for the booth and deploys it to its Compute Engine VM.
#
#   scripts/deploy/deploy.sh            # build, upload, restart
#   scripts/deploy/deploy.sh --secrets  # also (re)write /etc/vorp/env on the VM
#
# The web build has the booth gate on and asks /token on its own origin. Secrets: GEMINI_API_KEY
# from .env, HOST_SECRET from .env.deploy (made on first use; both git-ignored). They go to the
# VM over ssh on stdin, never through a file or the command line.
set -euo pipefail
cd "$(dirname "$0")/../.."

PROJECT=${VORP_PROJECT:-gen-lang-client-0128333338}
ZONE=${VORP_ZONE:-northamerica-northeast2-a}
VM=${VORP_VM:-vorp}
DOMAIN=${VORP_DOMAIN:-vorp.alidirect.dev}
ssh_vm() { gcloud compute ssh "$VM" --project "$PROJECT" --zone "$ZONE" --quiet "$@"; }

EXPO_PUBLIC_HOST_GATE=1 EXPO_PUBLIC_TOKEN_URL=/token bun run export:web
(cd server && zig build -Doptimize=ReleaseSafe -Dtarget=x86_64-linux-gnu.2.36)

release=$(mktemp -d)
trap 'rm -rf "$release"' EXIT
mkdir "$release/vorp"
cp -r dist server/zig-out/bin/vorp-token scripts/deploy/{Caddyfile,vorp.service,remote.sh} "$release/vorp/"
tar -C "$release" -czf "$release/vorp.tgz" vorp
gcloud compute scp "$release/vorp.tgz" "$VM:/tmp/vorp.tgz" --project "$PROJECT" --zone "$ZONE" --quiet

if [[ ${1:-} == --secrets ]]; then
  test -f .env.deploy || printf 'HOST_SECRET=%s\n' "$(openssl rand -base64 24 | tr '+/' '-_' | tr -d '=')" > .env.deploy
  { grep '^GEMINI_API_KEY=' .env; grep '^HOST_SECRET=' .env.deploy; } |
    ssh_vm --command 'sudo install -d -m 700 /etc/vorp && sudo install -m 600 /dev/stdin /etc/vorp/env'
fi

ssh_vm --command "rm -rf /tmp/vorp && tar -C /tmp -xzf /tmp/vorp.tgz && sudo bash /tmp/vorp/remote.sh /tmp/vorp $DOMAIN && rm -rf /tmp/vorp /tmp/vorp.tgz"
echo "Deployed to https://$DOMAIN"
