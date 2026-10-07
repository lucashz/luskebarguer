#!/usr/bin/env bash
set -euo pipefail
APP_DIR="/var/www"
ARCHIVE="/tmp/attention-static-20ea711.tar.gz"
EXPECTED_SHA="d0ac6ccc36d15dd2b818e405c7ea46ad6e50c01b9be941ea538e85ac04051fd7"
BACKUP_DIR="$APP_DIR/.deploy-backups/attention-static-$(date +%Y%m%d-%H%M%S)"
[ "$(sha256sum "$ARCHIVE" | awk '{print $1}')" = "$EXPECTED_SHA" ] || exit 1
mkdir -p "$BACKUP_DIR/public" "$BACKUP_DIR/scripts"
cp "$APP_DIR/public/platform-client-list.js" "$BACKUP_DIR/public/platform-client-list.js"
cp "$APP_DIR/scripts/platform-client-list-smoke.mjs" "$BACKUP_DIR/scripts/platform-client-list-smoke.mjs"
tar -xzf "$ARCHIVE" -C "$APP_DIR"
cd "$APP_DIR"
node scripts/platform-client-list-smoke.mjs
curl -fsS http://127.0.0.1:3000/api/health >/dev/null
echo "Deploy concluído. Backup: $BACKUP_DIR"
