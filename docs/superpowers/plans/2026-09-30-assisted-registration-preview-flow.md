# Assisted Registration Preview Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar a criação da prévia da conclusão do cadastro assistido, permitindo revisar a loja no painel antes de enviar o acesso ao cliente.

**Architecture:** O domínio do cadastro assistido passa a controlar explicitamente prévia, revisão e conclusão. Uploads privados recebem uma finalidade e fotos de produto só são promovidas após associação confirmada; a criação da loja permanece transacional e idempotente, enquanto o envio do e-mail vira uma operação posterior e repetível com segurança.

**Tech Stack:** Node.js ESM, PostgreSQL/Prisma migrations, HTML/CSS/JavaScript nativo, Sharp, OpenAI Responses API, SMTP existente e scripts smoke em Node.js.

**Spec:** `docs/superpowers/specs/2026-09-30-assisted-registration-preview-flow-design.md`

## Global Constraints

- Não criar CRM nem automação comercial complexa.
- O trial gratuito dura sete dias e começa somente quando o cliente cria a senha.
- Criar a prévia não envia e-mail e não cria token de ativação.
- Arquivos de origem permanecem privados; somente mídias confirmadas podem se tornar públicas.
- Controles reutilizam os modelos `payment_methods` e `business_hours` já aceitos pelo app.
- Repetir criação de prévia ou conclusão deve ser idempotente.
- Pedidos reais permanecem bloqueados enquanto o cadastro estiver em prévia.
- Acesso do Admin Master ao painel é temporário, limitado à loja e auditado.
- Não adicionar dependências de frontend nem um framework novo.
- Preservar cadastros já publicados ou ativados durante a migração.

## Review Focus

- Reenvio ou clique duplo durante operações lentas deve devolver o mesmo resultado sem duplicar empresa, loja, token ou e-mail; coberto nas Tasks 5 e 7.
- Uma interpretação nova sobre rascunho corrigido deve exigir escolha explícita entre substituir e acrescentar; coberto na Task 3.
- Imagens ambíguas, duplicadas ou sem produto compatível nunca podem ser publicadas automaticamente; coberto na Task 4.
- Horários fechados, virada de dia e campos incompletos devem manter o mesmo objeto usado pelo painel; coberto na Task 2.
- Falha após criação parcial, SMTP indisponível ou retorno da sessão temporária deve preservar um estado recuperável; coberto nas Tasks 5, 6 e 7.

---

### Task 1: Estados e persistência do fluxo de prévia

**Files:**
- Create: `prisma/migrations/20260930190000_assisted_registration_preview_flow/migration.sql`
- Create: `src/lib/assisted-registration-workflow.js`
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/assisted-registration.js`
- Modify: `src/lib/assisted-registration-store.js`
- Modify: `scripts/assisted-registration-domain-test.mjs`
- Create: `scripts/assisted-registration-workflow-test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `ASSISTED_REGISTRATION_STATUSES: readonly string[]`.
- Produces: `assertAssistedTransition(currentStatus, nextStatus): true`.
- Produces: `publicAssistedRegistration(row)` com `preview_created_at`, `preview_reviewed_at`, `preview_menu_version` e códigos seguros de falha.
- Produces: finalidade de arquivo `menu_source | product_photo | store_logo | store_cover` e tabela de associações de fotos.

- [ ] **Step 1: Escrever os testes que falham para estados, transições e serialização**

Adicionar casos que exijam a sequência `reviewing_menu → ready_for_preview → preview_created → preview_reviewed → published → activated`, rejeitem saltos inválidos e confirmem que campos internos ou tokens não são serializados.

- [ ] **Step 2: Executar os testes e confirmar a falha esperada**

Run: `node scripts/assisted-registration-workflow-test.mjs && node scripts/assisted-registration-domain-test.mjs`

Expected: FAIL porque os novos estados, campos e funções ainda não existem.

- [ ] **Step 3: Criar a migração compatível com dados existentes**

Adicionar os valores `interpreting_menu`, `ready_for_preview`, `preview_created` e `preview_reviewed`; adicionar timestamps/versão de prévia, finalidade dos arquivos, código seguro da última falha e a tabela `assisted_product_photo_links` com FKs, estado da sugestão e unicidade por arquivo.

- [ ] **Step 4: Implementar as regras de transição e apresentação pública**

Centralizar a máquina de estados em `src/lib/assisted-registration-workflow.js` e fazer store/serialização consumirem essa fonte, preservando os estados antigos válidos.

- [ ] **Step 5: Executar testes da tarefa**

Run: `node scripts/assisted-registration-workflow-test.mjs && node scripts/assisted-registration-domain-test.mjs && npx prisma validate`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260930190000_assisted_registration_preview_flow src/lib/assisted-registration-workflow.js src/lib/assisted-registration.js src/lib/assisted-registration-store.js scripts/assisted-registration-workflow-test.mjs scripts/assisted-registration-domain-test.mjs package.json
git commit -m "feat: add assisted preview workflow states"
```

### Task 2: Pagamentos, atendimento e funcionamento reutilizáveis

**Files:**
- Create: `src/lib/store-operation-settings.js`
- Modify: `src/lib/assisted-registration.js`
- Modify: `public/platform.html`
- Modify: `public/platform-assisted-registration.js`
- Modify: `public/platform.css`
- Create: `scripts/store-operation-settings-test.mjs`
- Modify: `scripts/assisted-registration-ui-smoke.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `sanitizePaymentMethods(input): string[]`.
- Produces: `sanitizeBusinessHours(input): Record<DayKey, {open:string, close:string, closed:boolean}>`.
- Produces: `sanitizeFulfillmentMethods(input): ('delivery'|'pickup'|'counter')[]`.
- Consome os mesmos nomes e valores de `public/admin.html` e `store_settings`.

- [ ] **Step 1: Escrever testes que falham para pagamentos, horários e atendimento**

Cobrir sete dias, dias fechados, horários incompletos, abertura/fechamento inválidos, deduplicação de pagamentos e seleção combinada de atendimento.

- [ ] **Step 2: Executar os testes e observar a falha**

Run: `node scripts/store-operation-settings-test.mjs && node scripts/assisted-registration-ui-smoke.mjs`

Expected: FAIL porque os sanitizadores e controles ainda não existem.

- [ ] **Step 3: Implementar o módulo compartilhado de configurações**

Usar as chaves `monday` a `sunday`, formato `HH:mm`, os seis pagamentos do spec e lista complementar limitada/sanitizada.

- [ ] **Step 4: Substituir campos livres na Central**

Renderizar checkboxes nativos estilizados como botões para pagamento e atendimento e a grade de horários equivalente a `#businessHoursGrid`; salvar diretamente os objetos tipados em `answers.operation`.

- [ ] **Step 5: Ajustar acessibilidade e responsividade dos controles**

Garantir labels clicáveis, foco visível, estado selecionado não dependente apenas de cor, alvos de 44 px e uma coluna em telas estreitas.

- [ ] **Step 6: Executar testes da tarefa**

Run: `node scripts/store-operation-settings-test.mjs && node scripts/assisted-registration-ui-smoke.mjs && node --check public/platform-assisted-registration.js`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/store-operation-settings.js src/lib/assisted-registration.js public/platform.html public/platform-assisted-registration.js public/platform.css scripts/store-operation-settings-test.mjs scripts/assisted-registration-ui-smoke.mjs package.json
git commit -m "feat: align assisted operation settings with app"
```

### Task 3: Upload confiável e interpretação observável

**Files:**
- Modify: `src/lib/assisted-registration-files.js`
- Modify: `src/lib/assisted-menu-import.js`
- Create: `src/lib/assisted-menu-import-run.js`
- Modify: `server.js`
- Modify: `public/platform-assisted-registration.js`
- Modify: `public/platform.html`
- Modify: `public/platform.css`
- Modify: `scripts/assisted-menu-import-test.mjs`
- Modify: `scripts/assisted-registration-api-smoke.mjs`
- Modify: `scripts/assisted-registration-ui-smoke.mjs`

**Interfaces:**
- Produces: `createImportRun(pool, registrationId, { mode, text, actorId }): ImportRun` onde `mode` é `replace | append`.
- Produces: `executeImportRun(runId): Promise<MenuDraft>` com estados `queued | processing | completed | failed`.
- Produces: endpoints de consulta do estado e resultado da execução.
- Consome finalidade `menu_source` da Task 1.

- [ ] **Step 1: Escrever testes que falham para upload e execução da interpretação**

Cobrir upload com finalidade, zero fontes, fonte válida, provider ausente, erro da IA, retorno inválido, sucesso, retry, substituição e acréscimo sem apagar correções silenciosamente.

- [ ] **Step 2: Executar os testes e confirmar a falha**

Run: `node scripts/assisted-menu-import-test.mjs && node scripts/assisted-registration-api-smoke.mjs && node scripts/assisted-registration-ui-smoke.mjs`

Expected: FAIL nos novos estados e endpoints.

- [ ] **Step 3: Persistir e executar importações com status explícito**

Criar a execução antes de chamar PDF/planilha/visão, atualizar `interpreting_menu`, armazenar somente código/mensagem segura de erro e finalizar em `reviewing_menu` com contagens de categorias/produtos.

- [ ] **Step 4: Implementar semântica de substituir ou acrescentar**

`replace` cria a nova base; `append` combina categorias por nome sem modificar itens já corrigidos, anexando somente novos candidatos marcados para revisão quando houver conflito.

- [ ] **Step 5: Implementar feedback completo na Central**

Mostrar progresso de upload por arquivo, lista persistida, estado da interpretação, contagens, falha acionável e retry. Desabilitar o botão quando não houver fonte e exigir escolha de modo quando já existir rascunho.

- [ ] **Step 6: Executar testes da tarefa**

Run: `node scripts/assisted-menu-import-test.mjs && node scripts/assisted-registration-api-smoke.mjs && node scripts/assisted-registration-ui-smoke.mjs && node --check server.js`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/assisted-registration-files.js src/lib/assisted-menu-import.js src/lib/assisted-menu-import-run.js server.js public/platform-assisted-registration.js public/platform.html public/platform.css scripts/assisted-menu-import-test.mjs scripts/assisted-registration-api-smoke.mjs scripts/assisted-registration-ui-smoke.mjs
git commit -m "feat: make assisted menu import observable"
```

### Task 4: Fotos de produtos e identidade da loja

**Files:**
- Create: `src/lib/assisted-media-association.js`
- Modify: `src/lib/assisted-registration-files.js`
- Modify: `src/lib/assisted-menu-review.js`
- Modify: `server.js`
- Modify: `public/platform.html`
- Modify: `public/platform-assisted-registration.js`
- Modify: `public/platform.css`
- Create: `scripts/assisted-media-association-test.mjs`
- Modify: `scripts/assisted-registration-api-smoke.mjs`
- Modify: `scripts/assisted-registration-ui-smoke.mjs`

**Interfaces:**
- Produces: `suggestProductPhotoLinks({ files, draft }): SuggestedPhotoLink[]`.
- Produces: `confirmProductPhotoLink(pool, registrationId, fileId, draftItemId | null, actorId): ConfirmedPhotoLink`.
- Produces: logo/capa únicos por cadastro e associações de produto explicitamente confirmadas.
- Consome IDs estáveis do rascunho e finalidades da Task 1.

- [ ] **Step 1: Escrever testes que falham para classificação e confirmação**

Cobrir nome de arquivo compatível, sugestão ambígua, imagem duplicada, ausência de candidato, troca manual, `Não usar agora`, uma foto por produto na primeira versão e substituição de logo/capa.

- [ ] **Step 2: Executar os testes e observar a falha**

Run: `node scripts/assisted-media-association-test.mjs && node scripts/assisted-registration-api-smoke.mjs`

Expected: FAIL porque as associações ainda não existem.

- [ ] **Step 3: Implementar sugestões determinísticas e persistência**

Normalizar nomes e comparar com produtos do rascunho; análise visual pode complementar a sugestão, mas nunca altera `confirmed_at` ou publica a imagem.

- [ ] **Step 4: Implementar endpoints e UI de confirmação**

Separar as três zonas de upload, mostrar miniaturas privadas, seletor de produto, dúvida/estado e ações de confirmar ou ignorar.

- [ ] **Step 5: Executar testes da tarefa**

Run: `node scripts/assisted-media-association-test.mjs && node scripts/assisted-registration-api-smoke.mjs && node scripts/assisted-registration-ui-smoke.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/assisted-media-association.js src/lib/assisted-registration-files.js src/lib/assisted-menu-review.js server.js public/platform.html public/platform-assisted-registration.js public/platform.css scripts/assisted-media-association-test.mjs scripts/assisted-registration-api-smoke.mjs scripts/assisted-registration-ui-smoke.mjs
git commit -m "feat: add assisted product media review"
```

### Task 5: Criação transacional e idempotente da prévia

**Files:**
- Refactor: `src/lib/assisted-registration-publish.js` para `src/lib/assisted-registration-preview.js`
- Modify: `server.js`
- Modify: `scripts/assisted-registration-publish-smoke.mjs`
- Modify: `scripts/assisted-registration-api-smoke.mjs`
- Modify: `scripts/assisted-registration-release-regression.mjs`

**Interfaces:**
- Produces: `createAssistedPreview(pool, registrationId, actor, options?): PreviewResult`.
- Produces: `promoteConfirmedAssistedMedia({ pool, registrationId, storeId, itemIdsByDraftId }): Promise<void>`.
- Produz loja com pedidos bloqueados, admin inativo, assinatura `pending_activation`, `email_status=not_sent` e nenhum token.
- Consome configurações da Task 2 e associações confirmadas da Task 4.

- [ ] **Step 1: Escrever testes que falham para criação de prévia**

Asserir criação completa, horários/pagamentos exatos, imagens confirmadas, nenhuma imagem ambígua, nenhum token/e-mail/trial, pedidos bloqueados, rollback injetado e repetição retornando os mesmos IDs.

- [ ] **Step 2: Executar os testes e observar a falha**

Run: `node scripts/assisted-registration-publish-smoke.mjs && node scripts/assisted-registration-release-regression.mjs`

Expected: FAIL porque publicação e envio ainda são acoplados.

- [ ] **Step 3: Extrair criação da prévia para uma transação própria**

Mover criação de empresa, loja, settings, admin, menu e assinatura; gravar `preview_created_at` e `preview_menu_version`, não criar token e não chamar SMTP.

- [ ] **Step 4: Promover somente as mídias confirmadas**

Copiar/processar logo, capa e fotos para o armazenamento público pelo pipeline existente e preencher `image_url`, `logo_url` e `cover_url` dentro da transação lógica com compensação em falha.

- [ ] **Step 5: Expor `POST /api/platform/assisted-registrations/:id/preview`**

Exigir confirmação booleana, estado `ready_for_preview` e permissão de gestão; devolver IDs seguros e links do painel/cardápio, nunca token.

- [ ] **Step 6: Executar testes da tarefa**

Run: `node scripts/assisted-registration-publish-smoke.mjs && node scripts/assisted-registration-api-smoke.mjs && node scripts/assisted-registration-release-regression.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A -- src/lib/assisted-registration-publish.js src/lib/assisted-registration-preview.js server.js scripts/assisted-registration-publish-smoke.mjs scripts/assisted-registration-api-smoke.mjs scripts/assisted-registration-release-regression.mjs
git commit -m "feat: create assisted store previews without email"
```

### Task 6: Revisão no painel com acesso temporário

**Files:**
- Create: `src/lib/assisted-preview-access.js`
- Modify: `server.js`
- Modify: `public/platform-assisted-registration.js`
- Modify: `public/platform.html`
- Modify: `public/admin.js`
- Create: `scripts/assisted-preview-access-smoke.mjs`
- Modify: `scripts/assisted-registration-ui-smoke.mjs`

**Interfaces:**
- Produces: `createAssistedPreviewAccess(pool, registrationId, platformAdmin, ttlSeconds=1800): { redirect_url, expires_at }`.
- Produces: `confirmAssistedPreviewReview(pool, registrationId, actor, menuVersion): AssistedRegistration`.
- Consome o mecanismo existente de suporte/impersonação, limitado ao `store_id` da prévia.

- [ ] **Step 1: Escrever testes que falham para acesso e revisão**

Cobrir permissão, loja correta, TTL máximo de 30 minutos, auditoria, expiração, tentativa cruzada, retorno à Central, versão alterada e confirmação válida.

- [ ] **Step 2: Executar os testes e observar a falha**

Run: `node scripts/assisted-preview-access-smoke.mjs && node scripts/assisted-registration-ui-smoke.mjs`

Expected: FAIL porque o acesso específico de prévia não existe.

- [ ] **Step 3: Implementar sessão temporária e auditada**

Usar o suporte temporário existente com escopo fixo de loja e registrar criação, uso e expiração sem expor credenciais do futuro cliente.

- [ ] **Step 4: Implementar ações da prévia na Central e no painel**

Após criar a prévia, exibir `Revisar no painel`, `Ver cardápio público` e `Voltar à Central`; no painel, mostrar aviso de prévia e manter pedidos reais bloqueados.

- [ ] **Step 5: Implementar confirmação da revisão da prévia**

Gravar `preview_reviewed_at` e a versão atual conferida; qualquer mudança posterior de menu invalida essa confirmação.

- [ ] **Step 6: Executar testes da tarefa**

Run: `node scripts/assisted-preview-access-smoke.mjs && node scripts/assisted-registration-ui-smoke.mjs && node --check public/admin.js`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/assisted-preview-access.js server.js public/platform-assisted-registration.js public/platform.html public/admin.js scripts/assisted-preview-access-smoke.mjs scripts/assisted-registration-ui-smoke.mjs
git commit -m "feat: review assisted previews in admin panel"
```

### Task 7: Conclusão, e-mail e início do trial na ativação

**Files:**
- Create: `src/lib/assisted-registration-complete.js`
- Modify: `server.js`
- Modify: `public/platform-assisted-registration.js`
- Modify: `public/platform.html`
- Modify: `scripts/assisted-registration-publish-smoke.mjs`
- Modify: `scripts/assisted-registration-api-smoke.mjs`
- Modify: `scripts/assisted-registration-ui-smoke.mjs`

**Interfaces:**
- Produces: `completeAssistedRegistration(pool, registrationId, actor): { registration, activation }`.
- Produces: endpoint `POST /api/platform/assisted-registrations/:id/complete`.
- Mantém endpoint de reenvio para `published` e usa token com validade de sete dias.
- Consome `preview_reviewed_at` e `preview_menu_version` da Task 6.

- [ ] **Step 1: Escrever testes que falham para conclusão**

Cobrir bloqueio sem prévia/revisão, cardápio alterado, primeira conclusão, clique duplo, token único, SMTP com sucesso, SMTP com falha, reenvio e ausência de trial antes da senha.

- [ ] **Step 2: Executar os testes e observar a falha**

Run: `node scripts/assisted-registration-publish-smoke.mjs && node scripts/assisted-registration-api-smoke.mjs && node scripts/assisted-registration-ui-smoke.mjs`

Expected: FAIL porque a conclusão separada ainda não existe.

- [ ] **Step 3: Implementar conclusão transacional sem duplicação**

Validar a versão revisada, cancelar tokens pendentes, criar um token de sete dias, mudar para `published` e devolver o token somente à camada interna responsável pelo e-mail.

- [ ] **Step 4: Separar persistência de conclusão do resultado SMTP**

Enviar após commit, registrar `sent` ou `failed` e código seguro; falha SMTP não remove a prévia nem inicia o trial. Reenvio gera token novo e cancela o anterior.

- [ ] **Step 5: Atualizar ações e mensagens da Central**

Trocar o botão antigo por `Concluir cadastro e enviar acesso`, explicar requisitos pendentes, mostrar resultado do envio e preservar `Reenviar e-mail` quando aplicável.

- [ ] **Step 6: Confirmar ativação existente**

Garantir que criação da senha ativa admin/empresa/loja, inicia assinatura trial por sete dias e marca cadastro `activated`, sem alterar a duração já definida.

- [ ] **Step 7: Executar testes da tarefa**

Run: `node scripts/assisted-registration-publish-smoke.mjs && node scripts/assisted-registration-api-smoke.mjs && node scripts/assisted-registration-ui-smoke.mjs && node scripts/core-flow-smoke.mjs`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/assisted-registration-complete.js server.js public/platform-assisted-registration.js public/platform.html scripts/assisted-registration-publish-smoke.mjs scripts/assisted-registration-api-smoke.mjs scripts/assisted-registration-ui-smoke.mjs
git commit -m "feat: complete assisted registration after preview"
```

### Task 8: Layout compacto, estados e validação mobile

**Files:**
- Modify: `public/platform.html`
- Modify: `public/platform-assisted-registration.js`
- Modify: `public/platform.css`
- Modify: `scripts/assisted-registration-ui-smoke.mjs`
- Create: `scripts/assisted-registration-layout-smoke.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: etapas visuais `pending | attention | complete` derivadas do estado real.
- Produces: layout de uma coluna abaixo de 760 px e ações com área mínima de 44 px.
- Consome todas as operações das Tasks 2 a 7 sem redefinir lógica de domínio.

- [ ] **Step 1: Escrever testes de estrutura e métricas de layout que falham**

Validar larguras 320, 375, 768 e desktop, ausência de overflow horizontal, alinhamento dos cards, botões de 44 px, feedback `aria-live`, conteúdo longo, muitos produtos e imagens ausentes.

- [ ] **Step 2: Executar os testes e observar a falha**

Run: `node scripts/assisted-registration-layout-smoke.mjs && node scripts/assisted-registration-ui-smoke.mjs`

Expected: FAIL nas métricas ainda não atendidas.

- [ ] **Step 3: Reorganizar o editor em etapas compactas**

Usar um container de largura consistente, cards de etapa, cabeçalho de status, rodapé de ações e componentes responsivos com grid/flex de baixa especificidade.

- [ ] **Step 4: Completar estados vazios, carregando, sucesso e erro**

Cada operação assíncrona deve controlar disabled/loading, mensagem persistente e foco no erro; ações indisponíveis informam qual requisito falta.

- [ ] **Step 5: Executar testes da tarefa**

Run: `node scripts/assisted-registration-layout-smoke.mjs && node scripts/assisted-registration-ui-smoke.mjs && node --check public/platform-assisted-registration.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/platform.html public/platform-assisted-registration.js public/platform.css scripts/assisted-registration-layout-smoke.mjs scripts/assisted-registration-ui-smoke.mjs package.json
git commit -m "feat: refine assisted registration workspace"
```

### Task 9: Migração, regressão completa e publicação controlada

**Files:**
- Modify: `docs/superpowers/specs/2026-09-30-assisted-registration-preview-flow-design.md` somente se a implementação revelar uma decisão já aprovada que precise ser registrada
- Create: `.deploy/assisted-preview-flow-<commit>.sh` local e não versionado

**Interfaces:**
- Consome todos os módulos e endpoints das Tasks 1 a 8.
- Produz migração aplicada, release verificável, backup e caminho de rollback.

- [ ] **Step 1: Executar a suíte específica completa**

Run: `node scripts/assisted-registration-workflow-test.mjs && node scripts/store-operation-settings-test.mjs && node scripts/assisted-menu-import-test.mjs && node scripts/assisted-media-association-test.mjs && node scripts/assisted-registration-publish-smoke.mjs && node scripts/assisted-preview-access-smoke.mjs && node scripts/assisted-registration-api-smoke.mjs && node scripts/assisted-registration-ui-smoke.mjs && node scripts/assisted-registration-layout-smoke.mjs`

Expected: todos PASS, sem warnings de execução.

- [ ] **Step 2: Executar a suíte geral**

Run: `npm run test:all`

Expected: exit code 0.

- [ ] **Step 3: Revisar migração e diferenças finais**

Run: `npx prisma validate && git diff --check && git status --short`

Expected: schema válido, sem whitespace errors e somente alterações planejadas.

- [ ] **Step 4: Fazer backup e publicar com checksum**

Gerar arquivo apenas com commits da feature, validar SHA-256 no servidor, executar backup PostgreSQL e backup dos arquivos substituídos antes da extração.

- [ ] **Step 5: Aplicar migração antes do reinício**

Run remoto: `cd /var/www && node --env-file=.env scripts/backup-postgres.mjs && npx prisma migrate deploy`

Expected: backup criado e migração aplicada sem erro.

- [ ] **Step 6: Reiniciar e verificar saúde**

Reiniciar `cardapio.service`, aguardar `/api/health`, confirmar serviço ativo e ausência de novos erros fatais.

- [ ] **Step 7: Executar smoke de produção sem enviar e-mail real**

Validar login da Central, abertura de cadastro existente, controles de operação, upload privado e leitura dos novos estados. Não concluir cadastro real durante o smoke.

- [ ] **Step 8: Validar o cadastro da Thaina pelo fluxo novo**

Reabrir o cadastro existente, reenviar/classificar os materiais, interpretar, revisar, criar prévia e conferir no painel. A conclusão com envio do e-mail permanece uma ação manual explícita do operador.

- [ ] **Step 9: Registrar resultado e rollback**

Documentar commit publicado, backup do banco, backup dos arquivos, migração aplicada, health check, testes executados e qualquer risco restante.
