#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www"
ARCHIVE="/tmp/attention-filter-869dfb7.tar.gz"
EXPECTED_SHA="8de2d36f22ca579dc9968e35c299f85cfacb57e16225b3ba2026a145b4a8066c"
BACKUP_DIR="$APP_DIR/.deploy-backups/attention-filter-$(date +%Y%m%d-%H%M%S)"

ACTUAL_SHA="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
[ "$ACTUAL_SHA" = "$EXPECTED_SHA" ] || { echo "Checksum inválido" >&2; exit 1; }

mkdir -p "$BACKUP_DIR/public" "$BACKUP_DIR/scripts"
cp "$APP_DIR/server.js" "$BACKUP_DIR/server.js"
cp "$APP_DIR/public/platform.js" "$BACKUP_DIR/public/platform.js"
cp "$APP_DIR/public/platform-client-list.js" "$BACKUP_DIR/public/platform-client-list.js"
cp "$APP_DIR/public/platform.html" "$BACKUP_DIR/public/platform.html"
cp "$APP_DIR/scripts/platform-client-list-smoke.mjs" "$BACKUP_DIR/scripts/platform-client-list-smoke.mjs"

tar -xzf "$ARCHIVE" -C "$APP_DIR"
cd "$APP_DIR"
node --check server.js
node --check public/platform.js
node scripts/platform-client-list-smoke.mjs
sudo systemctl restart cardapio.service
sleep 2
curl -fsS http://127.0.0.1:3000/api/health >/dev/null
echo "Deploy concluído. Backup: $BACKUP_DIR"
