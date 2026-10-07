# WhatsApp Outreach Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Count each contacted establishment as one commercial outreach, reconcile the 11 approved contacts, and report responses and delivery information without counting carousel parts as separate outreach.

**Architecture:** Use one idempotent `outreach_sent` automation event per lead and campaign as the source of truth for commercial outreach. Keep message rows as technical delivery details, and compute reporting from distinct leads rather than raw message counts. Add an explicit dry-run/apply reconciliation command for the historical batch.

**Tech Stack:** Node.js ES modules, PostgreSQL, existing sales CLI and smoke-test harness.

**Spec:** `docs/superpowers/specs/2026-10-07-whatsapp-outreach-metrics.md`

## Global Constraints

- One contacted establishment equals one commercial outreach.
- The intro text and three carousel images are four technical message parts of the same outreach.
- Reconciliation must be idempotent and must never send WhatsApp messages.
- Existing unrelated worktree changes must remain untouched.
- Historical changes require explicit `--apply`; the default is read-only.

## Review Focus

- Re-running reconciliation must leave outreach and attempt counts unchanged.
- Multiple inbound messages from one lead must count as one responding contact.
- A lead without an outreach event must not inflate response-rate denominators.
- Missing leads in the historical manifest must be reported and must not be created silently.
- Leads already in a later or terminal stage must not be moved backward to `awaiting_reply`.

---

### Task 1: Outreach metrics contract

**Files:**
- Create: `src/lib/sales-metrics.js`
- Create: `scripts/sales-metrics-test.mjs`
- Modify: `scripts/sales-automation.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `buildSalesMetricsQuery(): string` and the `metrics` CLI response with contact-level and technical-message counters.
- Consumes: Existing PostgreSQL tables `sales_leads`, `sales_messages`, and `sales_automation_events`.

- [ ] **Step 1: Write the failing metrics tests**

Test a real temporary PostgreSQL transaction with literal fixtures proving one `outreach_sent` event plus four outbound parts equals one outreach, and three inbound messages from one lead equal one responding contact.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/sales-metrics-test.mjs`
Expected: FAIL because `src/lib/sales-metrics.js` does not exist.

- [ ] **Step 3: Implement the contact-level metrics query**

Create `buildSalesMetricsQuery()` and update `metrics()` to report `outreaches`, `delivered_contacts`, `read_contacts`, `responding_contacts`, `inbound_messages`, `interested_contacts`, `demos`, `not_interested`, `opt_outs`, `delivery_failures`, `outbound_message_parts`, `delivery_rate`, `read_rate`, and `reply_rate`.

- [ ] **Step 4: Run the focused test**

Run: `node scripts/sales-metrics-test.mjs`
Expected: PASS with contact counts and rates derived from the literal fixtures.

- [ ] **Step 5: Add the focused test to the sales test command**

Update `test:sales` so the new regression test runs with the existing sales smoke tests.

### Task 2: Idempotent historical reconciliation

**Files:**
- Create: `src/lib/sales-outreach-reconciliation.js`
- Create: `scripts/reconcile-approved-sales-outreach.mjs`
- Create: `scripts/sales-outreach-reconciliation-test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: An approved manifest containing business name, normalized phone, campaign key, message version, part count, and contact timestamp.
- Produces: `reconcileSalesOutreach(client, manifest, { apply }): Promise<summary>` and CLI dry-run/apply summaries.

- [ ] **Step 1: Write the failing reconciliation tests**

Use real database fixtures to prove: 11 matching leads create 11 events only in apply mode; a second apply creates zero events and does not increment attempts; missing leads are reported; later and terminal stages are preserved.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/sales-outreach-reconciliation-test.mjs`
Expected: FAIL because the reconciliation module does not exist.

- [ ] **Step 3: Implement reconciliation and the approved manifest**

Insert one `outreach_sent` event per campaign/lead when absent, update `attempt_count`, `last_contact_at`, and eligible stages, and return totals for matched, missing, inserted, updated, and unchanged leads. Default to dry-run and require `--apply` to write.

- [ ] **Step 4: Run the focused reconciliation test**

Run: `node scripts/sales-outreach-reconciliation-test.mjs`
Expected: PASS, including the second-run idempotency assertion.

- [ ] **Step 5: Add the reconciliation test and command scripts**

Add `sales:reconcile-outreach` and include the reconciliation test in `test:sales`.

### Task 3: Apply and verify the historical annotations

**Files:**
- Modify data only: PostgreSQL sales tables through the reconciliation command.

**Interfaces:**
- Consumes: Tasks 1 and 2 outputs.
- Produces: A reconciled CRM and an in-chat metrics report.

- [ ] **Step 1: Preview the reconciliation**

Run: `npm run sales:reconcile-outreach`
Expected: dry-run reports 11 matched leads and 11 pending outreach annotations, or names any missing lead without writing.

- [ ] **Step 2: Apply once**

Run: `npm run sales:reconcile-outreach -- --apply`
Expected: 11 outreach events inserted and eligible leads updated, with no WhatsApp send operation.

- [ ] **Step 3: Verify idempotency against live data**

Run: `npm run sales:reconcile-outreach -- --apply`
Expected: zero new events and zero duplicate attempt increments.

- [ ] **Step 4: Verify the report**

Run: `npm run sales -- metrics`
Expected: exactly 11 newly reconciled commercial outreaches plus any previously valid outreach events, with unique responding contacts separated from inbound message count.

- [ ] **Step 5: Run the complete sales suite and syntax checks**

Run: `npm run test:sales && npm run test:syntax`
Expected: both commands exit 0; report any unrelated pre-existing failure by name.
