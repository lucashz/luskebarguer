# Registration Provenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every new company registration traceable by creation source, purpose, responsible actor, acquisition context, and genuine customer login activity.

**Architecture:** Add nullable provenance columns to `companies` for efficient Central queries while enforcing complete provenance for all post-release creation paths in application code. A focused domain module will normalize and validate provenance and build the immutable `company.created` audit payload; existing public, platform, and assisted flows will call it. Direct customer authentication will maintain a company-level `last_customer_login_at`, while Central impersonation and internal work remain excluded.

**Tech Stack:** Node.js ES modules, PostgreSQL, Prisma schema/migrations, existing PostgREST adapter, vanilla HTML/CSS/JavaScript, Node assertion-based smoke tests.

**Spec:** `docs/superpowers/specs/2026-10-08-registration-provenance-design.md`

## Global Constraints

- Apply the feature only to registrations created after deployment; do not infer or backfill provenance for existing companies.
- Preserve UTC timestamps in PostgreSQL and present dates in `America/Sao_Paulo` through the existing UI formatters.
- Do not store passwords, cookies, authorization headers, tokens, or full request bodies in provenance metadata or audit events.
- Derive human operators from the authenticated server session; never trust an operator ID supplied by the browser.
- Keep legacy null provenance visible as `Legado sem rastreamento`; never reinterpret it as `unknown` or `self_service`.
- Do not deploy to production as part of this plan.
- Preserve unrelated working-tree changes, including existing files under `.deploy/` and `artifacts/`.

## Review Focus

- A `lead_capture` submission with blank or `unknown` acquisition channel must fail with HTTP 422; pin this in Task 1 and the assisted API test in Task 3.
- A deleted operator must leave the creator name snapshot readable even though `created_by_admin_id` becomes null; pin the database behavior in Task 2.
- Failed or 2FA-pending logins must not update `last_customer_login_at`; pin both cases in Task 4.
- Legacy rows with null provenance must remain listable and render as `Legado sem rastreamento`; pin API and UI behavior in Tasks 5 and 6.
- Combined provenance filters must retain pagination and return only matching companies; pin this in Task 5.

---

### Task 1: Provenance domain contract

**Files:**
- Create: `src/lib/registration-provenance.js`
- Create: `scripts/registration-provenance-test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `normalizeRegistrationProvenance(input, context) -> { companyFields, auditData }`.
- Produces: exported constants `REGISTRATION_SOURCES` and `REGISTRATION_PURPOSES` for server/UI contract tests.
- Consumes: plain input values plus trusted context `{ actorAdmin, systemActor, attribution }`; no database access.

- [ ] **Step 1: Write the failing domain tests**

Cover `self_service/customer_request`, each internal source, mandatory operator snapshot/note for human internal creation, stable system identity for automation/import/API, the 500-character note limit, `lead_capture` channel requirements, explicit `declared_source: "unknown"`, and recursive removal of keys matching password/cookie/token/authorization/secret from audit metadata.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node scripts/registration-provenance-test.mjs`

Expected: FAIL because `src/lib/registration-provenance.js` does not exist.

- [ ] **Step 3: Implement the provenance module**

Implement `normalizeRegistrationProvenance(input = {}, context = {})` with the exact source and purpose values from the spec. Return snake_case fields ready for `companies` persistence and an `after_data` object ready for `audit()`. Throw typed validation errors carrying status `422` and actionable Portuguese messages so `server.js` can preserve existing HTTP error behavior.

- [ ] **Step 4: Add the test command and verify**

Add `test:registration-provenance` to `package.json`, run `npm run test:registration-provenance`, and expect `Registration provenance: OK`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/registration-provenance.js scripts/registration-provenance-test.mjs package.json
git commit -m "feat: define registration provenance contract"
```

### Task 2: Additive database schema and indexes

**Files:**
- Create: `prisma/migrations/20261008180000_registration_provenance/migration.sql`
- Modify: `prisma/schema.prisma`
- Modify: `prisma/init.sql`
- Modify: `supabase/schema.sql`
- Modify: `supabase/platform-schema.sql`
- Modify: `scripts/local-db-smoke.mjs`

**Interfaces:**
- Consumes: normalized company fields from Task 1.
- Produces: nullable columns `creation_source`, `creation_purpose`, `created_by_admin_id`, `created_by_name_snapshot`, `creation_note`, `creation_metadata`, and `last_customer_login_at` on `companies`.
- Produces: foreign key `companies.created_by_admin_id -> admin_users.id ON DELETE SET NULL` plus query indexes.

- [ ] **Step 1: Extend the local database smoke test and verify failure**

Assert all seven columns exist, the creator foreign key uses `ON DELETE SET NULL`, and indexes exist for source, purpose, creator, and customer-login timestamp.

Run: `npm run test:local`

Expected: FAIL because the columns do not exist.

- [ ] **Step 2: Write the additive migration**

Add nullable columns without defaults or backfill. Add SQL `CHECK` constraints that accept null for legacy records but restrict non-null source/purpose to the spec values. Add the foreign key only after `admin_users` exists in the migration and create the four indexes with deterministic names.

- [ ] **Step 3: Synchronize schema sources**

Add the mapped fields and creator relation to `prisma/schema.prisma`, and mirror the DDL in `prisma/init.sql`, `supabase/schema.sql`, and `supabase/platform-schema.sql` so fresh databases match migrated databases.

- [ ] **Step 4: Apply and verify locally**

Run: `npm run db:local:up`

Run: `npm run db:schema`

Run: `npm run prisma:generate`

Run: `npm run test:local`

Expected: migration succeeds and the local database smoke test prints its existing success marker.

- [ ] **Step 5: Verify creator deletion semantics**

Extend the smoke fixture to create an internal operator and company snapshot, delete the operator, and assert `created_by_admin_id IS NULL` while `created_by_name_snapshot` remains unchanged. Clean up only the fixture IDs.

- [ ] **Step 6: Commit**

```bash
git add prisma/migrations/20261008180000_registration_provenance prisma/schema.prisma prisma/init.sql supabase/schema.sql supabase/platform-schema.sql scripts/local-db-smoke.mjs
git commit -m "feat: store company registration provenance"
```

### Task 3: Record provenance across every company creation path

**Files:**
- Modify: `server.js`
- Modify: `src/lib/assisted-registration-publish.js`
- Modify: `src/lib/assisted-registration.js`
- Modify: `src/lib/assisted-registration-store.js`
- Modify: `scripts/core-flow-smoke.mjs`
- Modify: `scripts/assisted-registration-domain-test.mjs`
- Modify: `scripts/assisted-registration-api-smoke.mjs`
- Modify: `scripts/assisted-registration-publish-smoke.mjs`

**Interfaces:**
- Consumes: `normalizeRegistrationProvenance()` from Task 1 and database columns from Task 2.
- Produces: exactly one canonical `company.created` audit event per successfully created company.
- Produces: assisted-registration answers/attribution containing purpose, creation note, declared source, and optional tracking code before publication.

- [ ] **Step 1: Add failing public-signup assertions**

In `scripts/core-flow-smoke.mjs`, assert a new public signup persists `self_service/customer_request`, has no internal creator, normalizes missing attribution to `declared_source: "unknown"`, and creates exactly one `company.created` audit row containing sanitized attribution and request metadata.

- [ ] **Step 2: Add failing assisted and platform assertions**

Assert assisted publication stores `assisted`, the authenticated operator ID/name snapshot, submitted purpose/note/channel, and one audit event. Assert `lead_capture` without a trackable channel returns 422 before company creation. Add an API-level platform-company case that derives the operator from the authenticated session rather than accepting a payload operator ID.

- [ ] **Step 3: Wire public self-service creation**

In `createPortalSignup(req, data)`, normalize provenance before persistence, include `companyFields` in the company insert, and replace/augment `portal.signup.create` with the canonical `company.created` event. Keep the existing `created` rollback object and ensure audit failure invokes the same rollback path.

- [ ] **Step 4: Wire Central creation**

Change `createPlatformCompany(data, admin)` to `createPlatformCompany(req, data, admin)`, update its route call, validate provenance before writes, persist it, and record `company.created` with request metadata. Do not accept `created_by_admin_id` from `data`.

- [ ] **Step 5: Wire assisted publication transactionally**

Persist purpose/note/channel while creating or updating the assisted registration. In `publishAssistedRegistration(pool, id, actor, options)`, normalize provenance before opening writes, include company fields in the direct PostgreSQL insert, and insert `company.created` into `audit_logs` inside the existing transaction. Use the registration operator as the trusted actor and preserve its name snapshot.

- [ ] **Step 6: Define system-actor adapters**

For current import/API/automation company-creation call sites, pass stable identifiers such as `sales_automation`, `import:<job-name>`, or `api:<client-name>`. If no such creation call site exists today, expose a server helper requiring the identity and cover it with a contract test; do not add unused public endpoints.

- [ ] **Step 7: Run creation-flow verification**

Run: `npm run test:registration-provenance`

Run: `npm run test:flows`

Run: `node scripts/assisted-registration-api-smoke.mjs`

Run: `node scripts/assisted-registration-publish-smoke.mjs`

Expected: all pass and no failed case leaves a company or duplicate creation event.

- [ ] **Step 8: Commit**

```bash
git add server.js src/lib/assisted-registration-publish.js src/lib/assisted-registration.js src/lib/assisted-registration-store.js scripts/core-flow-smoke.mjs scripts/assisted-registration-domain-test.mjs scripts/assisted-registration-api-smoke.mjs scripts/assisted-registration-publish-smoke.mjs
git commit -m "feat: trace every new company registration"
```

### Task 4: Track genuine customer login separately

**Files:**
- Modify: `server.js`
- Modify: `scripts/security-hardening-smoke.mjs`
- Modify: `scripts/core-flow-smoke.mjs`
- Modify: `scripts/platform-client-query-regression.mjs`

**Interfaces:**
- Consumes: `companies.last_customer_login_at` from Task 2.
- Produces: `markDirectCustomerLogin(adminId, occurredAt)` that updates both `admin_users.last_login_at` and the authenticated admin's company timestamp only after complete direct authentication.
- Preserves: Central impersonation and internal operations do not call this function.

- [ ] **Step 1: Add failing authentication tests**

Cover successful password login, successful completion of 2FA, invalid credentials, a pending 2FA challenge, and Central support impersonation. Assert the company timestamp changes only after successful direct authentication.

- [ ] **Step 2: Replace the login marker**

Replace `markAdminLogin(adminId)` with `markDirectCustomerLogin(adminId, occurredAt = new Date())`. Update `admin_users.last_login_at`, then update `companies.last_customer_login_at` only when `admin.company_id` exists. Call it after password authentication when no 2FA is required and after successful 2FA verification otherwise.

- [ ] **Step 3: Guard internal paths**

Verify `createPlatformImpersonation` and store switching never call the direct-login marker. Preserve their existing audit events so internal activity remains visible without changing customer-access state.

- [ ] **Step 4: Run focused verification**

Run: `npm run test:security-hardening`

Run: `npm run test:flows`

Run: `node scripts/platform-client-query-regression.mjs`

Expected: direct login updates the timestamp; all excluded paths leave it unchanged.

- [ ] **Step 5: Commit**

```bash
git add server.js scripts/security-hardening-smoke.mjs scripts/core-flow-smoke.mjs scripts/platform-client-query-regression.mjs
git commit -m "feat: distinguish customer login from internal activity"
```

### Task 5: Expose provenance, access state, filters, and timeline through the Central API

**Files:**
- Modify: `server.js`
- Modify: `src/lib/platform-metrics-exclusions.js`
- Modify: `scripts/platform-client-query-regression.mjs`
- Modify: `scripts/platform-client-list-smoke.mjs`
- Modify: `scripts/platform-metrics-exclusions-smoke.mjs`

**Interfaces:**
- Consumes: company provenance fields and `last_customer_login_at` from Tasks 2–4.
- Produces: query parameters `creation_source`, `creation_purpose`, `created_by_admin_id`, and `customer_access` (`never` or `accessed`) on `GET /api/platform/companies`.
- Produces: list/detail fields `provenance`, `customer_access_state`, and `last_customer_login_at`; legacy records return `provenance.state = "legacy_untracked"`.

- [ ] **Step 1: Write failing API query tests**

Create fixtures for self-service, lead capture, internal test, accessed, never-accessed, and legacy rows. Assert individual and combined filters, stable pagination, null legacy handling, and rejection of unsupported filter values with HTTP 422.

- [ ] **Step 2: Apply filters before pagination**

Extend `listPlatformCompanies(params)` to validate filter values and pass PostgREST filters into the initial `companies` query before limit/offset. Use `is.null`/`not.is.null` for customer-access state and exact equality for source, purpose, and creator.

- [ ] **Step 3: Replace inferred access metrics**

Set list and detail `metrics.last_access_at` from `company.last_customer_login_at`, not the maximum administrator login. Return an explicit access-state value and retain per-admin timestamps only in the diagnostic admin list.

- [ ] **Step 4: Add provenance to detail and timeline**

Return a normalized provenance view from company fields. Ensure `buildPlatformCompanyTimeline` labels `company.created`, shows actor snapshot/source/purpose/note, and does not confuse it with `portal.signup.create` or assisted activation.

- [ ] **Step 5: Exclude internal tests consistently**

Extend platform metric exclusion helpers so `creation_purpose = internal_test` is excluded alongside existing demo identifiers without changing legacy behavior.

- [ ] **Step 6: Run API and metric tests**

Run: `node scripts/platform-client-query-regression.mjs`

Run: `npm run test:plans`

Run: `node scripts/platform-metrics-exclusions-smoke.mjs`

Expected: all filter, pagination, access-state, legacy, timeline, and exclusion assertions pass.

- [ ] **Step 7: Commit**

```bash
git add server.js src/lib/platform-metrics-exclusions.js scripts/platform-client-query-regression.mjs scripts/platform-client-list-smoke.mjs scripts/platform-metrics-exclusions-smoke.mjs
git commit -m "feat: expose registration provenance in Central API"
```

### Task 6: Add required creation fields and provenance views to the Central UI

**Files:**
- Modify: `public/platform.html`
- Modify: `public/platform.js`
- Modify: `public/platform.css`
- Modify: `public/platform-assisted-registration.js`
- Modify: `public/platform-client-list.js`
- Modify: `scripts/assisted-registration-ui-smoke.mjs`
- Modify: `scripts/platform-client-list-smoke.mjs`
- Create: `scripts/registration-provenance-ui-smoke.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 5 list/detail API fields and filters.
- Produces: required assisted/manual creation inputs for purpose, declared channel, note, and optional tracking code.
- Produces: Central list/detail labels for origin, purpose, creator, legacy state, and genuine customer access.

- [ ] **Step 1: Write failing static/UI helper tests**

Assert the assisted form contains required `creation_purpose` and `creation_note`; `lead_capture` requires a non-unknown channel; payloads never contain a browser-supplied operator ID; list helpers label all enum values; legacy renders `Legado sem rastreamento`; null login renders `Cliente nunca acessou`; and filter query strings combine source, purpose, creator, access state, page, and page size.

- [ ] **Step 2: Extend creation forms**

Add purpose, declared channel, creation note, and tracking-code controls to assisted creation and the existing Central manual-company flow. Default assisted purpose to `customer_request` only when explicitly confirmed by the operator; do not silently classify new records as lead capture. Add conditional browser validation for the lead-capture channel while retaining server authority.

- [ ] **Step 3: Extend client list filters and cards**

Add filters for source, purpose, responsible operator, and customer-access state. Update request construction and pagination preservation. Render concise provenance/access labels in the compact card without removing current commercial metrics.

- [ ] **Step 4: Extend company detail and timeline**

Show source, purpose, creator snapshot, note, attribution summary, created timestamp, and `Nunca acessou`/last direct login. Render `company.created` as the first provenance event when present and a neutral legacy notice otherwise.

- [ ] **Step 5: Update cache versions and accessibility**

Bump static asset query versions in `public/platform.html`. Ensure new labels are associated with controls, status text is readable by assistive technology, keyboard navigation remains intact, and mobile layout does not overflow.

- [ ] **Step 6: Run UI checks**

Add `test:registration-provenance-ui` to `package.json`.

Run: `npm run test:assisted-registration-ui`

Run: `npm run test:registration-provenance-ui`

Run: `node scripts/platform-client-list-smoke.mjs`

Run: `npm run test:syntax`

Expected: all pass with the new cache version and UI contract.

- [ ] **Step 7: Commit**

```bash
git add public/platform.html public/platform.js public/platform.css public/platform-assisted-registration.js public/platform-client-list.js scripts/assisted-registration-ui-smoke.mjs scripts/platform-client-list-smoke.mjs scripts/registration-provenance-ui-smoke.mjs package.json
git commit -m "feat: show registration provenance in Central"
```

### Task 7: End-to-end regression and release evidence

**Files:**
- Create: `scripts/registration-provenance-release-regression.mjs`
- Modify: `package.json`
- Modify: `docs/superpowers/plans/2026-10-08-registration-provenance.md`

**Interfaces:**
- Consumes: all behavior from Tasks 1–6.
- Produces: one repeatable local regression command and an updated plan record containing outcomes and any deviations.

- [ ] **Step 1: Write the end-to-end regression script**

Against the local database/server, create a self-service company, an assisted lead-capture company, an internal-test company, and a legacy fixture. Verify fields, exactly one immutable creation event, list/detail filters, last customer login, impersonation exclusion, and sanitized audit payloads. Use unique fixture identifiers and clean up only those identifiers in `finally`.

- [ ] **Step 2: Add the release-regression command**

Add `test:registration-provenance-release` to `package.json` and include the focused provenance tests in `test:all` after `test:local`.

- [ ] **Step 3: Run focused regression**

Run: `npm run test:registration-provenance-release`

Expected: `Registration provenance release regression: OK`.

- [ ] **Step 4: Run the complete verification suite**

Run: `npm run test:all`

Expected: exit code 0 with every project smoke suite passing.

- [ ] **Step 5: Review the final diff and migration safety**

Run: `git diff --check HEAD~6..HEAD`

Run: `git status --short`

Confirm no unrelated files are staged, no production command was run, the migration is additive, and legacy rows require no backfill.

- [ ] **Step 6: Update implementation outcomes**

Append a concise implementation outcome to this plan: completed behavior, exact verification commands/results, migration name, remaining operational production steps, and any design deviations with reasons.

- [ ] **Step 7: Commit**

```bash
git add scripts/registration-provenance-release-regression.mjs package.json docs/superpowers/plans/2026-10-08-registration-provenance.md
git commit -m "test: verify registration provenance end to end"
```
