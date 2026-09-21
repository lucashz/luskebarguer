# Low-Budget Sales Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure the Instagram-to-paid-subscription funnel with four events and display unique stage counts and conversion rates in the existing master admin.

**Architecture:** Extend the existing `marketing_events` pipeline instead of adding storage. The public landing emits only allowlisted anonymous events; signup and paid-subscription milestones remain server-owned. The existing protected platform analytics endpoint aggregates unique visitors/companies and the existing admin card renders the result.

**Tech Stack:** Node.js 20 ESM, PostgreSQL through the existing PostgREST adapter, browser JavaScript, Prisma schema as the database reference, smoke tests driven by Node.js.

**Spec:** `docs/superpowers/specs/2026-09-20-low-budget-sales-funnel-design.md`

## Global Constraints

- Reuse `marketing_events`, `/api/analytics/funnel`, UTM attribution, `visitor_key`, `/api/platform/analytics`, and the existing master-admin funnel card.
- Do not create a CRM, lead pipeline, Meta API integration, WhatsApp API integration, new database table, or new admin screen.
- `subscription_created` means the first paid activation; the automatic trial created at signup does not count.
- Read historical `subscription_activated` events as paid subscriptions, but write `subscription_created` for new paid activations.
- Do not attempt cross-device identity matching.
- Analytics failure must not block landing navigation, WhatsApp navigation, signup, or payment processing.
- Preserve unrelated local modifications already present in the working tree.

## Review Focus

- A malicious public client sending `signup_completed` or `subscription_created` must receive HTTP 422 and must not create a row.
- Repeated landing loads and WhatsApp clicks from the same visitor, placement, and UTC day must produce one event per stage.
- A second paid webhook or renewal for the same company must not produce a second `subscription_created` conversion.
- Historical `subscription_activated` and new `subscription_created` rows for the same company must count as one subscription.
- Zero denominators and later-stage counts greater than earlier-stage counts must return finite, unclamped numeric rates.

---

### Task 1: Public funnel events and deterministic deduplication

**Files:**
- Modify: `scripts/marketing-growth-smoke.mjs`
- Modify: `server.js:4530-4568`

**Interfaces:**
- Consumes: `POST /api/analytics/funnel`, `marketingAttributionFromRequest(req, data.attribution)`, and `recordMarketingMilestone(eventName, options)`.
- Produces: public support for `landing_view` and `whatsapp_click`; deterministic `idempotency_key` values scoped by event, visitor, path/placement, and UTC date.

- [ ] **Step 1: Add a failing public-event smoke scenario**

In `scripts/marketing-growth-smoke.mjs`, create a unique `funnelVisitor`, post each public event twice, assert both responses are 202, assert internal events are rejected with 422, then query the rows:

```js
const funnelVisitor = `funnel-${randomUUID()}`;
const attribution = {
  visitor_key: funnelVisitor,
  utm_source: 'instagram',
  utm_medium: 'paid_social',
  utm_campaign: 'smoke_funil',
  utm_content: 'video_a'
};

for (const eventName of ['landing_view', 'whatsapp_click']) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/analytics/funnel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Host: 'taprontomenu.com.br' },
      body: JSON.stringify({
        event_name: eventName,
        path: '/',
        placement: eventName === 'whatsapp_click' ? 'floating_whatsapp' : 'home',
        attribution
      })
    });
    assert(response.status === 202, `${eventName} público não foi aceito.`);
  }
}

for (const eventName of ['signup_completed', 'subscription_created']) {
  const response = await fetch(`${baseUrl}/api/analytics/funnel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Host: 'taprontomenu.com.br' },
    body: JSON.stringify({ event_name: eventName, attribution })
  });
  assert(response.status === 422, `${eventName} interno foi aceito pela rota pública.`);
}

const funnelRows = await pool.query(`
  select event_name, count(*)::int total
    from marketing_events
   where visitor_key = $1
   group by event_name
`, [funnelVisitor]);
assert(funnelRows.rows.find((row) => row.event_name === 'landing_view')?.total === 1, 'landing_view não foi deduplicado.');
assert(funnelRows.rows.find((row) => row.event_name === 'whatsapp_click')?.total === 1, 'whatsapp_click não foi deduplicado.');
```

Track `funnelVisitor` outside the `try` block and delete its rows in `finally` before closing the pool.

- [ ] **Step 2: Run the smoke test and verify RED**

Run: `npm run test:marketing`

Expected: FAIL because `whatsapp_click` receives HTTP 422 and public events are not deduplicated.

- [ ] **Step 3: Implement the minimal allowlist and idempotency key**

In `recordPublicMarketingEvent`, add `whatsapp_click` to the existing public allowlist. Build a UTC day string from `new Date().toISOString().slice(0, 10)` and pass an idempotency key only for `landing_view` and `whatsapp_click`:

```js
const visitorKey = attribution.visitor_key || accessVisitorKey(req, data.visitor_key || '');
const pathValue = cleanPublicPath(data.path || '/');
const placement = cleanText(data.placement || '').slice(0, 80);
const dailyScope = eventName === 'whatsapp_click' ? placement || pathValue : pathValue;
const idempotencyKey = ['landing_view', 'whatsapp_click'].includes(eventName)
  ? `${eventName}:${visitorKey}:${dailyScope}:${new Date().toISOString().slice(0, 10)}`
  : '';
```

Reuse `pathValue` and `placement` in `properties`, and pass `visitorKey` plus `idempotencyKey` to `recordMarketingMilestone`.

- [ ] **Step 4: Run the smoke test and syntax validation**

Run: `npm run test:marketing && npm run test:syntax`

Expected: both commands PASS; exactly one row exists for each repeated public event and internal events remain rejected.

- [ ] **Step 5: Commit the backend event contract**

```bash
git add server.js scripts/marketing-growth-smoke.mjs
git commit -m "feat(marketing): track low-budget funnel events"
```

### Task 2: Landing and WhatsApp instrumentation

**Files:**
- Modify: `public/home.html:422-430`
- Modify: `public/home.js:68-115`
- Modify: `scripts/marketing-growth-smoke.mjs`

**Interfaces:**
- Consumes: `marketingAttribution()`, `POST /api/analytics/funnel`, and the public event contract from Task 1.
- Produces: `trackMarketingEvent(eventName, properties)`, one landing emission on page load, and click emissions for anchors carrying `data-marketing-event="whatsapp_click"`.

- [ ] **Step 1: Add failing frontend contract assertions**

Read `public/home.html` and `public/home.js` in the marketing smoke test and assert the stable data hook and emissions exist:

```js
const homeHtml = readFileSync(new URL('../public/home.html', import.meta.url), 'utf8');
const homeJs = readFileSync(new URL('../public/home.js', import.meta.url), 'utf8');
assert(homeHtml.includes('data-marketing-event="whatsapp_click"'), 'CTA do WhatsApp não possui gancho de analytics.');
assert(homeHtml.includes('data-marketing-placement="floating_whatsapp"'), 'CTA do WhatsApp não informa posicionamento.');
assert(homeJs.includes("trackMarketingEvent('landing_view'"), 'Landing não registra landing_view.');
assert(homeJs.includes("link.dataset.marketingEvent"), 'Cliques de marketing não usam o gancho de dados.');
```

- [ ] **Step 2: Run the smoke test and verify RED**

Run: `npm run test:marketing`

Expected: FAIL because the WhatsApp anchor has no data hook and the landing does not emit `landing_view`.

- [ ] **Step 3: Mark the WhatsApp CTA**

Add these attributes to the existing floating WhatsApp anchor without changing its destination or visible copy:

```html
data-marketing-event="whatsapp_click"
data-marketing-placement="floating_whatsapp"
```

- [ ] **Step 4: Centralize best-effort event emission**

In `public/home.js`, call `trackMarketingEvent('landing_view', { placement: 'home' })` after `trackHomeAccess()`. Replace the URL-regex-only click handler with a data-hook-first handler while preserving the existing demo/signup classification:

```js
function trackMarketingEvent(eventName, properties = {}) {
  fetch('/api/analytics/funnel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({
      event_name: eventName,
      path: location.pathname,
      placement: properties.placement || '',
      attribution: marketingAttribution()
    })
  }).catch(() => {});
}
```

The click listener must derive `eventName` from `link.dataset.marketingEvent` before falling back to the current URL classification, then call `trackMarketingEvent`. Do not call `preventDefault`; WhatsApp navigation must continue even when `fetch` rejects.

- [ ] **Step 5: Run targeted validation**

Run: `npm run test:marketing && npm run test:syntax`

Expected: PASS with the static contract present and browser scripts syntactically valid.

- [ ] **Step 6: Commit landing instrumentation**

```bash
git add public/home.html public/home.js scripts/marketing-growth-smoke.mjs
git commit -m "feat(marketing): instrument landing WhatsApp funnel"
```

### Task 3: Paid-subscription milestone compatibility

**Files:**
- Modify: `scripts/core-flow-smoke.mjs:203-213`
- Modify: `server.js:8473-8480`

**Interfaces:**
- Consumes: successful billing webhook processing and company `marketing_attribution`.
- Produces: one `subscription_created` event per company; existing `subscription_activated` rows remain readable but are no longer written for new activations.

- [ ] **Step 1: Add a failing paid-conversion assertion**

After the existing mock billing activation in `scripts/core-flow-smoke.mjs`, query:

```js
const paidMilestone = await client.query(`
  select event_name, count(*)::int total
    from marketing_events
   where company_id = $1
     and event_name = 'subscription_created'
   group by event_name
`, [companyId]);
assert(paidMilestone.rows[0]?.total === 1, 'Primeira assinatura paga não gerou subscription_created único.');
```

Invoke the same already-defined mock webhook payload a second time before this query so the assertion also proves webhook idempotency.

- [ ] **Step 2: Run the core flow and verify RED**

Run: `npm run test:flows`

Expected: FAIL because the server still writes `subscription_activated`.

- [ ] **Step 3: Write the new milestone once per company**

Change the paid branch to call:

```js
await recordMarketingMilestone('subscription_created', {
  companyId: subscription.company_id,
  attribution: marketingCompany?.marketing_attribution || {},
  properties: {
    plan_code: planCode || null,
    amount_cents: amountCents || transaction?.amount_cents || 0
  },
  idempotencyKey: `subscription_created:${subscription.company_id}`
}).catch(() => {});
```

Company-scoped idempotency prevents renewals or a second transaction from becoming another acquisition conversion.

- [ ] **Step 4: Run core flow and syntax validation**

Run: `npm run test:flows && npm run test:syntax`

Expected: PASS; repeated billing processing leaves one `subscription_created` row.

- [ ] **Step 5: Commit the paid milestone**

```bash
git add server.js scripts/core-flow-smoke.mjs
git commit -m "feat(billing): record first paid funnel conversion"
```

### Task 4: Master-admin funnel aggregation

**Files:**
- Modify: `scripts/platform-health-smoke.mjs:156-167`
- Modify: `server.js:3991-4013`

**Interfaces:**
- Consumes: marketing events loaded by `platformCommercialAnalytics(params)`.
- Produces: `analytics.marketing.stages` with the four stage counts and `analytics.marketing.rates` with `landing_to_whatsapp`, `whatsapp_to_signup`, `signup_to_subscription`, and `landing_to_subscription`.

- [ ] **Step 1: Seed a failing analytics fixture**

Before requesting analytics in `scripts/platform-health-smoke.mjs`, insert isolated rows within the current period: two landing visitors, one WhatsApp visitor, one signup company, one new subscription row, and one historical activation for the same company. Track all inserted IDs for cleanup.

```js
await client.query(`
  insert into marketing_events
    (id, company_id, event_name, visitor_key, idempotency_key, attribution, properties)
  values
    ($1, null, 'landing_view', $7, $10, '{}'::jsonb, '{}'::jsonb),
    ($2, null, 'landing_view', $8, $11, '{}'::jsonb, '{}'::jsonb),
    ($3, null, 'whatsapp_click', $7, $12, '{}'::jsonb, '{}'::jsonb),
    ($4, $9, 'signup_completed', $7, $13, '{}'::jsonb, '{}'::jsonb),
    ($5, $9, 'subscription_created', null, $14, '{}'::jsonb, '{}'::jsonb),
    ($6, $9, 'subscription_activated', null, $15, '{}'::jsonb, '{}'::jsonb)
`, [event1, event2, event3, event4, event5, event6, visitor1, visitor2,
    createdCompanyId, key1, key2, key3, key4, key5, key6]);
```

Create `event1` through `event6` with `randomUUID()`, use two unique visitor strings, and use six unique idempotency-key strings. Capture analytics once before inserting the fixture, then once afterward, and assert deltas so unrelated local data cannot make the test flaky:

```js
assert(after.marketing.stages.landing_view - before.marketing.stages.landing_view === 2, 'Visitantes únicos incorretos.');
assert(after.marketing.stages.whatsapp_click - before.marketing.stages.whatsapp_click === 1, 'Cliques únicos incorretos.');
assert(after.marketing.stages.signup_completed - before.marketing.stages.signup_completed === 1, 'Cadastros únicos incorretos.');
assert(after.marketing.stages.subscription_created - before.marketing.stages.subscription_created === 1, 'Assinaturas compatíveis não foram unificadas.');
for (const key of ['landing_to_whatsapp', 'whatsapp_to_signup', 'signup_to_subscription', 'landing_to_subscription']) {
  assert(Number.isFinite(after.marketing.rates[key]), `Taxa ${key} não é numérica.`);
}
```

- [ ] **Step 2: Run the platform smoke test and verify RED**

Run: `npm run test:platform-health`

Expected: FAIL because the snapshot omits landing and WhatsApp stages, and exposes the old rate names.

- [ ] **Step 3: Replace the funnel snapshot with the four-stage contract**

Use a helper that selects a stable identity per stage:

```js
const eventIdentity = (event, stage) => {
  if (stage === 'landing_view' || stage === 'whatsapp_click') return event.visitor_key || event.id;
  return event.company_id || event.visitor_key || event.id;
};
const uniqueCount = (names, stage) => new Set(events
  .filter((event) => names.includes(event.event_name))
  .map((event) => eventIdentity(event, stage))
  .filter(Boolean)).size;
```

Return stages for `landing_view`, `whatsapp_click`, `signup_completed`, and `subscription_created`. For the last stage, use both `subscription_created` and `subscription_activated`. Stop deriving funnel subscriptions from `subscription_events`; keep the function's second argument temporarily only if another caller requires it, otherwise remove it and update the single caller.

Calculate rates with the existing one-decimal `rate(part, total)` helper and do not clamp results over 100.

- [ ] **Step 4: Run platform, marketing, and syntax validation**

Run: `npm run test:platform-health && npm run test:marketing && npm run test:syntax`

Expected: PASS; historical and new paid events for one company count once, and all rates are finite.

- [ ] **Step 5: Commit aggregation changes**

```bash
git add server.js scripts/platform-health-smoke.mjs
git commit -m "feat(platform): aggregate acquisition funnel"
```

### Task 5: Render the four-stage admin funnel

**Files:**
- Modify: `public/platform.js:2246-2275`
- Modify: `scripts/marketing-growth-smoke.mjs`

**Interfaces:**
- Consumes: the `analytics.marketing` contract from Task 4.
- Produces: four funnel rows and four conversion-rate cards in the existing `#platformMarketingFunnel` container.

- [ ] **Step 1: Add failing UI contract assertions**

Extend the platform JavaScript assertions:

```js
for (const label of ['Visitantes', 'Cliques no WhatsApp', 'Cadastros', 'Assinaturas']) {
  assert(platformJs.includes(`'${label}'`), `Funil do admin não inclui ${label}.`);
}
for (const rate of ['landing_to_whatsapp', 'whatsapp_to_signup', 'signup_to_subscription', 'landing_to_subscription']) {
  assert(platformJs.includes(rate), `Funil do admin não renderiza ${rate}.`);
}
```

- [ ] **Step 2: Run the marketing smoke test and verify RED**

Run: `npm run test:marketing`

Expected: FAIL because the existing renderer shows demonstration, product, publication, order, and old rate names.

- [ ] **Step 3: Simplify the existing renderer**

Replace `rows` with:

```js
const rows = [
  ['Visitantes', stages.landing_view],
  ['Cliques no WhatsApp', stages.whatsapp_click],
  ['Cadastros', stages.signup_completed],
  ['Assinaturas', stages.subscription_created]
];
```

Render these four rate cards with `Number(value || 0)` and a `%` suffix:

```js
[
  ['Visita → WhatsApp', marketing.rates?.landing_to_whatsapp],
  ['WhatsApp → cadastro', marketing.rates?.whatsapp_to_signup],
  ['Cadastro → assinatura', marketing.rates?.signup_to_subscription],
  ['Visita → assinatura', marketing.rates?.landing_to_subscription]
]
```

Keep the existing source breakdown and empty state.

- [ ] **Step 4: Run targeted tests**

Run: `npm run test:marketing && npm run test:platform-health && npm run test:syntax`

Expected: PASS with all four rows and rates represented.

- [ ] **Step 5: Commit the admin UI**

```bash
git add public/platform.js scripts/marketing-growth-smoke.mjs
git commit -m "feat(platform): show low-budget sales funnel"
```

### Task 6: Full verification and production release gate

**Files:**
- Modify only if a test exposes a defect in the files already listed above.
- Create after successful verification: `.deploy/low-budget-sales-funnel-<commit>.tar.gz`

**Interfaces:**
- Consumes: all prior tasks and the repository's current test suite.
- Produces: a verified commit and a minimal production release archive containing only committed funnel changes.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm run test:all`

Expected: PASS with no failed command. If an unrelated pre-existing test fails, record its exact command and output; do not hide it or claim the release is verified.

- [ ] **Step 2: Inspect the final diff and working tree**

Run:

```powershell
git status --short
git diff --check HEAD~4..HEAD
git diff --stat HEAD~4..HEAD
```

Expected: no whitespace errors. Confirm that unrelated pre-existing working-tree changes remain unstaged and absent from the four implementation commits.

- [ ] **Step 3: Verify the public production baseline before deployment**

Run:

```powershell
Invoke-RestMethod -Uri 'https://taprontomenu.com.br/api/health' -Method Get
```

Expected: HTTP 200 and a healthy JSON response. Stop before deployment if the baseline is unhealthy.

- [ ] **Step 4: Build a commit-derived release archive**

In PowerShell, resolve and validate the output path, then archive only files changed by this feature:

```powershell
$releaseCommit = git rev-parse --short HEAD
$releasePath = Join-Path (Resolve-Path '.deploy') "low-budget-sales-funnel-$releaseCommit.tar.gz"
git archive --format=tar.gz --output=$releasePath HEAD -- server.js public/home.html public/home.js public/platform.js scripts/core-flow-smoke.mjs scripts/marketing-growth-smoke.mjs scripts/platform-health-smoke.mjs docs/superpowers/specs/2026-09-20-low-budget-sales-funnel-design.md docs/superpowers/plans/2026-09-20-low-budget-sales-funnel.md
Get-Item -LiteralPath $releasePath | Select-Object FullName,Length
```

Expected: one non-empty archive inside the repository's `.deploy` directory, built from committed content rather than the dirty working tree.

- [ ] **Step 5: Identify and use the established production transport**

The repository contains no deploy command, remote host, or auto-deploy workflow. Before mutating production, retrieve the current deployment procedure from the operator-managed environment. Accept only a procedure that identifies the exact host/service, creates a server-side backup of replaced files, extracts the archive into the application release directory, runs `npm run db:schema`, restarts the existing service, and preserves `.env` plus uploaded data. Do not guess SSH targets or service names.

- [ ] **Step 6: Run post-deploy health checks**

After the established deployment command succeeds, run:

```powershell
Invoke-RestMethod -Uri 'https://taprontomenu.com.br/api/health' -Method Get
$home = Invoke-WebRequest -Uri 'https://taprontomenu.com.br/' -UseBasicParsing
if ($home.StatusCode -ne 200 -or $home.Content -notmatch 'data-marketing-event="whatsapp_click"') { throw 'Landing de produção não contém a instrumentação esperada.' }
```

Expected: health HTTP 200 and the deployed landing contains the WhatsApp analytics hook.

- [ ] **Step 7: Perform a non-destructive production event check**

Send a unique synthetic visitor to the public endpoint, then confirm HTTP 202 without creating a signup or payment:

```powershell
$visitor = "production-smoke-$(Get-Date -Format 'yyyyMMddHHmmss')"
$body = @{ event_name='landing_view'; path='/'; placement='production_smoke'; attribution=@{ visitor_key=$visitor; utm_source='production_smoke'; utm_medium='health_check'; utm_campaign='funnel_release' } } | ConvertTo-Json -Depth 4
$response = Invoke-WebRequest -Uri 'https://taprontomenu.com.br/api/analytics/funnel' -Method Post -ContentType 'application/json' -Body $body -UseBasicParsing
if ($response.StatusCode -ne 202) { throw "Analytics de produção retornou $($response.StatusCode)." }
```

Expected: HTTP 202. Report the synthetic `visitor_key` so it can be recognized in analytics.

- [ ] **Step 8: Report release evidence**

Report the deployed commit, archive path, full-suite result, baseline and post-deploy health status, production event response, and any unrelated working-tree changes left untouched. Do not call the production release complete without all available evidence.
