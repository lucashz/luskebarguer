#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/var/www
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$APP_DIR/.deploy-backups/client-list-$STAMP"

mkdir -p "$BACKUP_DIR/public"
cp "$APP_DIR/server.js" "$BACKUP_DIR/server.js"
cp "$APP_DIR/public/platform.html" "$BACKUP_DIR/public/platform.html"
cp "$APP_DIR/public/platform.js" "$BACKUP_DIR/public/platform.js"
cp "$APP_DIR/public/platform.css" "$BACKUP_DIR/public/platform.css"
if [[ -f "$APP_DIR/public/platform-client-list.js" ]]; then
  cp "$APP_DIR/public/platform-client-list.js" "$BACKUP_DIR/public/platform-client-list.js"
fi

cp /tmp/tapronto-platform.html "$APP_DIR/public/platform.html"
cp /tmp/tapronto-platform.js "$APP_DIR/public/platform.js"
cp /tmp/tapronto-platform.css "$APP_DIR/public/platform.css"
cp /tmp/tapronto-platform-client-list.js "$APP_DIR/public/platform-client-list.js"

cd "$APP_DIR"
node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'server.js';
const source = readFileSync(file, 'utf8');
const start = source.indexOf('async function listPlatformCompanies(');
const end = source.indexOf('\nasync function ', start + 1);
if (start < 0 || end < 0) throw new Error('Função listPlatformCompanies não encontrada.');
const block = source.slice(start, end);
const expected = "order: 'created_at.desc',";
if (!block.includes(expected)) {
  if (block.includes("order: 'name.asc',")) process.exit(0);
  throw new Error('Ordenação esperada não encontrada; deploy cancelado.');
}
const updatedBlock = block.replace(expected, "order: 'name.asc',");
if (updatedBlock === block) throw new Error('Ordenação não foi atualizada.');
writeFileSync(file, source.slice(0, start) + updatedBlock + source.slice(end));
NODE

node --check server.js
node --check public/platform.js
node --check public/platform-client-list.js
grep -q 'platform-client-list.js?v=20260922' public/platform.html
grep -q 'platform-company-compact-data' public/platform.js

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
curl -fsS https://central.taprontomenu.com.br/platform-client-list.js?v=20260922 >/dev/null
CSS_BODY="$(curl -fsS https://central.taprontomenu.com.br/platform.css?v=20260922-clients-compact)"
grep -q 'platform-company-compact-data' <<<"$CSS_BODY"

echo "BACKUP=$BACKUP_DIR"
echo "OLD_PID=$OLD_PID"
echo "NEW_PID=$NEW_PID"
