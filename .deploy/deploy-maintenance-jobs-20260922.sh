#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/var/www
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$APP_DIR/.deploy-backups/maintenance-jobs-$STAMP"
mkdir -p "$BACKUP_DIR/scripts" "$BACKUP_DIR/src/lib" "$APP_DIR/logs"

cp "$APP_DIR/scripts/cleanup-logs.mjs" "$BACKUP_DIR/scripts/cleanup-logs.mjs"
cp "$APP_DIR/scripts/cleanup-inactive-trials.mjs" "$BACKUP_DIR/scripts/cleanup-inactive-trials.mjs"
if [[ -f "$APP_DIR/src/lib/maintenance-policy.js" ]]; then
  cp "$APP_DIR/src/lib/maintenance-policy.js" "$BACKUP_DIR/src/lib/maintenance-policy.js"
fi
crontab -l >"$BACKUP_DIR/crontab.before" 2>/dev/null || true

cp /tmp/tapronto-cleanup-logs.mjs "$APP_DIR/scripts/cleanup-logs.mjs"
cp /tmp/tapronto-cleanup-inactive-trials.mjs "$APP_DIR/scripts/cleanup-inactive-trials.mjs"
cp /tmp/tapronto-maintenance-policy.js "$APP_DIR/src/lib/maintenance-policy.js"

cd "$APP_DIR"
node --check scripts/cleanup-logs.mjs
node --check scripts/cleanup-inactive-trials.mjs
node --check src/lib/maintenance-policy.js
node --env-file=.env scripts/cleanup-logs.mjs --json >/tmp/tapronto-cleanup-logs-preview.json
node --env-file=.env scripts/cleanup-inactive-trials.mjs --days=14 >/tmp/tapronto-trial-cleanup-preview.txt

CURRENT_CRON="$(crontab -l 2>/dev/null || true)"
FILTERED_CRON="$(printf '%s\n' "$CURRENT_CRON" | sed '/# BEGIN TAPRONTO MAINTENANCE/,/# END TAPRONTO MAINTENANCE/d')"
{
  printf '%s\n' "$FILTERED_CRON"
  echo '# BEGIN TAPRONTO MAINTENANCE'
  echo '15 6 * * * cd /var/www && /bin/node --env-file=.env scripts/cleanup-logs.mjs --apply --json >> /var/www/logs/maintenance-cleanup.log 2>&1'
  echo '45 6 * * * cd /var/www && /bin/node --env-file=.env scripts/cleanup-inactive-trials.mjs --apply --days=14 >> /var/www/logs/trial-cleanup.log 2>&1'
  echo '# END TAPRONTO MAINTENANCE'
} | crontab -

node --env-file=.env scripts/cleanup-logs.mjs --apply --json
node --env-file=.env scripts/cleanup-inactive-trials.mjs --apply --days=14

echo "BACKUP=$BACKUP_DIR"
crontab -l
