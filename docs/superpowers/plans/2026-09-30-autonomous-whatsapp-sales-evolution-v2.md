# Autonomous WhatsApp Sales on Evolution API v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enviar e conduzir conversas comerciais autônomas do TáPronto pela instância Evolution API v2 já conectada, com interrupção segura, handoff e histórico completo.

**Architecture:** Um adaptador isolado encapsula os contratos HTTP da Evolution API v2 e é consumido apenas pelo subsistema comercial existente. O motor atual de leads, mensagens, jobs e supressões ganha uma cadência autônoma de escopo fechado; exceções pausam a conversa e geram handoff, sem respostas inventadas.

**Tech Stack:** Node.js 20 ESM, PostgreSQL, Prisma 6.19, `fetch` nativo, Evolution API v2.3.7, scripts smoke existentes.

**Spec:** `docs/superpowers/specs/2026-09-30-autonomous-whatsapp-sales-evolution-v2-design.md`

## Global Constraints

- Começar com no máximo 10 novos contatos por dia e intervalo mínimo de 180 segundos.
- Permitir primeiros contatos de segunda a sábado, 09:00–18:00, em `America/Sao_Paulo`; domingos e datas bloqueadas não enviam.
- Permitir apenas um primeiro contato e um lembrete após 48 horas sem resposta.
- Uma resposta recebida cancela o lembrete antes de qualquer classificação.
- Opt-out ou negativa encerra a cadência e impede contatos futuros pelo telefone.
- Links de demonstração, preços e pagamento saem somente de configuração fechada.
- Dúvida desconhecida, negociação, reclamação ou mídia pausa a automação e gera handoff humano.
- Nunca registrar ou retornar a API key da Evolution; nenhum segredo entra no Git.
- Não adicionar dependência npm para o cliente HTTP.
- Preservar as alterações não relacionadas que já existem no worktree.
- Antes de cada commit, revisar `git diff --cached` e usar staging seletivo para arquivos que já possuam mudanças não relacionadas.

## Review Focus

- Telefone malformado ou ausente deve ser rejeitado antes de qualquer chamada externa; cobrir no Task 1.
- Resposta entre o agendamento e a execução de um lembrete deve cancelar o job e impedir o envio; cobrir no Task 4.
- HTTP 200 com corpo inesperado da Evolution deve falhar fechado, sem marcar mensagem como enviada; cobrir no Task 1.
- Evento duplicado sem `providerMessageId` não pode gerar duas respostas; cobrir no Task 2 com chave derivada do payload estável.
- Mudança de estado para desconectado durante uma fila deve pausar os novos envios antes da próxima chamada; cobrir no Task 2.

---

## File Structure

- `src/lib/evolution-v2-sales.js`: configuração, requisições HTTP, estado da instância, webhook e envio de texto da Evolution v2.
- `src/lib/sales-automation.js`: regras puras de conversa, tipos autônomos permitidos, limites e classificação de handoff.
- `server.js`: persistência, webhook, fila, envio, cancelamento e notificação operacional.
- `scripts/sales-automation.mjs`: comandos de configuração, enfileiramento, status e simulação.
- `scripts/evolution-v2-sales-smoke.mjs`: testes isolados do adaptador com `fetch` falso.
- `scripts/sales-automation-smoke.mjs`: testes do roteiro e das travas da cadência.
- `.env.example` e `.env.production.example`: nomes e padrões seguros das configurações.
- `docs/sales-whatsapp-automation.md`: operação, implantação gradual e recuperação.

### Task 1: Adaptador Evolution API v2

**Files:**
- Create: `src/lib/evolution-v2-sales.js`
- Create: `scripts/evolution-v2-sales-smoke.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `evolutionV2SalesConfig(env)`, `evolutionV2Request(path, init, config, fetchImpl)`, `getEvolutionV2ConnectionState(config, fetchImpl)`, `sendEvolutionV2SalesText({ phone, text }, config, fetchImpl)`, `setEvolutionV2SalesWebhook({ url, secret }, config, fetchImpl)`.
- Returns from send: `{ id: string, raw: object }`; connection state: `{ connected: boolean, state: string }`.

- [ ] **Step 1: Write failing adapter smoke tests**

Test `scripts/evolution-v2-sales-smoke.mjs` with a fake `fetchImpl`. Assert `apikey` header, `POST /message/sendText/{instance}`, normalized phone/text body, extraction of message ID, `GET /instance/connectionState/{instance}`, and `POST /webhook/set/{instance}` with the message and connection events required by the installed provider. Assert invalid phone, missing ID in a 200 response, non-2xx response, timeout, and error serialization never expose the API key.

- [ ] **Step 2: Run the adapter test and verify failure**

Run: `node scripts/evolution-v2-sales-smoke.mjs`

Expected: FAIL because `src/lib/evolution-v2-sales.js` does not exist.

- [ ] **Step 3: Implement the adapter**

Create the exported interfaces above. Use `AbortSignal.timeout`, URL-encode the instance name, send `apikey` only as a request header, require a non-empty provider message ID, and sanitize response errors before throwing. Defaults must not contain the VM address or a secret.

- [ ] **Step 4: Add and run the adapter test command**

Add `test:sales:evolution-v2` to `package.json` and include it in `test:sales`. Run `npm run test:sales:evolution-v2`.

Expected: `Evolution v2 sales adapter smoke: OK`.

- [ ] **Step 5: Commit the adapter**

```bash
git add src/lib/evolution-v2-sales.js scripts/evolution-v2-sales-smoke.mjs
git add -p package.json
git commit -m "feat: add Evolution v2 sales adapter"
```

### Task 2: Webhook comercial e estado da instância

**Files:**
- Modify: `server.js:367-394,11538-11676`
- Modify: `src/lib/sales-automation.js:100-118`
- Modify: `scripts/sales-automation-smoke.mjs`

**Interfaces:**
- Consumes: adaptador do Task 1.
- Produces: `receiveEvolutionV2SalesWebhook(req, payload)`, `salesInboundEventKey(payload, inbound)` e `assertEvolutionV2SalesConnected(config, fetchImpl)`.

- [ ] **Step 1: Add failing webhook tests**

Test payloads reais do formato Evolution v2 para texto, mensagem própria, grupo, mídia e `CONNECTION_UPDATE`. Assert segredo inválido = 401, instância diferente = ignored, duplicata com ID = uma mensagem, duplicata sem ID = uma mensagem usando hash estável, and disconnected state = global automation paused before another send.

- [ ] **Step 2: Run the sales smoke test and verify failure**

Run: `npm run test:sales`

Expected: FAIL on missing Evolution v2 webhook handling.

- [ ] **Step 3: Implement isolated Evolution v2 ingress**

Route the existing webhook endpoint to `receiveEvolutionV2SalesWebhook` when `payload.instance` equals the configured commercial instance. Validate `x-evolution-webhook-secret`, parse inbound content with `parseEvolutionInbound`, derive `salesInboundEventKey`, cancel pending/retry follow-up jobs before enqueueing classification, and never require a `StoreWhatsappIntegration` row for this provider.

- [ ] **Step 4: Implement connection-state fail-closed behavior**

On disconnected `CONNECTION_UPDATE`, set the global sales setting to paused and record a `provider_disconnected` event. `assertEvolutionV2SalesConnected` must also check live state immediately before every outbound send.

- [ ] **Step 5: Run tests and commit**

Run: `npm run test:sales`

Expected: all sales and adapter smoke assertions pass.

```bash
git add -p server.js
git add src/lib/sales-automation.js scripts/sales-automation-smoke.mjs
git commit -m "feat: receive Evolution v2 sales events"
```

### Task 3: Roteiro autônomo e respostas confiáveis

**Files:**
- Modify: `src/lib/sales-automation.js`
- Modify: `scripts/sales-automation-smoke.mjs`

**Interfaces:**
- Produces: `autonomousSalesMessageAllowed(decision, config)`, `configuredSalesFacts(env)`, and expanded `fallbackSalesDecision(body, context)`.
- Decision contract remains `{ intent, confidence, next_stage, should_reply, reply, requires_human, human_reason, should_stop_automation, should_schedule_followup, summary }`.

- [ ] **Step 1: Add failing conversation-table tests**

Cover: greeting/permission, WhatsApp discovery, PDF/image discovery, satisfied competitor, competitor pain, demo permission, demo refusal, configured price, test request, opt-out, not interested, busy, complaint, discount, unknown question, and explicit human request. Assert unknown information returns the exact containment behavior, `requires_human: true`, no invented fact, and no autonomous send.

- [ ] **Step 2: Run and observe the failing cases**

Run: `node scripts/sales-automation-smoke.mjs`

Expected: FAIL on the new intents and configured facts.

- [ ] **Step 3: Implement the closed conversation policy**

Expand states/intents only where required by the tests. `configuredSalesFacts` reads segment demo URLs, monthly price, plan benefits and official checkout URL from environment. `autonomousSalesMessageAllowed` permits first contact, discovery, authorized demo, configured factual replies and the single follow-up; it rejects unknown, complaint, discount, negotiation, media and human request.

- [ ] **Step 4: Run tests and commit**

Run: `npm run test:sales`

Expected: all conversation-table assertions pass.

```bash
git add src/lib/sales-automation.js scripts/sales-automation-smoke.mjs
git commit -m "feat: add autonomous sales conversation policy"
```

### Task 4: Enfileiramento autônomo, lembrete único e handoff

**Files:**
- Modify: `server.js:11677-11890`
- Modify: `scripts/sales-automation.mjs`
- Modify: `scripts/sales-automation-smoke.mjs`
- Create: `prisma/migrations/20260930_add_sales_handoff_email_template/migration.sql` only if an existing generic internal-alert template cannot express the handoff; otherwise reuse the existing template without schema changes.

**Interfaces:**
- Produces: `queueAutonomousSalesOutreach({ limit, dryRun })`, `createAutonomousSalesMessage(lead, decision, metadata)`, `cancelPendingSalesFollowups(leadId)`, and `notifySalesHandoff(lead, inbound, reason)`.
- CLI produces: `outreach:queue --limit N [--dry-run]` and keeps `handoff:list` as the operational inbox.

- [ ] **Step 1: Add failing database-backed flow tests**

Within a transaction, assert: only qualified active unsuppressed leads are selected; first contact is born approved and receives an idempotent send job; daily limit 10 and 180-second interval are enforced; an inbound reply cancels a pending follow-up; exactly one follow-up is created after 48 hours; a late reply prevents that claimed follow-up from sending; unknown question pauses the lead and creates one internal handoff notification.

- [ ] **Step 2: Run the database smoke and verify failure**

Run: `npm run test:sales` with `DATABASE_URL` configured.

Expected: FAIL on missing autonomous queue and cancellation behavior.

- [ ] **Step 3: Implement autonomous queue and send path**

Implement the interfaces above. Replace the store-bound send inside `sendApprovedSalesMessage` only for the commercial Evolution v2 path, preserving atomic `approved -> sending -> sent/failed`. Re-check suppression, lead state, live provider connection, time window, counts and interval immediately before the HTTP request.

- [ ] **Step 4: Implement one follow-up and handoff notification**

Change the maximum from two reminders to one, scheduled at `last_contact_at + 48 hours`. Re-check for any inbound message newer than the outbound before sending. `notifySalesHandoff` must include establishment, masked phone, question, conversation summary and reason, without credentials or full unrelated message history; notification failure must not resume automation.

- [ ] **Step 5: Run tests and commit**

Run: `npm run test:sales && npm run test:syntax`

Expected: both commands pass.

```bash
git add -p server.js
git add scripts/sales-automation.mjs scripts/sales-automation-smoke.mjs
git add prisma/migrations/20260930_add_sales_handoff_email_template
git commit -m "feat: automate guarded WhatsApp sales cadence"
```

### Task 5: Configuração e operação

**Files:**
- Modify: `.env.example`
- Modify: `.env.production.example`
- Modify: `docs/sales-whatsapp-automation.md`
- Modify: `scripts/sales-automation.mjs`

**Interfaces:**
- Consumes: tasks 1–4.
- Produces: safe `status`, `provider:test`, `webhook:configure`, `outreach:queue`, `automation:pause`, `automation:resume`, `metrics` commands.

- [ ] **Step 1: Add failing CLI redaction assertions**

Assert `status` reports enabled/mode/instance/connected/paused without returning API key, webhook secret or full phone. Assert `provider:test` is read-only and `webhook:configure` requires an HTTPS public webhook URL outside local development.

- [ ] **Step 2: Implement CLI and environment contract**

Document `SALES_EVOLUTION_V2_BASE_URL`, `SALES_EVOLUTION_V2_API_KEY`, `SALES_EVOLUTION_V2_INSTANCE`, `SALES_EVOLUTION_V2_WEBHOOK_SECRET`, public webhook URL, demo URLs, official price/benefits/checkout, and the exact initial safety defaults. Keep all example secrets empty.

- [ ] **Step 3: Rewrite the operator runbook**

Document dry-run import, controlled-number test, three-lead pilot, 10/day release, handoff handling, pause/resume, metrics, QR reconnection, rollback, opt-out audit and the fact that the LAN VM must reach the public TáPronto webhook over HTTPS.

- [ ] **Step 4: Run verification and commit**

Run: `npm run test:sales && npm run test:syntax && npx prisma validate`

Expected: all pass; status output contains no secret values.

```bash
git add -p .env.example .env.production.example
git add docs/sales-whatsapp-automation.md scripts/sales-automation.mjs
git commit -m "docs: add autonomous sales operations runbook"
```

### Task 6: Controlled deployment and end-to-end verification

**Files:**
- Modify: `docs/sales-whatsapp-automation.md` only if observed production behavior requires an operational correction.

**Interfaces:**
- Consumes: completed tasks 1–5 and the connected Evolution v2 instance.
- Produces: verified runtime configuration and a stopped-by-default deployment ready for the pilot.

- [ ] **Step 1: Run the complete local verification suite**

Run: `npm run test:sales && npm run test:syntax && npx prisma validate`

Expected: exit code 0 for all commands.

- [ ] **Step 2: Deploy with sending disabled**

Configure secrets outside Git, keep `SALES_AUTOMATION_ENABLED=false`, deploy the application/worker, run migrations if Task 4 created one, configure the public webhook and verify provider status.

- [ ] **Step 3: Test with a controlled number**

Import one lead owned by the operator, enable the automation, queue one contact, reply through WhatsApp, and verify exactly one outbound message, one inbound message, correct stage transition, cancelled follow-up after reply, and opt-out suppression in a second controlled run.

- [ ] **Step 4: Execute the three-lead pilot**

Import three individually reviewed local businesses, queue at most three first contacts, monitor `handoff:list`, provider status, duplicate count and opt-outs. Pause immediately on duplication, unexpected response, disconnect or suppression failure.

- [ ] **Step 5: Release the initial daily limit and record evidence**

Only after the pilot passes, set the daily limits to 10 and retain 180 seconds, one reminder and the 09:00–18:00 window. Record command outputs with secrets and phones redacted in the runbook's deployment log.

- [ ] **Step 6: Commit any runbook-only correction**

```bash
git add docs/sales-whatsapp-automation.md
git commit -m "docs: record WhatsApp sales pilot verification"
```
