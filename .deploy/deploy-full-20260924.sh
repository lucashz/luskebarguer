#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/var/www
RELEASE=/tmp/tapronto-full-20260924.tar.gz
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$APP_DIR/.deploy-backups/full-$STAMP"
BACKUP_ARCHIVE="$BACKUP_DIR/application-before.tar.gz"

test -s "$RELEASE"
mkdir -p "$BACKUP_DIR"
cd "$APP_DIR"

backup_targets=()
for target in server.js package.json package-lock.json prisma public scripts src supabase deploy docs marketing-studio README.md docker-compose.yml .env; do
  [[ -e "$target" ]] && backup_targets+=("$target")
done
tar -czf "$BACKUP_ARCHIVE" "${backup_targets[@]}"

tar -xzf "$RELEASE" -C "$APP_DIR" --exclude='prisma/migrations/20260812230000_marketing_reels' --exclude='prisma/migrations/20260812230000_marketing_reels/*'

set_env_default() {
  local key="$1"
  local value="$2"
  if ! grep -q "^${key}=." .env; then
    printf '\n%s=%s\n' "$key" "$value" >> .env
  fi
}

set_env_default APP_ENV production
set_env_default ALLOWED_ORIGINS 'https://taprontomenu.com.br,https://www.taprontomenu.com.br,https://app.taprontomenu.com.br,https://central.taprontomenu.com.br'
set_env_default TRUSTED_PROXY_HOPS 1
set_env_default SECURITY_RATE_LIMIT_SECRET "$(openssl rand -hex 32)"
set_env_default PAYMENT_COOKIE_SECRET "$(openssl rand -hex 32)"

DEPENDENCY_BASELINE=/var/www/.deploy-backups/full-20260924T213152Z/application-before.tar.gz
export DEPENDENCY_BASELINE
node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const before = JSON.parse(execFileSync('tar', ['-xOzf', process.env.DEPENDENCY_BASELINE, 'package.json'], { encoding: 'utf8' }));
const after = JSON.parse(readFileSync('package.json', 'utf8'));
if (JSON.stringify(before.dependencies || {}) !== JSON.stringify(after.dependencies || {})) {
  throw new Error('Dependencias de runtime mudaram; instalacao privilegiada necessaria.');
}
console.log('Manifesto de dependencias de runtime preservado.');
NODE
if [[ -d node_modules ]]; then
  mv node_modules "$BACKUP_DIR/node_modules-before"
fi
npm ci
node --check server.js
node --check src/lib/security-http.js
node --check src/lib/security-redaction.js
node --check src/lib/security-rate-limit.js
npx prisma migrate deploy

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
kill -0 "$NEW_PID"
systemctl is-active cardapio.service
curl -fsS http://127.0.0.1:3000/api/health

echo "BACKUP=$BACKUP_ARCHIVE"
echo "OLD_PID=$OLD_PID"
echo "NEW_PID=$NEW_PID"
