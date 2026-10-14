# Production Outreach Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar uma release reproduzível que preserve o estado funcional do servidor público, complete o outreach e instale o worker desativado na VM.

**Architecture:** Uma branch limpa parte do `origin/main`, recebe somente mudanças funcionais e reconcilia explicitamente os arquivos em que produção está à frente da branch local. O servidor público recebe um manifesto versionado e a VM recebe um pacote independente, inicialmente desativado e sem alterar a Evolution existente.

**Tech Stack:** Node.js 22, PostgreSQL, Docker Compose, Chromium, Evolution API v2, systemd, Git e PowerShell/SSH.

**Spec:** `docs/superpowers/specs/2026-10-14-production-outreach-consolidation-design.md`

## Global Constraints

- Preservar cadastro assistido, suporte administrativo, segurança e demais mudanças exclusivas do servidor.
- Nunca versionar nem imprimir `.env`, credenciais, chaves de recuperação, uploads privados ou backups.
- Não transportar os três objetos `.tar.gz` maiores que 100 MB para a nova branch.
- O worker nasce com `OUTREACH_AUTOMATION_ENABLED=false`.
- Não expor o PostgreSQL publicamente.
- Não alterar nem reiniciar os containers existentes da Evolution.
- Criar backups antes de substituir arquivos ou executar migrações.

## Review Focus

- Um arquivo exclusivo de produção não pode ser silenciosamente substituído por uma versão local mais antiga.
- A release não pode conter segredos, pacotes recursivos, backups ou artefatos manuais.
- O adaptador Evolution deve aceitar URL ou base64, rejeitando as duas origens juntas e base64 inválido.
- Falta de banco, Google, webhook ou Evolution deve manter o worker desativado sem disparos parciais.
- Rollback do worker não pode interromper nem recriar a Evolution.

---

## Execution Setup

- Buscar `origin/main` e registrar seu SHA sem modificar a branch compartilhada.
- Criar um worktree isolado na branch `release/production-outreach-20261014`, partindo de `origin/main`.
- Levar para a branch limpa esta especificação, este plano e somente os commits/arquivos funcionais aprovados; o commit `c0cb30b` não será ancestral da nova branch.
- Capturar os arquivos do servidor público em diretório temporário somente de leitura e apagar a captura depois da reconciliação.
- Antes da Task 1, confirmar que nenhum arquivo real de ambiente ou segredo está no índice do novo worktree.

---

### Task 1: Branch limpa e manifesto seguro

**Files:**
- Create: `scripts/production-release-manifest.mjs`
- Create: `scripts/production-release-manifest-smoke.mjs`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**
- Consumes: lista de arquivos rastreados da branch consolidada.
- Produces: `buildProductionReleaseManifest({ rootDir }) -> { files, rejected }` e comando que falha quando encontra conteúdo proibido.

- [ ] **Step 1: Escrever o teste que exige exclusão de `.env`, `.deploy`, backups, chaves, uploads privados e artefatos temporários**

- [ ] **Step 2: Executar o teste**

Run: `node scripts/production-release-manifest-smoke.mjs`
Expected: FAIL porque o gerador ainda não existe.

- [ ] **Step 3: Implementar o gerador do manifesto e as regras de `.gitignore`**

O manifesto deve aceitar apenas arquivos necessários de aplicação, migração, assets e operação; qualquer caminho sensível reconhecido entra em `rejected` e faz o comando terminar com erro.

- [ ] **Step 4: Executar o teste e a verificação de objetos grandes**

Run: `node scripts/production-release-manifest-smoke.mjs && git rev-list --objects HEAD | git cat-file --batch-check="%(objecttype) %(objectname) %(objectsize) %(rest)"`
Expected: teste PASS e nenhum blob alcançável da nova branch acima de 100 MB.

- [ ] **Step 5: Commit**

```bash
git add .gitignore package.json scripts/production-release-manifest.mjs scripts/production-release-manifest-smoke.mjs
git commit -m "build: create safe production release manifest"
```

### Task 2: Consolidação funcional e regressão do outreach

**Files:**
- Modify: `server.js`
- Modify: `src/lib/evolution-v2-sales.js`
- Modify: `scripts/sales-automation.mjs`
- Modify: `scripts/evolution-v2-sales-smoke.mjs`
- Modify: `public/platform.html`
- Modify: `public/platform.js`
- Modify: `public/platform.css`
- Modify: `public/platform-assisted-registration.js`
- Modify: `prisma/schema.prisma`
- Create/Modify: arquivos `src/lib/outreach-*.js`, `scripts/outreach-worker.mjs`, `public/platform-outreach.js` e migração do outreach.

**Interfaces:**
- Consumes: estado funcional capturado do servidor e implementação local do outreach.
- Produces: backend e frontend consolidados; `sendEvolutionV2SalesMedia({ phone, mediaUrl?, mediaBase64?, mimeType, caption? })`; worker idempotente.

- [ ] **Step 1: Acrescentar regressão que falha quando mídia base64 não é enviada e quando URL e base64 são aceitas simultaneamente**

- [ ] **Step 2: Executar a regressão contra a versão consolidada inicial**

Run: `node scripts/evolution-v2-sales-smoke.mjs`
Expected: FAIL na expectativa de base64.

- [ ] **Step 3: Reconciliar arquivos centrais preservando os blocos exclusivos de produção e aplicar os componentes completos do outreach**

O `server.js` final deve conter as rotas e métricas do outreach e também o handoff seguro de suporte, proteção de arquivos ocultos, cadastro assistido mais novo e templates operacionais existentes no servidor.

- [ ] **Step 4: Executar testes do outreach, segurança e interfaces afetadas**

Run: `node --check server.js && node --check scripts/outreach-worker.mjs && node scripts/evolution-v2-sales-smoke.mjs && node scripts/outreach-google-smoke.mjs && node scripts/outreach-qualification-smoke.mjs && node scripts/outreach-preview-smoke.mjs && node scripts/outreach-delivery-smoke.mjs && node scripts/outreach-orchestrator-smoke.mjs && node scripts/outreach-metrics-smoke.mjs && node scripts/platform-outreach-metrics-smoke.mjs && node scripts/sales-automation-smoke.mjs && node scripts/security-hardening-smoke.mjs && node scripts/assisted-registration-ui-smoke.mjs`
Expected: todos terminam com código 0.

- [ ] **Step 5: Commit**

```bash
git add server.js src scripts public prisma package.json package-lock.json
git commit -m "release: consolidate production outreach runtime"
```

### Task 3: Pacote e publicação do servidor público

**Files:**
- Create: `deploy/production-outreach-release.sh`
- Create: `scripts/production-outreach-release-smoke.mjs`
- Modify: `docs/operations/automated-outreach.md`

**Interfaces:**
- Consumes: manifesto seguro da Task 1 e runtime consolidado da Task 2.
- Produces: pacote versionado, backup verificável, migração aplicada e `cardapio.service` saudável.

- [ ] **Step 1: Escrever teste do script de deploy exigindo backup, validação de checksum, migração, sintaxe, restart e health check**

- [ ] **Step 2: Executar o teste**

Run: `node scripts/production-outreach-release-smoke.mjs`
Expected: FAIL porque o script ainda não existe.

- [ ] **Step 3: Implementar script idempotente e gerar pacote somente pelo manifesto**

- [ ] **Step 4: Executar testes, criar backup remoto, publicar e validar**

Run local: `node scripts/production-release-manifest-smoke.mjs && node scripts/production-outreach-release-smoke.mjs`

Run remoto: `node --check server.js && npm run db:schema && sudo systemctl restart cardapio.service && curl -fsS https://taprontomenu.com.br/api/health`

Expected: testes locais PASS, migração sem erro, serviço `active` e saúde `{"ok":true}`.

- [ ] **Step 5: Commit e push da branch limpa**

```bash
git add deploy/production-outreach-release.sh scripts/production-outreach-release-smoke.mjs docs/operations/automated-outreach.md
git commit -m "ops: make outreach production release reproducible"
git push -u origin <clean-release-branch>
```

### Task 4: Instalação segura do worker na VM

**Files:**
- Create: `deploy/systemd/tapronto-outreach-tunnel.service`
- Create: `deploy/systemd/tapronto-outreach.service`
- Create: `scripts/outreach-vm-deployment-smoke.mjs`
- Modify: `Dockerfile.outreach`
- Modify: `docs/operations/automated-outreach.md`

**Interfaces:**
- Consumes: banco por túnel restrito, Evolution local e pacote consolidado.
- Produces: `/opt/tapronto-outreach`, container não-root instalado e desativado até validação completa.

- [ ] **Step 1: Escrever teste das unidades e configuração exigindo dependência do túnel, isolamento da Evolution e automação desativada por padrão**

- [ ] **Step 2: Executar o teste**

Run: `node scripts/outreach-vm-deployment-smoke.mjs`
Expected: FAIL porque as unidades ainda não existem.

- [ ] **Step 3: Implementar unidades, pacote da VM e documentação de segredos sem valores reais**

- [ ] **Step 4: Executar testes, instalar na VM e validar sem disparar**

Run local: `node scripts/outreach-vm-deployment-smoke.mjs`

Run VM: `docker compose config && systemctl is-active tapronto-outreach-tunnel.service && node scripts/outreach-worker.mjs status`

Expected: configuração válida, túnel ativo, Evolution conectada e `enabled: false`; nenhuma mensagem enviada.

- [ ] **Step 5: Commit final**

```bash
git add Dockerfile.outreach deploy/systemd scripts/outreach-vm-deployment-smoke.mjs docs/operations/automated-outreach.md
git commit -m "ops: install disabled outreach worker on lan vm"
```

### Task 5: Verificação final e evidências

**Files:**
- Modify: somente correções exigidas por testes ou revisão.

**Interfaces:**
- Consumes: branch publicada, servidor público e VM.
- Produces: evidência de saúde, ausência de blobs grandes, ausência de segredos e worker desativado.

- [ ] **Step 1: Executar a suíte completa com banco configurado ou registrar precisamente qualquer dependência externa indisponível**

Run: `npm run test:all`
Expected: código 0 em ambiente com `DATABASE_URL`.

- [ ] **Step 2: Verificar Git e produção**

Run: `git status --short && git ls-remote --heads origin <clean-release-branch>`
Expected: nenhum arquivo da release pendente e branch remota presente.

Run público: `systemctl is-active cardapio.service && curl -fsS https://taprontomenu.com.br/api/health`
Expected: `active` e `{"ok":true}`.

Run VM: `systemctl is-active tapronto-outreach-tunnel.service; systemctl is-enabled tapronto-outreach.service; node scripts/outreach-worker.mjs status`
Expected: túnel ativo, worker instalado sem disparos e automação desativada.

- [ ] **Step 3: Revisar o diff completo, corrigir achados importantes e registrar evidências finais**
