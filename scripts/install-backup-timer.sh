#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www}"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
BACKUP_INTERVAL="${BACKUP_INTERVAL:-24h}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
LOG_DIR="${LOG_DIR:-/var/log/cardapio}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Execute como root: sudo bash scripts/install-backup-timer.sh" >&2
  exit 1
fi

if [[ ! -x "$NODE_BIN" ]]; then
  echo "Node nao encontrado em NODE_BIN=$NODE_BIN" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR" "$LOG_DIR"
chown -R lucas:lucas "$BACKUP_DIR" "$LOG_DIR" 2>/dev/null || true

cat >/etc/systemd/system/cardapio-db-backup.service <<SERVICE
[Unit]
Description=Cardapio PostgreSQL backup
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$APP_DIR
Environment=BACKUP_DIR=$BACKUP_DIR
Environment=BACKUP_RETENTION_DAYS=$BACKUP_RETENTION_DAYS
ExecStart=$NODE_BIN $APP_DIR/scripts/backup-postgres.mjs
StandardOutput=append:$LOG_DIR/db-backup.log
StandardError=append:$LOG_DIR/db-backup.log
SERVICE

cat >/etc/systemd/system/cardapio-db-backup.timer <<TIMER
[Unit]
Description=Run Cardapio PostgreSQL backup every $BACKUP_INTERVAL

[Timer]
OnBootSec=10min
OnUnitActiveSec=$BACKUP_INTERVAL
Persistent=true
Unit=cardapio-db-backup.service

[Install]
WantedBy=timers.target
TIMER

systemctl daemon-reload
systemctl enable --now cardapio-db-backup.timer
systemctl list-timers cardapio-db-backup.timer --no-pager
