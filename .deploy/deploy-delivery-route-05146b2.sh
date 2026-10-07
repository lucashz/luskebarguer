#!/usr/bin/env bash
set -euo pipefail
cd /var/www
test "$(sha256sum /tmp/delivery-route-05146b2.tar.gz | awk '{print toupper($1)}')" = "C689842BE6A800214E6F2083C35D601AC02B834114D6CF89C79B468EA0FF19BC"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
cp server.js ".deploy-backups/server-before-delivery-route-$stamp.js"
tar -xzf /tmp/delivery-route-05146b2.tar.gz -C /var/www
node --check server.js
old_pid="$(systemctl show cardapio.service -p MainPID --value)"
kill -TERM "$old_pid"
for _ in $(seq 1 45); do
  sleep 1
  new_pid="$(systemctl show cardapio.service -p MainPID --value)"
  if [[ "$new_pid" -gt 0 && "$new_pid" != "$old_pid" ]] && curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then
    printf 'BACKUP=%s\nOLD_PID=%s\nNEW_PID=%s\n' ".deploy-backups/server-before-delivery-route-$stamp.js" "$old_pid" "$new_pid"
    exit 0
  fi
done
systemctl status cardapio.service --no-pager -l
exit 1
