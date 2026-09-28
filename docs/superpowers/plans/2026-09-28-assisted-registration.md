# Assisted Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um fluxo em que o lead chega pelo WhatsApp, a equipe TáPronto preenche um cadastro assistido, importa e revisa o cardápio, publica a loja e envia ao cliente um link para criar a senha e iniciar sete dias grátis.

**Architecture:** Rascunhos de atendimento ficam isolados em três novas tabelas e não criam empresa, loja ou receita antes da confirmação final. Um módulo de domínio controla estados, validação e DTOs; outro interpreta arquivos em um modelo intermediário; a publicação usa uma transação PostgreSQL idempotente e a ativação existente é estendida para iniciar o trial somente ao criar a senha.

**Tech Stack:** Node.js 24, HTTP nativo, PostgreSQL, Prisma migrations, JavaScript ES modules, HTML/CSS/JS sem framework, `pg`, `sharp`, OpenAI Responses API já configurada no projeto, `pdf-parse` e `exceljs` para documentos locais.

**Spec:** `docs/superpowers/specs/2026-09-28-assisted-registration-design.md`

## Global Constraints

- A promessa pública é “Você responde. A gente deixa tudo pronto.”
- O botão público usa “Quero que montem para mim” e abre o WhatsApp sem formulário público adicional.
- O clique não afirma associação individual entre o visitante e o telefone recebido depois.
- CPF ou CNPJ válido é obrigatório antes da publicação e deve impedir duplicidade.
- Empresa, loja, administrador e assinatura não existem durante o rascunho.
- Fotos, PDF, texto e planilha/lista são aceitos; o original permanece privado.
- O importador nunca inventa preço ou dado ausente.
- Todo cardápio exige revisão; não existe “publicar sem revisar”.
- A confirmação final publica automaticamente em uma transação idempotente.
- Os sete dias grátis começam somente na primeira criação de senha.
- Rascunhos e assinaturas pendentes não entram em clientes ativos, lojas ativas para métricas ou MRR.
- Não criar CRM, chatbot ou automação de vendas fora desse fluxo.
- Nenhum deploy em produção sem verificação completa e autorização explícita posterior.

## Review Focus

- Duas requisições simultâneas de publicação do mesmo rascunho devem produzir uma única empresa, loja e assinatura e devolver o mesmo resultado final.
- Um CPF/CNPJ já existente com pontuação diferente deve impedir nova publicação sem revelar dados para usuários sem permissão.
- PDF digital, PDF escaneado, imagem girada, CSV com vírgula decimal e XLSX com células vazias devem gerar rascunho revisável, nunca preço inventado.
- Falha SMTP depois do commit deve manter a loja publicada, registrar falha segura e permitir reenvio sem recriar a conta ou iniciar o trial.
- Token expirado, token reutilizado e duas ativações concorrentes devem iniciar exatamente um trial de sete dias.

---

### Task 1: Domínio e persistência dos cadastros assistidos

**Files:**
- Create: `prisma/migrations/20260928100000_assisted_registrations/migration.sql`
- Create: `src/lib/assisted-registration.js`
- Create: `scripts/assisted-registration-domain-test.mjs`
- Modify: `prisma/schema.prisma`
- Modify: `package.json`

**Interfaces:**
- Consumes: nenhuma interface nova.
- Produces: `ASSISTED_REGISTRATION_STATUSES`, `normalizeDocument(value)`, `validateDocument(value)`, `assertAssistedTransition(from,to)`, `sanitizeAssistedAnswers(data)`, `publicAssistedRegistration(row)`.

- [ ] **Step 1: Escrever testes de domínio inicialmente vermelhos**

Cobrir CPF e CNPJ válidos/invalidos, remoção de pontuação, transições permitidas, rejeição de salto de estado e DTO sem `document`, tokens, arquivos internos ou dados técnicos.

- [ ] **Step 2: Executar o teste e confirmar RED**

Run: `node scripts/assisted-registration-domain-test.mjs`

Expected: FAIL porque `src/lib/assisted-registration.js` ainda não existe.

- [ ] **Step 3: Criar o módulo de domínio**

Implementar exatamente as interfaces acima. Estados: `new`, `in_progress`, `awaiting_menu`, `reviewing_menu`, `ready_to_publish`, `published`, `activated`, `cancelled`. O documento público deve ser mascarado; o normalizado só pode ser usado no servidor.

- [ ] **Step 4: Criar a migração e os modelos Prisma**

Adicionar:

- `assisted_registrations`: identidade, `document_normalized`, respostas JSON, atribuição JSON, status, operador, timestamps, `publish_key`, `company_id`, `store_id`, `admin_id`, `subscription_id`, `published_at`, `activated_at`, `email_status`, `email_last_error_code`;
- `assisted_registration_files`: nome seguro, MIME, tamanho, chave privada de armazenamento, checksum e estado de processamento;
- `assisted_menu_drafts`: `schema_version`, conteúdo JSON, validação JSON, `reviewed_at`, `reviewed_by`, versão e timestamps.

Criar índices de status/atualização e índices únicos parciais para documento ativo e `publish_key`. Adicionar `pending_activation` a `SubscriptionStatus`.

- [ ] **Step 5: Validar schema e testes**

Run: `npm run prisma:generate && node scripts/assisted-registration-domain-test.mjs`

Expected: PASS para validação, estados e DTO; Prisma gera sem erro.

- [ ] **Step 6: Adicionar comandos de teste**

Adicionar `test:assisted-registration` ao `package.json` e inseri-lo em `test:all` depois de `test:security-hardening`.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260928100000_assisted_registrations src/lib/assisted-registration.js scripts/assisted-registration-domain-test.mjs package.json
git commit -m "feat: add assisted registration domain"
```

### Task 2: API de rascunhos e detecção de duplicidade

**Files:**
- Create: `src/lib/assisted-registration-store.js`
- Create: `scripts/assisted-registration-api-smoke.mjs`
- Modify: `server.js`
- Modify: `scripts/assisted-registration-domain-test.mjs`

**Interfaces:**
- Consumes: interfaces de domínio da Task 1 e `withLocalTransaction()`.
- Produces: `createAssistedRegistration(pool,data,actor)`, `listAssistedRegistrations(pool,filters)`, `getAssistedRegistration(pool,id)`, `updateAssistedRegistration(pool,id,patch,actor)`, `findAssistedDuplicates(pool,identity)`.

- [ ] **Step 1: Escrever fixture HTTP e testes vermelhos**

Criar administrador sintético da plataforma e testar:

- `POST /api/platform/assisted-registrations`;
- `GET /api/platform/assisted-registrations` com busca por telefone/nome/documento;
- `GET/PATCH /api/platform/assisted-registrations/:id`;
- autosave com `expected_version`;
- `409` em edição concorrente;
- bloqueio para administrador comum;
- duplicidade por CPF/CNPJ com e sem pontuação, telefone e e-mail.

Nenhuma asserção deve imprimir PII.

- [ ] **Step 2: Rodar e confirmar RED**

Run: `node scripts/assisted-registration-api-smoke.mjs`

Expected: FAIL com `404` nas novas rotas.

- [ ] **Step 3: Implementar o store com SQL parametrizado**

Implementar as interfaces acima usando o pool PostgreSQL e filtros parametrizados. `updateAssistedRegistration` exige versão esperada e incrementa `version` atomicamente. A busca retorna somente DTOs permitidos.

- [ ] **Step 4: Registrar rotas protegidas da Central**

Usar `requirePlatformAdmin(req,res,'platform.companies.manage')`. Validar UUIDs, limitar paginação e registrar auditoria sem documento completo.

- [ ] **Step 5: Executar testes e regressão de segurança**

Run: `node scripts/assisted-registration-api-smoke.mjs && npm run test:security-hardening && npm run test:idor`

Expected: PASS; usuário comum recebe `403`; duplicidades não geram novos rascunhos.

- [ ] **Step 6: Commit**

```bash
git add src/lib/assisted-registration-store.js scripts/assisted-registration-api-smoke.mjs scripts/assisted-registration-domain-test.mjs server.js
git commit -m "feat: add assisted registration drafts API"
```

### Task 3: CTA acolhedor e tracking do WhatsApp

**Files:**
- Modify: `public/delivery.html`
- Modify: `public/delivery.css`
- Modify: `public/delivery.js`
- Modify: `public/home.html`
- Modify: `public/home.css`
- Modify: `public/home.js`
- Modify: `scripts/delivery-landing-smoke.mjs`
- Modify: `scripts/whatsapp-cta-smoke.mjs`

**Interfaces:**
- Consumes: endpoint atual `/api/analytics/funnel` e configuração existente do WhatsApp.
- Produces: `trackWhatsappClick(placement)` no frontend e CTA consistente nas duas páginas.

- [ ] **Step 1: Atualizar testes de conteúdo e acessibilidade antes do HTML**

Exigir a promessa, botão, texto auxiliar, mensagem pronta, ícone oficial, evento `whatsapp_click`, parâmetros UTM preservados e regra `@media (prefers-reduced-motion: reduce)` que remove a animação.

- [ ] **Step 2: Rodar e confirmar RED**

Run: `node scripts/delivery-landing-smoke.mjs && node scripts/whatsapp-cta-smoke.mjs`

Expected: FAIL pela copy e pelo comportamento novos ainda ausentes.

- [ ] **Step 3: Implementar CTA e animação**

Usar exatamente:

- título: “Você responde. A gente deixa tudo pronto.”;
- botão: “Quero que montem para mim”;
- mensagem: “Olá! Quero que vocês montem meu cardápio digital. Como podemos começar?”;
- apoio: “Atendimento pelo WhatsApp · sem cartão · 7 dias grátis depois de criar sua senha”.

A animação é um pulso suave, não altera layout e respeita redução de movimento.

- [ ] **Step 4: Implementar tracking antes da navegação**

`trackWhatsappClick(placement)` envia o evento com `keepalive`, preserva atribuição e abre o WhatsApp mesmo se o tracking falhar. Não cria lead identificado nem envia telefone inexistente.

- [ ] **Step 5: Executar regressão visual/SEO**

Run: `node scripts/delivery-landing-smoke.mjs && node scripts/whatsapp-cta-smoke.mjs && npm run test:seo && npm run test:marketing`

Expected: PASS em desktop, mobile, copy, acessibilidade, tracking e SEO.

- [ ] **Step 6: Commit**

```bash
git add public/delivery.html public/delivery.css public/delivery.js public/home.html public/home.css public/home.js scripts/delivery-landing-smoke.mjs scripts/whatsapp-cta-smoke.mjs
git commit -m "feat: invite leads to assisted setup"
```

### Task 4: Upload privado e importação multiformato

**Files:**
- Create: `src/lib/assisted-menu-import.js`
- Create: `src/lib/assisted-registration-files.js`
- Create: `scripts/assisted-menu-import-test.mjs`
- Create: `scripts/fixtures/assisted-menu/menu.txt`
- Create: `scripts/fixtures/assisted-menu/menu.csv`
- Create: `scripts/fixtures/assisted-menu/menu.pdf`
- Create: `scripts/fixtures/assisted-menu/menu.xlsx`
- Modify: `server.js`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `assisted_registration_files`, `assisted_menu_drafts`, `UPLOAD_DIR`, `OPENAI_API_KEY`.
- Produces: `validateAssistedFile(input)`, `storeAssistedFile(input)`, `extractAssistedMenu({ files, text, aiRequest })`, `validateMenuDraft(draft)`.

- [ ] **Step 1: Adicionar fixtures e testes de parser inicialmente vermelhos**

Testar texto, CSV com vírgula decimal, XLSX com células vazias, PDF digital e resposta simulada do extrator visual. Confirmar que preço ausente vira `needs_review`, imagem girada chega normalizada ao adaptador e conteúdo fora do schema é rejeitado.

- [ ] **Step 2: Rodar e confirmar RED**

Run: `node scripts/assisted-menu-import-test.mjs`

Expected: FAIL porque o importador não existe.

- [ ] **Step 3: Adicionar dependências fixadas e auditar**

Adicionar versões exatas de `pdf-parse` e `exceljs`, atualizar lockfile e executar:

Run: `npm install --save-exact pdf-parse@2.4.5 exceljs@4.4.0 && npm audit --omit=dev`

Expected: lockfile determinístico; qualquer alerta novo bloqueia a tarefa até avaliação explícita.

- [ ] **Step 4: Implementar armazenamento privado**

Aceitar JPG, PNG, WebP, PDF, TXT, CSV e XLSX; validar assinatura/MIME, tamanho máximo configurável e checksum. Guardar fora da rota pública de uploads em `ASSISTED_UPLOAD_DIR`, com nome aleatório e sem caminho controlado pelo cliente.

- [ ] **Step 5: Implementar parsers e adaptador de IA**

Texto/CSV/XLSX/PDF digital usam extração local. Imagens e PDF escaneado usam um `aiRequest` injetável que chama o provider configurado e exige JSON compatível com o schema versionado. Normalizar imagens com `sharp` antes do envio. Nunca completar preço ausente.

- [ ] **Step 6: Criar rotas de arquivo/importação**

- `POST /api/platform/assisted-registrations/:id/files`;
- `POST /api/platform/assisted-registrations/:id/import`;
- `GET /api/platform/assisted-registrations/:id/menu-draft`.

Todas exigem permissão da Central, limites de corpo e pertencimento ao rascunho.

- [ ] **Step 7: Executar testes**

Run: `node scripts/assisted-menu-import-test.mjs && node scripts/assisted-registration-api-smoke.mjs && npm run test:security-hardening`

Expected: PASS para os quatro formatos, arquivo privado, ambiguidade e autorização.

- [ ] **Step 8: Commit**

```bash
git add src/lib/assisted-menu-import.js src/lib/assisted-registration-files.js scripts/assisted-menu-import-test.mjs scripts/fixtures/assisted-menu server.js package.json package-lock.json
git commit -m "feat: import assisted menus from common formats"
```

### Task 5: Revisão obrigatória do cardápio

**Files:**
- Create: `src/lib/assisted-menu-review.js`
- Modify: `server.js`
- Modify: `scripts/assisted-menu-import-test.mjs`
- Modify: `scripts/assisted-registration-api-smoke.mjs`

**Interfaces:**
- Consumes: modelo intermediário da Task 4.
- Produces: `applyMenuDraftPatch(draft,patch)`, `reviewMenuDraft(draft,actor)`, `assertMenuDraftPublishable(draft)`.

- [ ] **Step 1: Escrever testes vermelhos de edição e bloqueio**

Cobrir edição, exclusão, duplicação, movimentação entre categorias, adicionais, conflito de versão e rejeição de revisão quando há nome/preço/categoria/grupo inválido ou `needs_review` pendente.

- [ ] **Step 2: Rodar e confirmar RED**

Run: `node scripts/assisted-menu-import-test.mjs`

Expected: FAIL pelas novas interfaces ausentes.

- [ ] **Step 3: Implementar funções puras de revisão**

Toda mutação exige `expected_version`; IDs internos do rascunho são UUIDs; validação retorna erros com caminhos de campo e sem conteúdo sensível.

- [ ] **Step 4: Criar endpoints de revisão**

- `PATCH /api/platform/assisted-registrations/:id/menu-draft`;
- `POST /api/platform/assisted-registrations/:id/menu-draft/review`.

O segundo grava `reviewed_at`, `reviewed_by`, hash da versão e move para `ready_to_publish` apenas quando válido.

- [ ] **Step 5: Executar testes**

Run: `node scripts/assisted-menu-import-test.mjs && node scripts/assisted-registration-api-smoke.mjs`

Expected: PASS; não existe caminho de API que marque inválido como revisado.

- [ ] **Step 6: Commit**

```bash
git add src/lib/assisted-menu-review.js server.js scripts/assisted-menu-import-test.mjs scripts/assisted-registration-api-smoke.mjs
git commit -m "feat: require assisted menu review"
```

### Task 6: Publicação transacional e idempotente

**Files:**
- Create: `src/lib/assisted-registration-publish.js`
- Create: `scripts/assisted-registration-publish-smoke.mjs`
- Modify: `server.js`
- Modify: `src/lib/platform-metrics-exclusions.js`

**Interfaces:**
- Consumes: `assertMenuDraftPublishable`, rascunho completo e `withLocalTransaction()`.
- Produces: `publishAssistedRegistration(pool,id,actor) -> { registration, company, store, activation }`.

- [ ] **Step 1: Escrever testes transacionais vermelhos**

Testar:

- rascunho incompleto não publica;
- documento existente com pontuação diferente não duplica;
- duas publicações concorrentes retornam os mesmos IDs;
- falha injetada entre produto e assinatura faz rollback total;
- publicação cria todas as categorias/produtos/adicionais;
- assinatura nasce `pending_activation`, sem datas de trial;
- rascunho/pendente não aparece em MRR, clientes ativos ou lojas publicadas das métricas administrativas.

- [ ] **Step 2: Rodar e confirmar RED**

Run: `node scripts/assisted-registration-publish-smoke.mjs`

Expected: FAIL porque o publicador e endpoint ainda não existem.

- [ ] **Step 3: Implementar publicador numa transação**

Usar `SELECT ... FOR UPDATE` no rascunho, repetir duplicidade, conferir hash revisado e criar empresa, loja/configurações, administrador inativo com hash aleatório não exposto, acesso à loja, menu e assinatura pendente. Requisições repetidas em `published/activated` retornam os vínculos gravados.

- [ ] **Step 4: Criar endpoint final**

`POST /api/platform/assisted-registrations/:id/publish` exige confirmação booleana e permissão `platform.companies.manage`. O envio do e-mail é tentado depois do commit; falha retorna publicação bem-sucedida com `email_status: failed`.

- [ ] **Step 5: Atualizar exclusões de métricas**

Tratar `pending_activation` e o cadastro demo como não ativos para MRR, clientes ativos e lojas publicadas; manter contadores específicos do fluxo assistido separados.

- [ ] **Step 6: Executar testes**

Run: `node scripts/assisted-registration-publish-smoke.mjs && npm run test:plans && npm run test:platform-health && npm run test:security`

Expected: PASS para atomicidade, idempotência, métricas e SQL parametrizado.

- [ ] **Step 7: Commit**

```bash
git add src/lib/assisted-registration-publish.js scripts/assisted-registration-publish-smoke.mjs server.js src/lib/platform-metrics-exclusions.js
git commit -m "feat: publish assisted registrations atomically"
```

### Task 7: E-mail de boas-vindas, senha e início do trial

**Files:**
- Modify: `server.js`
- Modify: `prisma/seed.mjs`
- Modify: `scripts/assisted-registration-publish-smoke.mjs`
- Modify: `scripts/core-flow-smoke.mjs`

**Interfaces:**
- Consumes: ativação de administrador existente e resultado da Task 6.
- Produces: template `assisted_account_ready`, `sendAssistedActivationEmail(req,registration)`, ativação idempotente de assinatura pendente.

- [ ] **Step 1: Escrever testes vermelhos de e-mail e ativação**

Confirmar assunto/copy/link, token apenas em hash no banco, reenvio que invalida o anterior, falha SMTP recuperável, expiração, uso único, concorrência e `trial_ends_at` entre 7 dias menos/mais tolerância de relógio.

- [ ] **Step 2: Rodar e confirmar RED**

Run: `node scripts/assisted-registration-publish-smoke.mjs && node scripts/core-flow-smoke.mjs`

Expected: FAIL porque a ativação atual inicia a conta criada pelo portal, não a assinatura assistida pendente.

- [ ] **Step 3: Adicionar template e envio**

Criar `assisted_account_ready` com assunto “Seu cardápio TáPronto já está pronto 🎉”, nome/logo, URL pública, botão “Criar minha senha e começar”, explicação dos sete dias e suporte. Reutilizar `sendPlatformTemplateEmail` e o HTML transacional existente.

- [ ] **Step 4: Estender ativação transacionalmente**

Ao consumir token do administrador vinculado a cadastro assistido, bloquear assinatura/registro, ativar administrador, mudar assinatura para `trial`, definir início/agora e término/agora + 7 dias, marcar `activated` e registrar `signup_completed` uma vez. Fluxos normais do portal permanecem inalterados.

- [ ] **Step 5: Criar reenvio na Central**

`POST /api/platform/assisted-registrations/:id/resend-activation` invalida tokens pendentes, cria outro e atualiza `email_status`; não muda datas do trial ativo.

- [ ] **Step 6: Executar regressão**

Run: `node scripts/assisted-registration-publish-smoke.mjs && npm run test:flows && npm run test:trial && npm run test:security-hardening`

Expected: PASS; trial começa uma vez e portal atual continua funcionando.

- [ ] **Step 7: Commit**

```bash
git add server.js prisma/seed.mjs scripts/assisted-registration-publish-smoke.mjs scripts/core-flow-smoke.mjs
git commit -m "feat: activate assisted trials after password creation"
```

### Task 8: Interface da Central para atendimento e revisão

**Files:**
- Create: `public/platform-assisted-registration.js`
- Create: `scripts/assisted-registration-ui-smoke.mjs`
- Modify: `public/platform.html`
- Modify: `public/platform.js`
- Modify: `public/platform.css`
- Modify: `package.json`

**Interfaces:**
- Consumes: todas as rotas das Tasks 2, 4, 5, 6 e 7.
- Produces: tela “Cadastros assistidos”, wizard autosave e revisor de cardápio.

- [ ] **Step 1: Escrever smoke UI inicialmente vermelho**

Exigir navegação, lista compacta, pesquisa, oito estados, seis etapas do wizard, autosave com versão, upload dos formatos, painel original/interpretado, alertas, revisão obrigatória, confirmação final, resultado publicado e reenvio de e-mail.

- [ ] **Step 2: Rodar e confirmar RED**

Run: `node scripts/assisted-registration-ui-smoke.mjs`

Expected: FAIL porque o módulo e os seletores ainda não existem.

- [ ] **Step 3: Criar shell e lista compacta**

Adicionar item de navegação e view própria. A lista mostra responsável, telefone mascarável, estabelecimento, status, atualização e ação principal sem cards grandes.

- [ ] **Step 4: Criar wizard com autosave**

Etapas: contato, estabelecimento, operação, diagnóstico, identidade e cardápio. Mostrar duplicidades antes de avançar e permitir retomar pelo mesmo rascunho.

- [ ] **Step 5: Criar revisor de cardápio responsivo**

Desktop usa original e dados lado a lado; mobile alterna entre abas. Edição em linha suporta categorias, itens e adicionais. Erros recebem foco e texto, não dependem só de cor.

- [ ] **Step 6: Criar confirmação/publicação**

Resumo final exige checkbox de confirmação; botão desabilita durante requisição; sucesso mostra URL pública, estado do e-mail e ações “Abrir cardápio”/“Reenviar e-mail”.

- [ ] **Step 7: Atualizar testes e sintaxe**

Adicionar `test:assisted-registration-ui` e incluir o novo JS em `test:syntax`.

Run: `node scripts/assisted-registration-ui-smoke.mjs && npm run test:syntax && npm run test:platform-health`

Expected: PASS em estrutura, acessibilidade e integração da Central.

- [ ] **Step 8: Commit**

```bash
git add public/platform-assisted-registration.js public/platform.html public/platform.js public/platform.css scripts/assisted-registration-ui-smoke.mjs package.json
git commit -m "feat: add assisted setup workspace to platform"
```

### Task 9: Métricas do fluxo e verificação final

**Files:**
- Modify: `server.js`
- Modify: `public/platform-assisted-registration.js`
- Modify: `public/platform.css`
- Modify: `scripts/platform-instagram-funnel-smoke.mjs`
- Create: `docs/assisted-registration-operations.md`

**Interfaces:**
- Consumes: estados e vínculos de todas as tarefas anteriores.
- Produces: `assistedRegistrationMetrics(rows,events,subscriptions)` e documentação operacional.

- [ ] **Step 1: Escrever testes vermelhos das métricas**

Exigir contadores de cliques, iniciados, cardápios recebidos, revisão, publicação, e-mail, ativação, trial e assinatura posterior. Confirmar que não há atribuição individual falsa entre clique anônimo e telefone.

- [ ] **Step 2: Rodar e confirmar RED**

Run: `node scripts/platform-instagram-funnel-smoke.mjs`

Expected: FAIL pelos novos contadores ausentes.

- [ ] **Step 3: Implementar agregação e painel**

Adicionar bloco compacto de conversão assistida na Central, separado do funil técnico do anúncio. Origem declarada e UTM técnica aparecem com rótulos diferentes.

- [ ] **Step 4: Documentar operação**

Descrever atendimento, formatos aceitos, revisão, publicação, reenvio, duplicidade, recuperação de falha, início do trial e rollback. Não incluir segredos ou dados reais.

- [ ] **Step 5: Executar verificação completa**

Run:

```bash
npm run db:schema
npm run test:assisted-registration
npm run test:assisted-registration-ui
npm run test:syntax
npm run test:security-hardening
npm run test:security
npm run test:idor
npm run test:flows
npm run test:trial
npm run test:platform-health
npm run test:marketing
npm run test:seo
npm run test:all
git diff --check
```

Expected: todos os comandos com exit code `0`; dados sintéticos removidos; nenhum segredo nos logs.

- [ ] **Step 6: Fazer revisão estática final**

Run:

```bash
rg -n "pending_activation|assisted_registration|assisted-menu" server.js src public scripts prisma
rg -n "document_normalized|password_hash|activation.*token" server.js src/lib/assisted-* public
```

Expected: documento completo, hashes e tokens não aparecem em DTOs ou JavaScript público; todas as escritas finais estão dentro da transação.

- [ ] **Step 7: Commit**

```bash
git add server.js public/platform-assisted-registration.js public/platform.css scripts/platform-instagram-funnel-smoke.mjs docs/assisted-registration-operations.md
git commit -m "feat: report assisted registration conversion"
```

### Task 10: Preparar release sem publicar automaticamente

**Files:**
- Create after successful verification: `.deploy/assisted-registration-<commit>.tar.gz`
- Modify: nenhum arquivo de produto

**Interfaces:**
- Consumes: branch verificado e configuração de produção existente.
- Produces: pacote reproduzível e checklist de migração; não executa deploy.

- [ ] **Step 1: Verificar configuração necessária**

Confirmar nomes, sem imprimir valores: `DATABASE_URL`, `OPENAI_API_KEY`, SMTP ativo, `ASSISTED_UPLOAD_DIR`, limites de upload, `APP_ENV`, origens e segredos atuais.

- [ ] **Step 2: Gerar arquivo somente de conteúdo versionado**

Usar `git archive HEAD` e registrar SHA-256. Não incluir `.env`, uploads, backups, fixtures geradas ou arquivos locais não versionados.

- [ ] **Step 3: Produzir checklist de release**

Incluir backup do banco/código, `npm ci`, `npm run db:schema`, criação do diretório privado, reinício, health check, publicação sintética com rollback/limpeza e validação do e-mail em destinatário autorizado.

- [ ] **Step 4: Parar no gate de produção**

Apresentar commits, testes, migrações, novas dependências, riscos e pacote. Solicitar autorização explícita separada para publicar.
