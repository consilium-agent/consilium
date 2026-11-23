#!/usr/bin/env bash
# Polls DNS for the domain every 2 minutes (up to 12 hours); deploys as soon as an A record exists.
DOMAIN="${1:-consiliumdesk.xyz}"
cd "$(dirname "$0")/.."
for i in $(seq 1 360); do
  A=$(curl -s -m 10 "https://dns.google/resolve?name=$DOMAIN&type=A" | python -c "import json,sys;d=json.load(sys.stdin);print(' '.join(x['data'] for x in d.get('Answer',[]) if x.get('type')==1))" 2>/dev/null)
  if [ -n "$A" ]; then
    echo "$(date '+%F %T') $DOMAIN -> $A, deploying"
    sleep 60   # give the record a minute to spread before certbot checks it
    bash deploy-vps.sh --domain "$DOMAIN"
    exit $?
  fi
  sleep 120
done
echo "gave up: $DOMAIN never resolved in 12 h"; exit 3
