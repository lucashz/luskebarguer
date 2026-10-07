#!/usr/bin/env bash
set -euo pipefail
cd /var/www
release=/tmp/assisted-discovery-ba85241.tar.gz
expected=75A0957E6660432D57E5E6EEA0DB20B44890ECE2447E8768FF0682D228DD5A76
actual="$(sha256sum "$release" | awk '{print toupper($1)}')"
test "$actual" = "$expected"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup=".deploy-backups/assisted-discovery-$stamp.tar.gz"
tar -czf "$backup" public/platform-assisted-registration.js public/platform.css public/platform.html src/lib/assisted-registration.js
tar -xzf "$release" -C /var/www
node scripts/assisted-registration-domain-test.mjs
node scripts/assisted-registration-ui-smoke.mjs
old_pid="$(systemctl show cardapio.service -p MainPID --value)"
kill -TERM "$old_pid"
for _ in $(seq 1 45); do
  sleep 1
  new_pid="$(systemctl show cardapio.service -p MainPID --value)"
  if [[ "$new_pid" -gt 0 && "$new_pid" != "$old_pid" ]] && curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then
    printf 'BACKUP=%s\nOLD_PID=%s\nNEW_PID=%s\n' "$backup" "$old_pid" "$new_pid"
    exit 0
  fi
done
systemctl status cardapio.service --no-pager -l
exit 1
