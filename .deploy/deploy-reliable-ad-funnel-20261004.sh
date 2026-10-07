#!/usr/bin/env bash
set -euo pipefail

app=/var/www
patch=/tmp/reliable-ad-funnel-20261004.lf.patch
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="$app/.deploy-backups/reliable-ad-funnel-$stamp.tar.gz"

cd "$app"
node --input-type=module <<'NODE'
import { readFile } from 'node:fs/promises';
const checks = [
  ['public/platform.html', 'name="declared_source"', 'name="tracking_code"'],
  ['public/platform-assisted-registration.js', "form.elements.declared_source.value=registration.attribution?.declared_source||'';", 'form.elements.tracking_code.value'],
  ['public/platform-assisted-registration.js', 'attribution:{...(active?.attribution||{}),declared_source:values.declared_source},answers:', "tracking_code:String(values.tracking_code||'').trim().toUpperCase()"]
];
for (const [file, expected, applied] of checks) {
  const source = await readFile(file, 'utf8');
  if (!source.includes(expected) && !source.includes(applied)) throw new Error(`Pré-condição ausente em ${file}`);
}
NODE

mkdir -p "$app/.deploy-backups"
tar -czf "$backup" \
  server.js \
  public/delivery.html public/delivery.js \
  public/platform.html public/platform.js public/platform-assisted-registration.js \
  src/lib/platform-ad-funnel.js src/lib/assisted-registration.js

git apply --ignore-space-change --ignore-whitespace \
  --exclude=public/platform.html \
  --exclude=public/platform-assisted-registration.js \
  "$patch"

node --input-type=module <<'NODE'
import { readFile, writeFile } from 'node:fs/promises';

async function replaceOnce(file, before, after, marker) {
  const source = await readFile(file, 'utf8');
  if (source.includes(marker)) return;
  if (!source.includes(before)) throw new Error(`Trecho esperado ausente em ${file}: ${marker}`);
  const updated = source.replace(before, after);
  if (updated === source || !updated.includes(marker)) throw new Error(`Falha ao aplicar ${marker} em ${file}`);
  await writeFile(file, updated);
}

await replaceOnce(
  'public/platform.html',
  '<label>Nicho<input name="niche" placeholder="Pizzaria, hamburgueria..."></label><label>Origem informada pelo lead<input name="declared_source" placeholder="Instagram, indicação..."></label>',
  '<label>Nicho<input name="niche" placeholder="Pizzaria, hamburgueria..."></label><label>Origem informada pelo lead<input name="declared_source" placeholder="Instagram, indicação..."></label>\n                <label>Código de atendimento<input name="tracking_code" placeholder="TP-ABC123" autocomplete="off"></label>',
  'name="tracking_code"'
);

await replaceOnce(
  'public/platform-assisted-registration.js',
  "form.elements.declared_source.value=registration.attribution?.declared_source||''; form.querySelectorAll('[name=\"fulfillment\"]')",
  "form.elements.declared_source.value=registration.attribution?.declared_source||''; form.elements.tracking_code.value=registration.attribution?.tracking_code||''; form.querySelectorAll('[name=\"fulfillment\"]')",
  'form.elements.tracking_code.value'
);

await replaceOnce(
  'public/platform-assisted-registration.js',
  'attribution:{...(active?.attribution||{}),declared_source:values.declared_source},answers:',
  "attribution:{...(active?.attribution||{}),declared_source:values.declared_source,tracking_code:String(values.tracking_code||'').trim().toUpperCase()},answers:",
  "tracking_code:String(values.tracking_code||'').trim().toUpperCase()"
);
NODE

node --check server.js
node --check public/delivery.js
node --check public/platform.js
node --check public/platform-assisted-registration.js
node --check src/lib/platform-ad-funnel.js
node --check src/lib/assisted-registration.js
grep -q '20261004-reliable-attribution' public/delivery.html
grep -q 'Visualizações registradas' public/platform.js
grep -q 'name="tracking_code"' public/platform.html

old_pid="$(systemctl show cardapio.service --property MainPID --value)"
kill -TERM "$old_pid"
new_pid=0
for _ in $(seq 1 30); do
  sleep 1
  new_pid="$(systemctl show cardapio.service --property MainPID --value)"
  if [[ "$new_pid" -gt 0 && "$new_pid" != "$old_pid" ]] && kill -0 "$new_pid" 2>/dev/null; then
    break
  fi
done
test "$new_pid" -gt 0
test "$new_pid" != "$old_pid"
kill -0 "$new_pid"
systemctl is-active cardapio.service
curl -fsS -H 'Host: taprontomenu.com.br' http://127.0.0.1:3000/api/health >/dev/null

printf 'BACKUP=%s\nOLD_PID=%s\nNEW_PID=%s\n' "$backup" "$old_pid" "$new_pid"
