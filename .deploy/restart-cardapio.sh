#!/usr/bin/env bash
set -euo pipefail
oldpid="$(systemctl show cardapio.service -p MainPID --value)"
kill -TERM "$oldpid"
for _ in {1..15}; do
  sleep 1
  newpid="$(systemctl show cardapio.service -p MainPID --value)"
  if [[ "$newpid" != "0" && "$newpid" != "$oldpid" ]]; then
    echo "old_pid=$oldpid new_pid=$newpid"
    systemctl is-active cardapio.service
    exit 0
  fi
done
echo "O servico nao reiniciou dentro do prazo." >&2
exit 1
