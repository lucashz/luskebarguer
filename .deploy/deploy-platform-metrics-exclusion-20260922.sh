#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/var/www
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$APP_DIR/.deploy-backups/platform-metrics-exclusion-$STAMP"

mkdir -p "$BACKUP_DIR/src/lib"
cp "$APP_DIR/server.js" "$BACKUP_DIR/server.js"
if [[ -f "$APP_DIR/src/lib/platform-metrics-exclusions.js" ]]; then
  cp "$APP_DIR/src/lib/platform-metrics-exclusions.js" "$BACKUP_DIR/src/lib/platform-metrics-exclusions.js"
fi

cp /tmp/tapronto-server-metrics.js "$APP_DIR/server.js"
cp /tmp/tapronto-platform-metrics-exclusions.js "$APP_DIR/src/lib/platform-metrics-exclusions.js"

cd "$APP_DIR"
node --check server.js
node --check src/lib/platform-metrics-exclusions.js
grep -q 'filterPlatformMetricsData' server.js
grep -q 'TAPRONTO_DEMO_COMPANY_ID' src/lib/platform-metrics-exclusions.js

OLD_PID="$(systemctl show cardapio.service --property MainPID --value)"
kill -TERM "$OLD_PID"
NEW_PID=0
for _ in $(seq 1 30); do
  sleep 1
  NEW_PID="$(systemctl show cardapio.service --property MainPID --value)"
  if [[ "$NEW_PID" -gt 0 && "$NEW_PID" != "$OLD_PID" ]] && kill -0 "$NEW_PID" 2>/dev/null; then
    break
  fi
done
test "$NEW_PID" -gt 0
test "$NEW_PID" != "$OLD_PID"
kill -0 "$NEW_PID"
systemctl is-active cardapio.service
curl -fsS -H 'Host: taprontomenu.com.br' http://127.0.0.1:3000/api/health >/dev/null

echo "BACKUP=$BACKUP_DIR"
echo "OLD_PID=$OLD_PID"
echo "NEW_PID=$NEW_PID"
