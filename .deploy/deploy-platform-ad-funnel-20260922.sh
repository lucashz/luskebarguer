#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/var/www
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$APP_DIR/.deploy-backups/platform-ad-funnel-$STAMP"

mkdir -p "$BACKUP_DIR/public" "$BACKUP_DIR/src/lib"
cp "$APP_DIR/server.js" "$BACKUP_DIR/server.js"
cp "$APP_DIR/public/platform.html" "$BACKUP_DIR/public/platform.html"
cp "$APP_DIR/public/platform.js" "$BACKUP_DIR/public/platform.js"
cp "$APP_DIR/public/platform.css" "$BACKUP_DIR/public/platform.css"
if [[ -f "$APP_DIR/src/lib/platform-ad-funnel.js" ]]; then
  cp "$APP_DIR/src/lib/platform-ad-funnel.js" "$BACKUP_DIR/src/lib/platform-ad-funnel.js"
fi

cp /tmp/tapronto-server-ad-funnel.js "$APP_DIR/server.js"
cp /tmp/tapronto-platform-ad-funnel.js "$APP_DIR/src/lib/platform-ad-funnel.js"
cp /tmp/tapronto-platform.html "$APP_DIR/public/platform.html"
cp /tmp/tapronto-platform.js "$APP_DIR/public/platform.js"
cp /tmp/tapronto-platform.css "$APP_DIR/public/platform.css"

cd "$APP_DIR"
node --check server.js
node --check src/lib/platform-ad-funnel.js
node --check public/platform.js
grep -q 'instagramPaidFunnel' server.js
grep -q 'Funil do anúncio' public/platform.js
grep -q '20260922-metrics-clear' public/platform.html

OLD_PID="$(systemctl show cardapio.service --property MainPID --value)"
kill -TERM "$OLD_PID"
NEW_PID=0
for _ in $(seq 1 30); do
  sleep 1
  NEW_PID="$(systemctl show cardapio.service --property MainPID --value)"
  if [[ "$NEW_PID" -gt 0 && "$NEW_PID" != "$OLD_PID" ]] && kill -0 "$NEW_PID" 2>/dev/null; then break; fi
done
test "$NEW_PID" -gt 0
test "$NEW_PID" != "$OLD_PID"
kill -0 "$NEW_PID"
systemctl is-active cardapio.service
curl -fsS -H 'Host: taprontomenu.com.br' http://127.0.0.1:3000/api/health >/dev/null

echo "BACKUP=$BACKUP_DIR"
echo "OLD_PID=$OLD_PID"
echo "NEW_PID=$NEW_PID"
