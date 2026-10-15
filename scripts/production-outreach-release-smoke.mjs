import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptUrl = new URL('../deploy/production-outreach-release.sh', import.meta.url);
const source = await readFile(scriptUrl, 'utf8');

assert.match(source, /sha256sum\s+--check/, 'Deploy precisa validar o checksum antes de extrair o pacote.');
assert.match(source, /npm\s+run\s+db:backup/, 'Deploy precisa criar backup do banco antes da troca.');
assert.match(source, /tar\s+-czf[^\n]+release-files/, 'Deploy precisa criar backup dos arquivos atuais.');
assert.match(source, /npm\s+run\s+db:schema/, 'Deploy precisa aplicar migrations antes do restart.');
assert.match(source, /node\s+--check\s+server\.js/, 'Deploy precisa validar a sintaxe do servidor.');
assert.match(source, /SERVICE_NAME=\$\{SERVICE_NAME:-cardapio\.service\}/, 'Deploy precisa usar cardapio.service por padrão.');
assert.match(source, /systemctl\s+restart\s+"\$SERVICE_NAME"/, 'Deploy precisa reiniciar o serviço público.');
assert.match(source, /HEALTH_URL=\$\{HEALTH_URL:-https:\/\/taprontomenu\.com\.br\/api\/health\}/, 'Deploy precisa usar o health público por padrão.');
assert.match(source, /curl[^\n]+"\$HEALTH_URL"/, 'Deploy precisa validar o health check público.');
assert.match(source, /trap[^\n]+rollback/, 'Deploy precisa registrar rollback para falhas após a substituição.');
assert.match(source, /\.env/, 'Deploy precisa preservar o ambiente real fora do pacote.');
assert.match(source, /if\s+\[\[\s+\$\{EUID\}\s+-eq\s+0\s+\]\]/, 'Deploy precisa distinguir execução root e pelo proprietário da aplicação.');
assert.match(source, /kill\s+-TERM/, 'Sem sudo, o deploy precisa reiniciar pelo processo gerenciado pelo systemd.');
assert.equal((source.match(/--exclude='(?:\.\/)?\.deploy-backups\/?'/g) || []).length, 2, 'Backup e rsync precisam excluir o diretório de backups da própria release.');
assert.equal((source.match(/--exclude='(?:\.\/)?carla\/?'/g) || []).length, 2, 'Backup e rsync precisam preservar a aplicação legada carla fora da release.');
assert.match(source, /rsync\s+-a\s+--checksum\s+--no-perms\s+--no-owner\s+--no-group\s+--omit-dir-times/, 'Rsync precisa ignorar metadados root quando o conteúdo já é idêntico.');
assert.equal((source.match(/20260812230000_marketing_reels/g) || []).length, 2, 'A migration histórica root precisa permanecer imutável no backup e no rsync.');

console.log('Production outreach release smoke: OK');
