import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');
const [tunnel, worker, envExample, dockerfile] = await Promise.all([
  read('deploy/systemd/tapronto-outreach-tunnel.service'),
  read('deploy/systemd/tapronto-outreach.service'),
  read('deploy/outreach-vm.env.example'),
  read('Dockerfile.outreach')
]);

assert.match(tunnel, /-L\s+172\.17\.0\.1:6543:127\.0\.0\.1:5432/, 'Tunnel must accept the worker only on the internal Docker bridge.');

assert.match(tunnel, /-L\s+127\.0\.0\.1:6543:127\.0\.0\.1:5432/, 'Túnel precisa expor o banco apenas no loopback da VM.');
assert.match(tunnel, /ExitOnForwardFailure=yes/, 'Túnel precisa falhar se o encaminhamento não subir.');
assert.match(tunnel, /IdentityFile=\/root\/\.ssh\/tapronto_outreach_ed25519/, 'Túnel precisa usar chave dedicada.');
assert.match(worker, /Requires=tapronto-outreach-tunnel\.service/, 'Worker precisa depender do túnel.');
assert.match(worker, /After=.*tapronto-outreach-tunnel\.service/, 'Worker precisa iniciar depois do túnel.');
assert.match(worker, /\/usr\/bin\/docker run[^\n]+--network bridge/, 'Worker precisa executar em rede bridge isolada.');
assert.match(worker, /--add-host host\.docker\.internal:host-gateway/, 'Container precisa alcançar somente o túnel no host.');
assert.match(worker, /--read-only/, 'Filesystem do worker precisa ser somente leitura.');
assert.match(worker, /--cap-drop ALL/, 'Worker precisa remover capabilities Linux.');
assert.match(worker, /--security-opt no-new-privileges/, 'Worker precisa bloquear novos privilégios.');
assert.match(worker, /tapronto\/outreach-worker:2026-10-15/, 'Worker precisa usar a imagem validada nesta versão.');
assert.doesNotMatch(worker, /evolution_(?:api|postgres|redis)|\/opt\/evolution/, 'Unidade do outreach não pode manipular a stack Evolution.');
assert.match(envExample, /OUTREACH_AUTOMATION_ENABLED=false/, 'Automação precisa nascer desativada.');
assert.match(envExample, /DATABASE_URL=postgresql:\/\/[^\s]+@host\.docker\.internal:6543\//, 'Banco precisa usar o túnel, não uma porta pública.');
assert.doesNotMatch(envExample, /=\S*(?:123|secret|apikey|token-real)\S*/i, 'Exemplo de ambiente não pode conter segredo real.');
assert.match(dockerfile, /USER node/, 'Worker precisa executar como usuário não-root.');

console.log('Outreach VM deployment smoke: OK');
