# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Endurecer autenticação, sessões, transporte de tokens, exposição de dados e isolamento multi-tenant do TáPronto sem migrar para JWT e sem publicar automaticamente em produção.

**Architecture:** Preservar sessões opacas em cookies `HttpOnly`, extrair controles de segurança para módulos pequenos e usar PostgreSQL para rate limiting persistente. Cada fronteira pública ou autenticada terá testes HTTP locais, e cada operação multi-tenant será validada com o tenant derivado da sessão em vez do identificador enviado pelo cliente.

**Tech Stack:** Node.js 24, HTTP nativo, PostgreSQL, `pg`, Prisma migrations, testes smoke com `node:assert/strict` e `fetch`.

**Spec:** `docs/superpowers/specs/2026-09-22-security-hardening-design.md`

## Global Constraints

- Manter tokens de sessão opacos; não introduzir JWT.
- Não armazenar credenciais em `localStorage` ou `sessionStorage`.
- Não executar testes destrutivos nem usar contas ou dados reais.
- Todo dado sintético deve usar transação com rollback ou limpeza explícita.
- Nenhuma etapa publica em produção; produção exige autorização posterior.
- Cada correção começa com teste falhando e termina com regressão verde.
- Não expor senha, hash, token, segredo ou PII no output dos testes.

## Review Focus

- `X-Forwarded-For` com múltiplos valores ou valor malformado deve resultar em chave de rede normalizada, sem permitir multiplicar limites.
- Identidades equivalentes com maiúsculas, espaços ou pontuação devem compartilhar o mesmo contador.
- Duas abas iniciando pagamentos diferentes não podem acessar pedidos uma da outra; o cookie deve estar vinculado ao código do pedido.
- Alteração de senha deve revogar outras sessões sem invalidar a nova sessão criada pelo próprio fluxo de redefinição.
- Um UUID válido pertencente a outra empresa deve produzir `404` tanto em leitura quanto em escrita, sem revelar a existência do recurso.

---

### Task 1: Base de testes de segurança HTTP

**Files:**
- Create: `scripts/security-hardening-smoke.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: servidor iniciado por `node server.js` e `DATABASE_URL` local.
- Produces: comando `npm run test:security-hardening` e helpers `startServer()`, `request()`, `withSyntheticTenant()` usados pelos testes deste plano.

- [ ] **Step 1: Criar o teste-base com servidor isolado**

```js
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import pg from 'pg';

const port = 4300 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), APP_URL: baseUrl, COOKIE_SECURE: 'false' },
  stdio: ['ignore', 'pipe', 'pipe']
});

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  return { response, body: await response.json().catch(() => ({})) };
}

// Aguarde /api/health, execute os casos registrados e finalize child no finally.
assert.equal((await request('/api/health')).response.status, 200);
```

- [ ] **Step 2: Adicionar o comando inicialmente inexistente**

Em `package.json`:

```json
"test:security-hardening": "node scripts/security-hardening-smoke.mjs"
```

- [ ] **Step 3: Executar o teste-base**

Run: `npm run test:security-hardening`

Expected: PASS com apenas `/api/health`; nenhuma linha contendo token, senha, documento ou hash.

- [ ] **Step 4: Integrar o comando à suíte**

Adicionar `npm run test:security-hardening` depois de `npm run test:security` em `test:all`.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/security-hardening-smoke.mjs
git commit -m "test: add security hardening harness"
```

### Task 2: Rate limiting persistente por IP e identidade

**Files:**
- Create: `prisma/migrations/20260922090000_security_rate_limits/migration.sql`
- Create: `src/lib/security-rate-limit.js`
- Modify: `server.js:16294-16389`
- Modify: `scripts/security-hardening-smoke.mjs`

**Interfaces:**
- Consumes: `getLocalPool()` e corpo já parseado nos endpoints sensíveis.
- Produces: `enforceSecurityRateLimit({ req, rule, identity }) -> Promise<void>` e `securityRateRule(method, pathname) -> object|null`.

- [ ] **Step 1: Escrever testes que provem as duas dimensões**

Adicionar casos que:

```js
for (let index = 0; index < 8; index += 1) {
  await request('/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.10' },
    body: JSON.stringify({ email: `same@example.com`, password: 'incorreta' })
  });
}
const blockedIp = await request('/api/admin/login', { /* mesmo IP, outro e-mail */ });
assert.equal(blockedIp.response.status, 429);

// Repita o mesmo e-mail normalizado a partir de IPs diferentes.
assert.equal(blockedIdentity.response.status, 429);
assert.match(blockedIdentity.response.headers.get('retry-after') || '', /^\d+$/);
```

Também testar ` User@Example.com ` e `user@example.com` como a mesma identidade, e `X-Forwarded-For: valor-inválido, 198.51.100.10` sem criar chaves ilimitadas.

- [ ] **Step 2: Rodar e confirmar RED**

Run: `npm run test:security-hardening`

Expected: FAIL porque o limite atual usa somente IP, não persiste e não envia `Retry-After`.

- [ ] **Step 3: Criar a tabela persistente**

```sql
CREATE TABLE security_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  rule_name TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('network','identity')),
  hit_count INTEGER NOT NULL DEFAULT 0,
  window_ends_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX security_rate_limits_expiry_idx ON security_rate_limits(window_ends_at);
```

- [ ] **Step 4: Implementar chaves sem PII**

Em `src/lib/security-rate-limit.js`:

```js
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

export function normalizedIdentity(value = '') {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9@+._-]/g, '');
}

export function opaqueBucketKey(secret, ruleName, scope, value) {
  return createHash('sha256').update(`${secret}:${ruleName}:${scope}:${value}`).digest('hex');
}

export function requestIp(req) {
  const candidate = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  return isIP(candidate) ? candidate : 'unknown';
}
```

Usar o endereço remoto confiável do proxy local; não aceitar diretamente um `X-Forwarded-For` fornecido pelo cliente. Caso a implantação configure proxies confiáveis, encapsular a leitura em `TRUSTED_PROXY_HOPS` com valor numérico explícito.

- [ ] **Step 5: Implementar incremento atômico e bloqueio**

```sql
INSERT INTO security_rate_limits(bucket_key,rule_name,scope,hit_count,window_ends_at)
VALUES($1,$2,$3,1,now()+($4 || ' milliseconds')::interval)
ON CONFLICT(bucket_key) DO UPDATE SET
  hit_count=CASE WHEN security_rate_limits.window_ends_at<=now() THEN 1 ELSE security_rate_limits.hit_count+1 END,
  window_ends_at=CASE WHEN security_rate_limits.window_ends_at<=now() THEN excluded.window_ends_at ELSE security_rate_limits.window_ends_at END,
  updated_at=now()
RETURNING hit_count,window_ends_at;
```

Lançar erro `429` com propriedade `retryAfter`; o handler deve escrever `Retry-After` sem incluir a identidade.

- [ ] **Step 6: Aplicar antes dos handlers sensíveis**

Ler o corpo uma única vez nos endpoints de autenticação e passar identidade normalizada. Regras mínimas: admin login, 2FA, customer login, reset, recover, resend activation, signup e order create.

- [ ] **Step 7: Executar testes e migração local**

Run: `npm run db:schema && npm run test:security-hardening`

Expected: PASS para limites por rede, identidade, normalização e `Retry-After`.

- [ ] **Step 8: Commit**

```bash
git add prisma/migrations/20260922090000_security_rate_limits src/lib/security-rate-limit.js server.js scripts/security-hardening-smoke.mjs
git commit -m "feat: persist authentication rate limits"
```

### Task 3: Eliminar enumeração de contas

**Files:**
- Create: `src/lib/security-auth.js`
- Modify: `server.js:2469-2635`
- Modify: `scripts/security-hardening-smoke.mjs`

**Interfaces:**
- Consumes: `verifyPassword`, envio de e-mail e auditoria existentes.
- Produces: `invalidCredentialError()`, `verifyPasswordOrDummy(password, storedHash)` e resposta pública uniforme de recuperação.

- [ ] **Step 1: Escrever casos de enumeração**

```js
const unknown = await timedLogin('nao-existe@example.invalid', 'senha-invalida');
const wrong = await timedLogin(syntheticAdmin.email, 'senha-invalida');
assert.equal(unknown.status, 401);
assert.equal(wrong.status, 401);
assert.equal(unknown.body.error, wrong.body.error);
assert.ok(Math.abs(unknown.durationMs - wrong.durationMs) < 250);
```

Para recuperação, simular falha SMTP e confirmar que e-mail existente e inexistente recebem `200` com corpo idêntico.

- [ ] **Step 2: Rodar e confirmar RED**

Run: `npm run test:security-hardening`

Expected: FAIL porque o login atual retorna `404`, `401` e mensagens diferentes.

- [ ] **Step 3: Implementar verificação com hash sentinela**

```js
const DUMMY_PASSWORD_HASH = 'pbkdf2_sha256$310000$00000000000000000000000000000000$...';
export function invalidCredentialError(httpError) {
  return httpError(401, 'E-mail ou senha inválidos.');
}
export function passwordHashForVerification(account) {
  return account?.password_hash || DUMMY_PASSWORD_HASH;
}
```

Gerar uma vez o hash sentinela válido e fixá-lo no módulo; nunca gerá-lo por requisição.

- [ ] **Step 4: Uniformizar login e recuperação**

Executar `verifyPassword(password, passwordHashForVerification(admin))` antes de decidir a resposta. Para recuperação, responder `200` antes de expor resultado do envio; registrar falha SMTP sanitizada em auditoria e fila/log interno, sem retornar `502` ao solicitante.

- [ ] **Step 5: Executar regressão**

Run: `npm run test:security-hardening && npm run test:flows`

Expected: PASS; login válido continua criando sessão e inválidos são indistinguíveis externamente.

- [ ] **Step 6: Commit**

```bash
git add src/lib/security-auth.js server.js scripts/security-hardening-smoke.mjs
git commit -m "fix: prevent account enumeration"
```

### Task 4: Endurecer cookies e revogar sessões após mudança de credencial

**Files:**
- Modify: `server.js:14761-14798,16095-16205,20509-20518`
- Modify: `.env.example`
- Modify: `.env.production.example`
- Modify: `scripts/security-hardening-smoke.mjs`

**Interfaces:**
- Consumes: tabela `app_sessions` e `createPersistentSession()`.
- Produces: `deleteOwnerSessions(type, ownerId, exceptTokenHash?)` e `sessionCookie(name,value,{production})` com política segura.

- [ ] **Step 1: Testar revogação e flags**

Criar duas sessões sintéticas para o mesmo usuário, redefinir a senha e confirmar `401` nas duas sessões antigas. Confirmar em modo produção:

```js
assert.match(setCookie, /HttpOnly/i);
assert.match(setCookie, /Secure/i);
assert.match(setCookie, /SameSite=Lax/i);
assert.doesNotMatch(setCookie, /Domain=/i);
```

- [ ] **Step 2: Rodar e confirmar RED**

Run: `npm run test:security-hardening`

Expected: FAIL porque a redefinição não remove sessões e `Secure` pode ficar desativado em produção.

- [ ] **Step 3: Implementar revogação por titular**

```js
async function deleteOwnerSessions(type, ownerId, exceptTokenHash = '') {
  const filters = { type: `eq.${type}`, owner_id: `eq.${cleanUuid(ownerId)}` };
  const sessions = await dbRequest('GET', 'app_sessions', { select: 'token', ...filters, limit: '500' });
  for (const session of sessions) {
    if (session.token !== exceptTokenHash) await dbRequest('DELETE', 'app_sessions', { token: `eq.${session.token}` }, undefined, ['Prefer: return=minimal']);
  }
  clearSessionCacheByOwner(type, ownerId);
}
```

Chamar após troca, redefinição e desativação. No fluxo que cria sessão nova após redefinir, revogar antigas primeiro e criar a nova depois.

- [ ] **Step 4: Tornar cookie seguro por ambiente**

Definir `APP_ENV=production` em `.env.production.example`. `sessionCookie` deve incluir `Secure` quando `APP_ENV === 'production'`, independentemente de `COOKIE_SECURE=false`, e manter `HttpOnly; SameSite=Lax; Path=/`.

- [ ] **Step 5: Executar regressão**

Run: `npm run test:security-hardening && npm run test:flows && npm run test:trial`

Expected: PASS; sessões antigas falham e a sessão nova funciona.

- [ ] **Step 6: Commit**

```bash
git add server.js .env.example .env.production.example scripts/security-hardening-smoke.mjs
git commit -m "fix: revoke sessions after credential changes"
```

### Task 5: Remover token de pagamento da URL

**Files:**
- Modify: `server.js:330-350` e funções de criação/consulta de pagamento
- Modify: `public/app.js:1400-1420,1590-1620`
- Modify: `public/payment.js`
- Modify: `scripts/sql-injection-tests.mjs`
- Modify: `scripts/security-hardening-smoke.mjs`

**Interfaces:**
- Consumes: token de pagamento já aleatório e hash `payment_access_token_hash` existente.
- Produces: cookie `payment_access` `HttpOnly`, vinculado a código+token em valor assinado, e `paymentAccessFromRequest(req, code)`.

- [ ] **Step 1: Escrever teste do novo contrato**

```js
const created = await createSyntheticPaymentOrder();
assert.doesNotMatch(created.checkoutUrl, /token=/i);
assert.equal(created.body.order.payment_access_token, undefined);
assert.match(created.setCookie, /payment_access=/);

const withoutCookie = await request(`/api/payments/order?code=${created.code}`);
assert.equal(withoutCookie.response.status, 403);
const withCookie = await request(`/api/payments/order?code=${created.code}`, { headers: { Cookie: created.cookie } });
assert.equal(withCookie.response.status, 200);
```

Adicionar caso com cookie do pedido A consultando código B e esperar `403`.

- [ ] **Step 2: Rodar e confirmar RED**

Run: `npm run test:security-hardening`

Expected: FAIL porque o contrato atual usa `?token=` e retorna token ao JavaScript.

- [ ] **Step 3: Criar cookie assinado e restrito**

```js
function paymentAccessCookie(code, token) {
  const payload = Buffer.from(JSON.stringify({ code, token })).toString('base64url');
  const signature = createHmac('sha256', paymentCookieSecret()).update(payload).digest('base64url');
  return `payment_access=${payload}.${signature}; Path=/api/payments; HttpOnly; SameSite=Lax; Max-Age=3600${secureCookieSuffix()}`;
}
```

Validar assinatura com `timingSafeEqual`, código exato e expiração do token no banco. Usar segredo dedicado `PAYMENT_COOKIE_SECRET`, obrigatório em produção.

- [ ] **Step 4: Alterar criação e consulta**

Na criação do pedido, enviar `Set-Cookie` e remover `payment_access_token` do JSON público. Em `/api/payments/order`, ignorar definitivamente `url.searchParams.get('token')` e obter acesso somente do cookie assinado.

- [ ] **Step 5: Remover token do frontend**

Abrir `/pagamento?pedido=<codigo>` sem token. `payment.js` chamará `/api/payments/order?code=<codigo>` com `credentials: 'same-origin'`. Remover toda gravação, leitura e montagem de `token=`.

- [ ] **Step 6: Executar regressão**

Run: `npm run test:security-hardening && npm run test:security && npm run test:payments`

Expected: PASS; grep abaixo não encontra token de pagamento em URL:

Run: `rg -n "payments/order.*token=|pagamento.*token=" server.js public scripts`

Expected: nenhum resultado.

- [ ] **Step 7: Commit**

```bash
git add server.js public/app.js public/payment.js scripts/sql-injection-tests.mjs scripts/security-hardening-smoke.mjs
git commit -m "fix: move payment access token out of URLs"
```

### Task 6: Minimizar respostas e sanitizar logs

**Files:**
- Create: `src/lib/security-redaction.js`
- Modify: `server.js:14060-14110,20519-20640`
- Modify: `scripts/security-hardening-smoke.mjs`

**Interfaces:**
- Consumes: objetos retornados pelo banco e erros internos.
- Produces: `redactSensitive(value)`, `assertSafePublicPayload(value)` em testes e DTOs explícitos.

- [ ] **Step 1: Criar testes de campos proibidos**

```js
const forbidden = /password|password_hash|token|secret|authorization|document/i;
function assertSafePayload(value) {
  for (const key of Object.keys(value || {})) assert.equal(forbidden.test(key), false, `campo proibido: ${key}`);
}
assertSafePayload(login.body.admin);
assertSafePayload(customerMe.body.customer);
```

Capturar stderr do servidor durante erro sintético e confirmar ausência dos valores sentinela `senha-secreta`, `token-secreto` e CPF sintético.

- [ ] **Step 2: Rodar e confirmar RED**

Run: `npm run test:security-hardening`

Expected: qualquer resposta/log inseguro falha indicando somente o nome do campo, nunca o valor.

- [ ] **Step 3: Implementar redator central**

```js
const BLOCKED_KEY_PARTS = ['password','token','secret','authorization','cookie','document'];
export function redactSensitive(value, depth = 0) {
  if (depth > 5) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactSensitive(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    BLOCKED_KEY_PARTS.some((part) => key.toLowerCase().includes(part)) ? '[redacted]' : redactSensitive(item, depth + 1)
  ]));
}
```

Usar o redator em auditoria, erros e logs operacionais. DTOs públicos continuarão sendo allowlists, não redaction lists.

- [ ] **Step 4: Rastrear `select: '*'` até a resposta**

Para cada rota de autenticação, conta, pagamento e Central que retorna uma linha completa, substituir a serialização por `publicAdmin`, `publicCustomer`, `publicStore`, `publicOrderPayment` ou novo DTO local explícito.

- [ ] **Step 5: Executar regressão**

Run: `npm run test:security-hardening && npm run test:platform-health && npm run test:flows`

Expected: PASS sem valor sensível no stdout/stderr.

- [ ] **Step 6: Commit**

```bash
git add src/lib/security-redaction.js server.js scripts/security-hardening-smoke.mjs
git commit -m "fix: minimize API data and redact logs"
```

### Task 7: Allowlist de origem e cabeçalhos de segurança

**Files:**
- Create: `src/lib/security-http.js`
- Modify: `server.js:110-220,16323-16365,20603-20635`
- Modify: `.env.example`
- Modify: `.env.production.example`
- Modify: `scripts/security-hardening-smoke.mjs`

**Interfaces:**
- Consumes: `ALLOWED_ORIGINS`, método, `Origin`, `Referer` e `Sec-Fetch-Site`.
- Produces: `allowedOrigins(env)`, `corsHeaders(req, routePolicy)`, `assertAuthenticatedOrigin(req)` e `securityHeaders(options)`.

- [ ] **Step 1: Testar origens e clickjacking**

```js
const hostile = await request('/api/admin/me', { method: 'POST', headers: { Origin: 'https://evil.example', Cookie: adminCookie } });
assert.equal(hostile.response.status, 403);
assert.equal(hostile.response.headers.get('access-control-allow-origin'), null);

const preflight = await request('/api/health', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
assert.equal(preflight.response.headers.get('access-control-allow-origin'), null);

const html = await fetch(`${baseUrl}/admin`);
assert.equal(html.headers.get('x-frame-options'), 'DENY');
assert.match(html.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
```

Adicionar origem autorizada exata e confirmar que não há correspondência por sufixo (`evil-taprontomenu.com.br`).

- [ ] **Step 2: Rodar e confirmar RED**

Run: `npm run test:security-hardening`

Expected: pelo menos o caso de allowlist/preflight falha porque não existe política explícita reutilizável.

- [ ] **Step 3: Implementar allowlist exata**

```js
export function allowedOrigins(value = '') {
  return new Set(String(value).split(',').map((item) => item.trim()).filter(Boolean).map((item) => new URL(item).origin.toLowerCase()));
}
```

Não adicionar o `Host` recebido à allowlist. Configurar em produção os hosts oficiais da home, painel e Central. CORS permanece desativado por padrão; somente rotas declaradas retornam headers.

- [ ] **Step 4: Consolidar cabeçalhos**

Mover `securityHeaders` para o módulo e aplicar também a redirects, HTML, JSON, uploads e erros. HSTS será emitido somente se `APP_ENV=production` ou a requisição confiável indicar HTTPS.

- [ ] **Step 5: Executar regressão**

Run: `npm run test:security-hardening && npm run test:seo && npm run test:flows`

Expected: PASS para origem exata, origem hostil, clickjacking e fluxos normais.

- [ ] **Step 6: Commit**

```bash
git add src/lib/security-http.js server.js .env.example .env.production.example scripts/security-hardening-smoke.mjs
git commit -m "fix: enforce explicit origins and security headers"
```

### Task 8: Matriz de SQL Injection e IDOR multi-tenant

**Files:**
- Create: `scripts/idor-security-smoke.mjs`
- Modify: `scripts/sql-injection-tests.mjs`
- Modify: `server.js` somente nos handlers em que o teste provar falha
- Modify: `package.json`

**Interfaces:**
- Consumes: dois tenants, duas lojas, dois administradores e dois clientes inteiramente sintéticos.
- Produces: `npm run test:idor` e evidência de isolamento para leitura/escrita.

- [ ] **Step 1: Criar fixture transacional de dois tenants**

```js
await client.query('begin');
const suffix = randomBytes(6).toString('hex');
// Insira companyA/companyB, storeA/storeB, adminA/adminB, customerA/customerB e recursos A/B.
// Em finally: await client.query('rollback').
```

- [ ] **Step 2: Escrever matriz IDOR inicialmente vermelha onde houver falha**

Para cada família abaixo, autenticar como A e usar UUID de B em GET/PATCH/DELETE; esperar `404`:

- endereços de cliente;
- pedidos de cliente;
- produtos, categorias e modificadores;
- usuários administrativos e acessos a lojas;
- cupons, promoções e mesas;
- tickets de suporte;
- detalhes de empresa/loja fora da Central.

Exemplo:

```js
const response = await request(`/api/customer/addresses/${fixture.addressB}`, {
  method: 'DELETE', headers: { Cookie: fixture.customerCookieA }
});
assert.equal(response.status, 404);
assert.equal(await resourceStillExists(fixture.addressB), true);
```

- [ ] **Step 3: Ampliar SQL Injection**

Adicionar payloads nos filtros de busca, ordenação, paginação e UUIDs. Todos devem retornar `400`, `404` ou `422`, nunca `500`, e nenhuma tabela deve sofrer alteração além da transação sintética.

- [ ] **Step 4: Rodar e confirmar RED**

Run: `node scripts/idor-security-smoke.mjs && node scripts/sql-injection-tests.mjs`

Expected: IDOR falho indica rota e operação, sem imprimir UUID real ou conteúdo do recurso.

- [ ] **Step 5: Corrigir cada handler vulnerável isoladamente**

Padrão obrigatório:

```js
const result = await dbRequest('PATCH', 'resource', {
  id: `eq.${cleanUuid(resourceId)}`,
  store_id: `eq.${cleanUuid(admin.store_id)}`,
  company_id: `eq.${cleanUuid(admin.company_id)}`
}, payload, ['Prefer: return=representation']);
if (!result[0]) throw httpError(404, 'Recurso não encontrado.');
```

Não consultar primeiro apenas por ID. Não retornar `403` diferente para recurso de outro tenant.

- [ ] **Step 6: Executar matriz completa**

Run: `npm run test:idor && npm run test:security && npm run test:security-hardening`

Expected: PASS; rollback confirmado e nenhum dado sintético restante.

- [ ] **Step 7: Commit**

```bash
git add package.json scripts/idor-security-smoke.mjs scripts/sql-injection-tests.mjs server.js
git commit -m "fix: enforce tenant ownership across resources"
```

### Task 9: Relatório local e verificação final

**Files:**
- Create: `docs/security/2026-09-22-defensive-audit-report.md`
- Modify: somente testes quebrados por incompatibilidade comprovadamente introduzida neste plano

**Interfaces:**
- Consumes: resultados de todas as tarefas e `git diff`.
- Produces: relatório solicitado, sem segredos, e pacote pronto para revisão — não para deploy automático.

- [ ] **Step 1: Executar verificações completas**

```bash
npm run test:syntax
npm run test:security-hardening
npm run test:security
npm run test:idor
npm run test:payments
npm run test:flows
npm run test:platform-health
npm run test:all
git diff --check
```

Registrar comandos, horário, exit code e falhas preexistentes separadamente. Não declarar a suíte verde se qualquer comando falhar.

- [ ] **Step 2: Fazer varredura estática final**

```bash
rg -n "payments/order.*token=|pagamento.*token=|Access-Control-Allow-Origin.*origin|password_hash.*json|localStorage.*token|sessionStorage.*token" server.js public src
rg -n "query\(`[^`]*\$\{" server.js src scripts
```

Classificar cada resultado como corrigido, seguro por construção ou risco restante.

- [ ] **Step 3: Escrever o relatório**

Para cada uma das sete categorias, incluir:

```markdown
## Vulnerabilidade
- Severidade:
- Estado: confirmada / não reproduzida / já protegida / corrigida localmente
- Arquivo e trecho:
- Evidência segura:
- Causa-raiz:
- Correção:
- Testes e resultados:
- Riscos restantes:
- Migração/configuração/reinício:
```

- [ ] **Step 4: Revisar diff e confirmar ausência de produção**

Run: `git status --short && git log -10 --oneline`

Expected: apenas arquivos locais/commits planejados; nenhum script de deploy executado e nenhuma alteração remota.

- [ ] **Step 5: Commit**

```bash
git add docs/security/2026-09-22-defensive-audit-report.md
git commit -m "docs: report defensive security audit"
```

- [ ] **Step 6: Entregar para revisão**

Apresentar o relatório, os testes e riscos restantes. Pedir autorização separada caso o usuário queira preparar ou aplicar uma implantação em produção.
