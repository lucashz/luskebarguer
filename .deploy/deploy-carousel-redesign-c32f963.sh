#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www"
ARCHIVE="/tmp/carousel-redesign-c32f963.tar.gz"
EXPECTED_SHA="ff6cb43eda8d1ef3b66c21d9f670f6ecaa55f10bfad6c5b1834cdfa6c3925c69"
BACKUP_DIR="$APP_DIR/.deploy-backups/carousel-redesign-$(date +%Y%m%d-%H%M%S)"

ACTUAL_SHA="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
  echo "Checksum inválido: $ACTUAL_SHA" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR/public" "$BACKUP_DIR/scripts"
cp "$APP_DIR/public/delivery.css" "$BACKUP_DIR/public/delivery.css"
cp "$APP_DIR/public/delivery.html" "$BACKUP_DIR/public/delivery.html"
cp "$APP_DIR/public/delivery.js" "$BACKUP_DIR/public/delivery.js"
cp "$APP_DIR/scripts/delivery-landing-smoke.mjs" "$BACKUP_DIR/scripts/delivery-landing-smoke.mjs"

tar -xzf "$ARCHIVE" -C "$APP_DIR"
cd "$APP_DIR"
node --check public/delivery.js
node scripts/delivery-landing-smoke.mjs
curl -fsS http://127.0.0.1:3000/api/health >/dev/null

echo "Deploy concluído. Backup: $BACKUP_DIR"
