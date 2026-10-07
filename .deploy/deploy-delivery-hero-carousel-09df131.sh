#!/usr/bin/env bash
set -euo pipefail
cd /var/www
release=/tmp/delivery-hero-carousel-09df131.tar.gz
expected=5BA8573FF90A79BDFEA1AB36BD2955D6DEE0E7D276BE64EF9EB40EFCDD9BA4FC
actual="$(sha256sum "$release" | awk '{print toupper($1)}')"
test "$actual" = "$expected"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup=".deploy-backups/delivery-hero-carousel-$stamp.tar.gz"
tar -czf "$backup" public/delivery.css public/delivery.html
tar -xzf "$release" -C /var/www
node --check public/delivery.js
curl -fsS http://127.0.0.1:3000/api/health >/dev/null
printf 'BACKUP=%s\n' "$backup"
