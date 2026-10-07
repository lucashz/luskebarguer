#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/var/www
RELEASE=/tmp/assisted-registration-3af8a47cf8aa.tar.gz
EXPECTED_SHA=23C9E796DEB4005659213B4B88ACA7A6FC4D7BBBC63F8B8AB4594213A5E508E9
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$APP_DIR/.deploy-backups/assisted-registration-$STAMP"

test -s "$RELEASE"
ACTUAL_SHA="$(sha256sum "$RELEASE" | awk '{print toupper($1)}')"
test "$ACTUAL_SHA" = "$EXPECTED_SHA"

cd "$APP_DIR"
test -s .env
grep -q '^DATABASE_URL=.' .env

mkdir -p "$BACKUP_DIR"
npm run db:backup

backup_targets=()
for target in server.js package.json package-lock.json prisma public scripts src supabase deploy docs README.md docker-compose.yml; do
  [[ -e "$target" ]] && backup_targets+=("$target")
done
tar -czf "$BACKUP_DIR/application-before.tar.gz" "${backup_targets[@]}"

tar -xzf "$RELEASE" -C "$APP_DIR" \
  --exclude='prisma/migrations/20260812230000_marketing_reels' \
  --exclude='prisma/migrations/20260812230000_marketing_reels/*'
mkdir -p "$APP_DIR/private-uploads/assisted"
npm ci
npm run db:schema
node --check server.js
node scripts/assisted-registration-release-regression.mjs
node scripts/assisted-registration-ui-smoke.mjs

OLD_PID="$(systemctl show cardapio.service --property MainPID --value)"
kill -TERM "$OLD_PID"
NEW_PID=0
for _ in $(seq 1 45); do
  sleep 1
  NEW_PID="$(systemctl show cardapio.service --property MainPID --value)"
  if [[ "$NEW_PID" -gt 0 && "$NEW_PID" != "$OLD_PID" ]] && kill -0 "$NEW_PID" 2>/dev/null; then
    break
  fi
done

test "$NEW_PID" -gt 0
test "$NEW_PID" != "$OLD_PID"
systemctl is-active cardapio.service
curl -fsS http://127.0.0.1:3000/api/health

printf '\nBACKUP=%s\nOLD_PID=%s\nNEW_PID=%s\n' "$BACKUP_DIR" "$OLD_PID" "$NEW_PID"
