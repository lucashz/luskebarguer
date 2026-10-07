#!/usr/bin/env bash
set -euo pipefail

app=/var/www
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="$app/.deploy-backups"
backup="$backup_dir/brand-before-20260921-$stamp.tar.gz"

cd "$app"
mkdir -p "$backup_dir"
mapfile -t changed < <(grep -RIlE 'tapronto-logo-horizontal|tapronto-favicon' public server.js)
for required in public/styles.css public/platform.css public/platform.html; do
  if [[ ! " ${changed[*]} " =~ " $required " ]]; then changed+=("$required"); fi
done
tar -czf "$backup" "${changed[@]}"

cp /tmp/tapronto-logo-2026.png public/assets/tapronto-logo-2026.png
cp /tmp/tapronto-logo-source-2026.png public/assets/tapronto-logo-source-2026.png
cp /tmp/tapronto-mark-2026.png public/assets/tapronto-mark-2026.png
node /tmp/update-brand-refs.mjs
node /tmp/finalize-brand.mjs
node --check server.js

if grep -RIlE 'tapronto-logo-horizontal|tapronto-favicon' public server.js | grep -q .; then
  echo 'Referencias antigas permaneceram apos a atualizacao.' >&2
  exit 1
fi

old_pid="$(systemctl show cardapio.service --property MainPID --value)"
kill -TERM "$old_pid"
new_pid=0
for _ in $(seq 1 30); do
  sleep 1
  new_pid="$(systemctl show cardapio.service --property MainPID --value)"
  if test "$new_pid" -gt 0 && test "$new_pid" != "$old_pid" && kill -0 "$new_pid" 2>/dev/null; then break; fi
done
test "$new_pid" -gt 0
test "$new_pid" != "$old_pid"
kill -0 "$new_pid"

echo "BACKUP=$backup"
echo "OLD_PID=$old_pid"
echo "NEW_PID=$new_pid"
systemctl is-active cardapio.service
