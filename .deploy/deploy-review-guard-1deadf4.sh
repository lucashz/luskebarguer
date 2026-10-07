#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www"
ARCHIVE="/tmp/review-guard-1deadf4.tar.gz"
EXPECTED_SHA="5bfbfe9832aeff9bcbf2d3da780e26f8cb31fcef884365ed464d3d42c3e40125"
BACKUP_DIR="$APP_DIR/.deploy-backups/review-guard-$(date +%Y%m%d-%H%M%S)"

ACTUAL_SHA="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
  echo "Checksum inválido: $ACTUAL_SHA" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR/public" "$BACKUP_DIR/scripts"
cp "$APP_DIR/public/platform.html" "$BACKUP_DIR/public/platform.html"
cp "$APP_DIR/public/platform-assisted-registration.js" "$BACKUP_DIR/public/platform-assisted-registration.js"
cp "$APP_DIR/scripts/assisted-registration-ui-smoke.mjs" "$BACKUP_DIR/scripts/assisted-registration-ui-smoke.mjs"

tar -xzf "$ARCHIVE" -C "$APP_DIR"
cd "$APP_DIR"
node --check public/platform-assisted-registration.js
node scripts/assisted-registration-ui-smoke.mjs
curl -fsS http://127.0.0.1:3000/api/health >/dev/null

echo "Deploy concluído. Backup: $BACKUP_DIR"
