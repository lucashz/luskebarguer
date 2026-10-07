#!/usr/bin/env bash
set -euo pipefail
cd /var/www
release=/tmp/red-cta-1115b7a.tar.gz
expected=9CDE7B654A568666E7CF99A1D63205EECFC838D1916CC3115E04E9D901180165
actual="$(sha256sum "$release" | awk '{print toupper($1)}')"
test "$actual" = "$expected"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup=".deploy-backups/red-cta-$stamp.tar.gz"
tar -czf "$backup" public/delivery.css public/home.css
tar -xzf "$release" -C /var/www
node scripts/whatsapp-cta-smoke.mjs
curl -fsS http://127.0.0.1:3000/api/health >/dev/null
printf 'BACKUP=%s\n' "$backup"
