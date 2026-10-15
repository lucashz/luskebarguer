#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 2 ]]; then
  echo "Uso: $0 <release.tar.gz> <release.tar.gz.sha256>" >&2
  exit 64
fi

ARCHIVE=$(readlink -f "$1")
CHECKSUM_FILE=$(readlink -f "$2")
APP_DIR=${APP_DIR:-/var/www}
APP_USER=${APP_USER:-lucas}
APP_GROUP=${APP_GROUP:-lucas}
SERVICE_NAME=${SERVICE_NAME:-cardapio.service}
HEALTH_URL=${HEALTH_URL:-https://taprontomenu.com.br/api/health}
if [[ ${EUID} -eq 0 ]]; then
  BACKUP_ROOT=${BACKUP_ROOT:-/var/backups/tapronto-releases}
else
  [[ $(id -un) == "$APP_USER" && -w "$APP_DIR" ]] || { echo "Execute como root ou como $APP_USER com acesso a $APP_DIR." >&2; exit 77; }
  BACKUP_ROOT=${BACKUP_ROOT:-$APP_DIR/.deploy-backups}
fi
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR="$BACKUP_ROOT/$STAMP"
STAGE=$(mktemp -d "/var/tmp/tapronto-release-$STAMP-XXXXXX")
FILES_REPLACED=false

cleanup() {
  if [[ "$STAGE" == /var/tmp/tapronto-release-* ]]; then
    rm -rf -- "$STAGE"
  fi
}

run_as_app() {
  if [[ ${EUID} -eq 0 ]]; then
    runuser -u "$APP_USER" -- "$@"
  else
    "$@"
  fi
}

restart_service() {
  if [[ ${EUID} -eq 0 ]]; then
    systemctl restart "$SERVICE_NAME"
    return
  fi
  local old_pid new_pid
  old_pid=$(systemctl show -p MainPID --value "$SERVICE_NAME")
  [[ "$old_pid" =~ ^[1-9][0-9]*$ ]] || { echo "PID inválido para $SERVICE_NAME." >&2; return 1; }
  kill -TERM "$old_pid"
  for attempt in {1..30}; do
    sleep 1
    new_pid=$(systemctl show -p MainPID --value "$SERVICE_NAME")
    if [[ "$new_pid" =~ ^[1-9][0-9]*$ && "$new_pid" != "$old_pid" ]] && systemctl is-active --quiet "$SERVICE_NAME"; then
      return
    fi
  done
  echo "O systemd não reiniciou $SERVICE_NAME após o sinal." >&2
  return 1
}

rollback() {
  local exit_code=$?
  trap - ERR
  if [[ "$FILES_REPLACED" == true && -f "$BACKUP_DIR/release-files.tar.gz" ]]; then
    echo "Falha após a substituição; restaurando arquivos anteriores." >&2
    tar -xzf "$BACKUP_DIR/release-files.tar.gz" -C "$APP_DIR"
    if [[ ${EUID} -eq 0 ]]; then chown -R "$APP_USER:$APP_GROUP" "$APP_DIR"; fi
    restart_service || true
  fi
  cleanup
  exit "$exit_code"
}

trap 'rollback' ERR
trap 'cleanup' EXIT

[[ -f "$ARCHIVE" ]] || { echo "Pacote ausente: $ARCHIVE" >&2; exit 66; }
[[ -f "$CHECKSUM_FILE" ]] || { echo "Checksum ausente: $CHECKSUM_FILE" >&2; exit 66; }
[[ -f "$APP_DIR/.env" ]] || { echo "Ambiente real ausente em $APP_DIR/.env" >&2; exit 78; }

cd "$(dirname "$ARCHIVE")"
sha256sum --check "$CHECKSUM_FILE"

if tar -tzf "$ARCHIVE" | grep -Eq '(^/|(^|/)\.\.(/|$)|(^|/)\.env($|\.)|(^|/)node_modules(/|$))'; then
  echo "Pacote contém caminho inseguro ou arquivo proibido." >&2
  exit 65
fi

tar -xzf "$ARCHIVE" -C "$STAGE"
ln -s "$APP_DIR/.env" "$STAGE/.env"
if [[ ${EUID} -eq 0 ]]; then chown -R "$APP_USER:$APP_GROUP" "$STAGE"; fi

mkdir -p "$BACKUP_DIR/database"
if [[ ${EUID} -eq 0 ]]; then chown -R "$APP_USER:$APP_GROUP" "$BACKUP_DIR/database"; fi
(
  cd "$APP_DIR"
  run_as_app env BACKUP_DIR="$BACKUP_DIR/database" npm run db:backup
)

tar -czf "$BACKUP_DIR/release-files.tar.gz" \
  --exclude='./.env' \
  --exclude='./backups' \
  --exclude='./artifacts' \
  --exclude='./uploads' \
  --exclude='./private-uploads' \
  --exclude='./.deploy-backups' \
  --exclude='./carla' \
  --exclude='./prisma/migrations/20260812230000_marketing_reels' \
  --exclude='./.git' \
  -C "$APP_DIR" .

(
  cd "$STAGE"
  run_as_app npm ci
  run_as_app node --check server.js
  run_as_app npm run db:schema
)

if [[ ${EUID} -eq 0 ]]; then systemctl stop "$SERVICE_NAME"; fi
FILES_REPLACED=true
rsync -a --checksum --no-perms --no-owner --no-group --omit-dir-times --delete \
  --exclude='.env' \
  --exclude='backups/' \
  --exclude='artifacts/' \
  --exclude='uploads/' \
  --exclude='private-uploads/' \
  --exclude='.deploy-backups/' \
  --exclude='carla/' \
  --exclude='prisma/migrations/20260812230000_marketing_reels/' \
  --exclude='.git/' \
  "$STAGE/" "$APP_DIR/"
if [[ ${EUID} -eq 0 ]]; then chown -R "$APP_USER:$APP_GROUP" "$APP_DIR"; fi
restart_service

for attempt in {1..30}; do
  if systemctl is-active --quiet "$SERVICE_NAME" && curl --fail --silent --show-error "$HEALTH_URL" | grep -q '"ok"[[:space:]]*:[[:space:]]*true'; then
    FILES_REPLACED=false
    echo "Release publicada e saudável. Backup: $BACKUP_DIR"
    exit 0
  fi
  sleep 2
done

echo "Serviço não ficou saudável dentro do prazo." >&2
exit 1
