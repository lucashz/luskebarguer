#!/usr/bin/env bash
set -euo pipefail

app=/var/www
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="$app/.deploy-backups"
backup="$backup_dir/delivery-landing-before-$stamp.tar.gz"

cd "$app"
mkdir -p "$backup_dir"
backup_targets=(server.js)
for file in public/delivery.html public/delivery.css public/delivery.js; do
  if test -f "$file"; then backup_targets+=("$file"); fi
done
tar -czf "$backup" "${backup_targets[@]}"

cp /tmp/tapronto-delivery.html public/delivery.html
cp /tmp/tapronto-delivery.css public/delivery.css
cp /tmp/tapronto-delivery.js public/delivery.js

node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'server.js';
let source = readFileSync(file, 'utf8');

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Não foi possível aplicar ${label} com segurança.`);
  }
  source = source.replace(before, after);
}

function replaceRegexOnce(pattern, replacement, present, label) {
  if (source.includes(present)) return;
  const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1) throw new Error(`Não foi possível aplicar ${label} com segurança.`);
  source = source.replace(pattern, replacement);
}

replaceOnce(
  "const allowed = new Set(['content_view', 'landing_view', 'demo_started', 'signup_started']);",
  "const allowed = new Set(['content_view', 'landing_view', 'whatsapp_click', 'demo_started', 'signup_started']);",
  'evento whatsapp_click'
);

replaceRegexOnce(
  /(\s+'demo',\r?\n)(\s+'suporte',)/,
  "$1    'delivery',\n$2",
  "    'delivery',",
  'slug reservado delivery'
);

replaceRegexOnce(
  /(  if \(requestPath === '\/'\) return '\/home\.html';\r?\n)(  if \(requestPath === '\/ajuda')/,
  "$1  if (requestPath === '/delivery') return '/delivery.html';\n$2",
  "if (requestPath === '/delivery') return '/delivery.html';",
  'rota delivery'
);

writeFileSync(file, source);
NODE

node --check server.js
node --check public/delivery.js

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

body="$(curl --fail --silent --show-error -H 'Host: taprontomenu.com.br' http://127.0.0.1:3000/delivery)"
grep -q 'Ganhe o cadastro assistido do seu cardápio' <<<"$body"
grep -q 'até 5 categorias e 20 produtos' <<<"$body"

echo "BACKUP=$backup"
echo "OLD_PID=$old_pid"
echo "NEW_PID=$new_pid"
systemctl is-active cardapio.service
