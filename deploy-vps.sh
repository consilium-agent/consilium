#!/usr/bin/env bash
# CONSILIUM → VPS. Run from Git Bash once the domain points at the VPS (Cloudflare proxied or direct):
#   bash deploy-vps.sh --domain consiliumdesk.xyz
# Ships server/ + web/ + dist/ (downloads) + node_modules (the Anthropic SDK). The Claude key goes into
# /etc/consilium/site.env on the server (root only), read from ~/.anthropic_key on this machine.
set -euo pipefail
HOST="${HOST:-root@202.10.42.20}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
PORT=5120
DOMAIN=""; [ "${1:-}" = "--domain" ] && DOMAIN="${2:?domain required}"
[ -n "$DOMAIN" ] || { echo "usage: bash deploy-vps.sh --domain consiliumdesk.xyz"; exit 1; }
# ufw limits SSH to 6 new connections per 30 s per IP, so every call waits its turn
rssh() { sleep "${SSH_GAP:-6}"; ssh -o ConnectTimeout=20 -o BatchMode=yes "$HOST" "$@"; }
SSH=rssh
STAMP=$(date +%Y%m%d-%H%M%S)

[ -s "$ROOT/dist/manifest.json" ] || { echo "!! build the downloads first: node cli/build.mjs --api https://$DOMAIN"; exit 1; }
grep -q "\"https://$DOMAIN\"" "$ROOT/dist/manifest.json" || { echo "!! dist/ was built for another API; run: node cli/build.mjs --api https://$DOMAIN"; exit 1; }

echo "→ release $STAMP"
( cd "$ROOT" && tar -czf - --exclude=node_modules/esbuild --exclude=node_modules/@esbuild --exclude=node_modules/postject --exclude=node_modules/.bin package.json server web dist cli/install.sh cli/install.ps1 node_modules ) | $SSH "set -e
  id consilium >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin consilium
  mkdir -p /opt/consilium/releases/$STAMP /etc/consilium && tar -xzf - -C /opt/consilium/releases/$STAMP
  ln -sfn /opt/consilium/releases/$STAMP /opt/consilium/current && chmod -R a+rX /opt/consilium
  ls -1dt /opt/consilium/releases/* | tail -n +3 | xargs -r rm -rf"

if ! $SSH "grep -q '^ANTHROPIC_API_KEY=' /etc/consilium/site.env 2>/dev/null"; then
  [ -s "$HOME/.anthropic_key" ] || { echo "!! no ~/.anthropic_key on this machine"; exit 1; }
  { printf 'PORT=%s\nHOST=127.0.0.1\nTRUST_PROXY=1\nSITE_URL=https://%s\nANTHROPIC_API_KEY=' "$PORT" "$DOMAIN"; cat "$HOME/.anthropic_key"; printf '\n'; } \
    | $SSH "umask 077; cat > /etc/consilium/site.env"
fi
$SSH "chmod 600 /etc/consilium/site.env"

$SSH "cat > /etc/systemd/system/consilium.service" <<UNIT
[Unit]
Description=CONSILIUM desk on 127.0.0.1:$PORT
After=network.target
[Service]
User=consilium
EnvironmentFile=/etc/consilium/site.env
WorkingDirectory=/opt/consilium/current
ExecStart=/usr/local/bin/node --max-old-space-size=96 /opt/consilium/current/server/server.mjs
Restart=always
RestartSec=5
MemoryHigh=110M
MemoryMax=140M
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
UNIT
$SSH "systemctl daemon-reload && systemctl enable consilium >/dev/null 2>&1 && systemctl restart consilium"

$SSH "cat > /etc/nginx/sites-available/consilium" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;
    client_max_body_size 64k;
    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_read_timeout 120s;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For \$remote_addr;
    }
}
EOF
$SSH "set -e; ln -sfn /etc/nginx/sites-available/consilium /etc/nginx/sites-enabled/consilium; nginx -t 2>&1 | tail -1; systemctl reload nginx"
$SSH "certbot --nginx -n --agree-tos --register-unsafely-without-email --keep-until-expiring --redirect -d '$DOMAIN' -d 'www.$DOMAIN' && systemctl reload nginx" \
  || echo "!! certbot failed: check that $DOMAIN points to the VPS, then rerun"

URL="https://$DOMAIN"
echo "→ checks"
$SSH "for i in \$(seq 1 20); do curl -sf -o /dev/null http://127.0.0.1:$PORT/v1/health && break; sleep 1; done
  systemctl is-active consilium; curl -s http://127.0.0.1:$PORT/v1/health; echo; free -m | sed -n 2p"
for p in / /app /docs /download /v1/health /v1/markets /dl/SHA256SUMS.txt /install.sh; do curl -s -o /dev/null -w "  %{http_code}  $p\n" "$URL$p" || true; done
echo "✓ deployed: $URL"
