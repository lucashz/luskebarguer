#!/usr/bin/env bash
set -euo pipefail
cd /var/www
release=/tmp/landing-carousel-79b4685.tar.gz
expected=8F08460CAA2589024190ACC506C5EB14630C7904EFACDA4962C5546AB0C9BABE
actual="$(sha256sum "$release" | awk '{print toupper($1)}')"
test "$actual" = "$expected"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup=".deploy-backups/landing-carousel-$stamp.tar.gz"
tar -czf "$backup" public/delivery.css public/delivery.html public/delivery.js public/home.css public/home.html
tar -xzf "$release" -C /var/www
node scripts/whatsapp-cta-smoke.mjs
node --check public/delivery.js
curl -fsS http://127.0.0.1:3000/api/health >/dev/null
printf 'BACKUP=%s\n' "$backup"
