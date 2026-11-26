#!/usr/bin/env bash
# Runs on the VM as root, from the unpacked release in $1: installs Caddy once, the vorp user,
# the server and the web build, then restarts. Safe to run again.
set -euo pipefail
release=$1 domain=$2
command -v caddy >/dev/null || { apt-get update -qq && apt-get install -y -qq caddy; }
id vorp >/dev/null 2>&1 || useradd --system --home /opt/vorp --shell /usr/sbin/nologin vorp
install -d -o root -g root /opt/vorp
rm -rf /opt/vorp/dist.new && cp -r "$release/dist" /opt/vorp/dist.new
rm -rf /opt/vorp/dist && mv /opt/vorp/dist.new /opt/vorp/dist
install -m 755 "$release/vorp-token" /opt/vorp/vorp-token
install -m 644 "$release/vorp.service" /etc/systemd/system/vorp.service
install -m 644 "$release/Caddyfile" /etc/caddy/Caddyfile
install -d -m 755 /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironment=VORP_DOMAIN=%s\n' "$domain" > /etc/systemd/system/caddy.service.d/vorp.conf
test -f /etc/vorp/env || { echo "missing /etc/vorp/env: run deploy.sh --secrets" >&2; exit 1; }
systemctl daemon-reload
systemctl enable --now vorp caddy
systemctl restart vorp
systemctl reload-or-restart caddy
systemctl is-active vorp caddy
