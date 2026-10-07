#!/usr/bin/env bash
set -euo pipefail

app=/var/www
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
cd "$app"
cp public/delivery.css ".deploy-backups/delivery-css-before-$stamp.css"
cp public/delivery.html ".deploy-backups/delivery-html-before-$stamp.html"
cp /tmp/tapronto-delivery.css public/delivery.css
cp /tmp/tapronto-delivery.html public/delivery.html

grep -q 'height: 420px' public/delivery.css
grep -q 'delivery.css?v=20260921-2' public/delivery.html

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
curl --fail --silent --show-error -H 'Host: taprontomenu.com.br' http://127.0.0.1:3000/delivery.css | grep -q 'height: 420px'
echo "OLD_PID=$old_pid"
echo "NEW_PID=$new_pid"
systemctl is-active cardapio.service
