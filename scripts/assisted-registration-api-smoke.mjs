import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';

loadEnv(new URL('../.env', import.meta.url));
assert.ok(process.env.DATABASE_URL, 'DATABASE_URL precisa estar configurado.');

const port = 3600 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;
const suffix = randomUUID();
const password = 'AssistedSmoke123!';
const fixtureIp = `198.51.100.${20 + Math.floor(Math.random() * 180)}`;
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: shouldUseSsl(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false });
let server;
let companyId;
let platformAdminId;
let regularAdminId;
let publishedCompanyId;
let platformCreatedCompanyId;

try {
  await client.connect();
  await client.query("delete from public.assisted_registrations where establishment_name = 'Lancheria Smoke'");
  const fixture = await createFixture();
  ({ companyId, platformAdminId, regularAdminId } = fixture);
  server = await startServer();

  const platformCookie = await login(fixture.platformEmail);
  const regularCookie = await login(fixture.regularEmail);

  const manual = await request('/api/platform/companies', {
    method: 'POST', cookie: platformCookie,
    body: { name: `Manual ${suffix}`, email: `manual-${suffix}@example.test`, purpose: 'internal_test', note: 'Fixture da Central.', declared_source: 'internal', created_by_admin_id: regularAdminId }
  });
  platformCreatedCompanyId = manual.data.company.id;
  const manualStored = (await client.query('select creation_source,creation_purpose,created_by_admin_id,created_by_name_snapshot from companies where id=$1', [platformCreatedCompanyId])).rows[0];
  assert.equal(manualStored.creation_source, 'platform_admin');
  assert.equal(manualStored.creation_purpose, 'internal_test');
  assert.equal(manualStored.created_by_admin_id, platformAdminId, 'Operador precisa vir da sessao autenticada.');
  assert.equal(manualStored.created_by_name_snapshot, 'Platform');
  const filteredManual = await request('/api/platform/companies?creation_source=platform_admin&creation_purpose=internal_test&customer_access=never&page=1&per_page=25', { cookie: platformCookie });
  assert(filteredManual.data.companies.some((company) => company.id === platformCreatedCompanyId), 'Filtros combinados precisam preservar o cadastro manual esperado.');
  assert(filteredManual.data.companies.every((company) => company.creation_source === 'platform_admin' && company.creation_purpose === 'internal_test' && company.customer_access_state === 'never'));
  assert.equal(filteredManual.data.pagination.page, 1);
  assert.ok(filteredManual.data.creation_creators.some((creator) => creator.id === platformAdminId), 'Criadores precisam ser listados fora da pagina filtrada.');
  const filteredSecondPage = await request(`/api/platform/companies?creation_source=platform_admin&creation_purpose=internal_test&created_by_admin_id=${platformAdminId}&customer_access=never&page=2&per_page=25`, { cookie: platformCookie });
  assert.equal(filteredSecondPage.data.pagination.page, 2, 'Filtros combinados precisam preservar a pagina solicitada.');
  await client.query(`insert into audit_logs (company_id,action,entity_type,entity_id,after_data,created_at) select $1::uuid,'platform.client.note','company',$1::uuid,jsonb_build_object('note','Nota ' || value),now() + (value || ' seconds')::interval from generate_series(1,65) value`, [platformCreatedCompanyId]);
  const manualDetail = await request(`/api/platform/companies/${platformCreatedCompanyId}/detail`, { cookie: platformCookie });
  assert.ok(manualDetail.data.timeline.some((event) => event.title === 'Cadastro criado'), 'Timeline longa precisa preservar o evento original de criacao.');
  const advancedTimeline = await request(`/api/platform/companies/${platformCreatedCompanyId}/timeline`, { cookie: platformCookie });
  assert.ok(advancedTimeline.data.timeline.some((event) => event.title === 'Cadastro criado'), 'Timeline avançada precisa preservar a criação após o limite de eventos.');
  const invalidFilter = await request('/api/platform/companies?creation_source=not-real', { cookie: platformCookie, allowFailure: true });
  assert.equal(invalidFilter.status, 422, 'Filtro de origem desconhecido precisa ser rejeitado.');
  const legacyList = await request('/api/platform/companies?customer_access=accessed', { cookie: platformCookie });
  const legacyFixture = legacyList.data.companies.find((company) => company.id === companyId);
  assert.equal(legacyFixture?.provenance?.state, 'legacy_untracked');

  const denied = await request('/api/platform/assisted-registrations', { cookie: regularCookie, allowFailure: true });
  assert.equal(denied.status, 403, 'Administrador comum nao pode acessar cadastros assistidos.');

  const payload = {
    responsible_name: 'Contato Smoke',
    phone: `559${String(Math.floor(Math.random()*100000000)).padStart(8,'0')}`,
    email: `lead-${suffix}@example.test`,
    establishment_name: 'Lancheria Smoke',
    document: formatCpf(generateCpf()),
    answers: { establishment: { city: 'Horizontina' }, provenance: { purpose: 'lead_capture', note: 'Cardapio criado para prospeccao.' } },
    attribution: { declared_source: 'instagram', utm_source: 'instagram', utm_campaign: 'smoke' }
  };
  const invalidLeadEmail = `invalid-lead-${suffix}@example.test`;
  const invalidLead = await request('/api/platform/assisted-registrations', {
    method: 'POST', cookie: platformCookie, allowFailure: true,
    body: { ...payload, phone: `558${String(Math.floor(Math.random()*100000000)).padStart(8,'0')}`, email: invalidLeadEmail, document: formatCpf(generateCpf()), attribution: {}, answers: { ...payload.answers, provenance: { purpose: 'lead_capture', note: 'Sem canal.' } } }
  });
  assert.equal(invalidLead.status, 422, 'Lead sem canal rastreavel precisa ser rejeitado.');
  assert.equal((await client.query('select count(*)::int count from companies where billing_email=$1', [invalidLeadEmail])).rows[0].count, 0);
  const documentDigits = payload.document.replace(/\D/g, '');
  const created = await request('/api/platform/assisted-registrations', { method: 'POST', cookie: platformCookie, body: payload });
  assert.equal(created.status, 201);
  assert.match(created.data.registration.document_masked, /\*{3}/);
  assert.ok(!JSON.stringify(created.data).includes(documentDigits), 'Documento completo vazou na resposta.');
  const registrationId = created.data.registration.id;

  const uploaded = await request(`/api/platform/assisted-registrations/${registrationId}/files`, { method: 'POST', cookie: platformCookie, body: { name: 'menu.txt', mime_type: 'text/plain', data_base64: Buffer.from('Lanches\nXis - R$ 25,00').toString('base64') } });
  assert.equal(uploaded.status, 201);
  assert.ok(!JSON.stringify(uploaded.data).includes('storage_key'), 'Caminho privado não pode vazar na API.');
  const imported = await request(`/api/platform/assisted-registrations/${registrationId}/import`, { method: 'POST', cookie: platformCookie, body: {} });
  assert.equal(imported.data.menu_draft.content.categories[0].items[0].price_cents, 2500);
  const menuDraft = await request(`/api/platform/assisted-registrations/${registrationId}/menu-draft`, { cookie: platformCookie });
  assert.equal(menuDraft.data.menu_draft.registration_id, registrationId);
  const patchedMenu = await request(`/api/platform/assisted-registrations/${registrationId}/menu-draft`, { method: 'PATCH', cookie: platformCookie, body: { expected_version: 1, operations: [] } });
  assert.equal(patchedMenu.data.menu_draft.version, 2);
  const reviewedMenu = await request(`/api/platform/assisted-registrations/${registrationId}/menu-draft/review`, { method: 'POST', cookie: platformCookie, body: { expected_version: patchedMenu.data.menu_draft.version } });
  assert.equal(reviewedMenu.data.status, 'ready_to_publish');
  assert.ok(reviewedMenu.data.menu_draft.reviewed_hash);

  for (const query of ['Contato%20Smoke', encodeURIComponent(payload.document), payload.phone]) {
    const listed = await request(`/api/platform/assisted-registrations?q=${query}`, { cookie: platformCookie });
    assert.ok(listed.data.registrations.some((item) => item.id === registrationId), 'Busca nao encontrou o rascunho esperado.');
    assert.ok(!JSON.stringify(listed.data).includes(documentDigits), 'Busca expos documento completo.');
  }

  const duplicate = await request('/api/platform/assisted-registrations', { method: 'POST', cookie: platformCookie, body: { ...payload, document: payload.document.replace(/\D/g, '') }, allowFailure: true });
  assert.equal(duplicate.status, 409, 'Documento duplicado deve impedir novo rascunho.');
  assert.ok(Array.isArray(duplicate.data.duplicates) && duplicate.data.duplicates.length > 0);

  const fetched = await request(`/api/platform/assisted-registrations/${registrationId}`, { cookie: platformCookie });
  const versionBeforeUpdate = fetched.data.registration.version;
  const updated = await request(`/api/platform/assisted-registrations/${registrationId}`, { method: 'PATCH', cookie: platformCookie, body: { expected_version: versionBeforeUpdate, responsible_name: 'Contato Atualizado' } });
  assert.equal(updated.data.registration.version, versionBeforeUpdate + 1);
  const stale = await request(`/api/platform/assisted-registrations/${registrationId}`, { method: 'PATCH', cookie: platformCookie, body: { expected_version: versionBeforeUpdate, responsible_name: 'Conflito' }, allowFailure: true });
  assert.equal(stale.status, 409, 'Autosave com versao antiga deve retornar conflito.');

  const published = await request(`/api/platform/assisted-registrations/${registrationId}/publish`, { method: 'POST', cookie: platformCookie, body: { confirm: true } });
  publishedCompanyId = published.data.company.id;
  assert.equal(published.data.subscription.status, 'pending_activation');
  assert.equal(published.data.subscription.trial_ends_at, null);
  assert.equal(published.data.company.status, 'onboarding');
  assert.equal(published.data.store.is_active, true);
  assert.ok(!('token' in published.data.activation), 'Token de ativação não pode vazar na API.');
  const repeatedPublish = await request(`/api/platform/assisted-registrations/${registrationId}/publish`, { method: 'POST', cookie: platformCookie, body: { confirm: true } });
  assert.equal(repeatedPublish.data.company.id, published.data.company.id, 'Publicação repetida precisa ser idempotente.');
  const traced = (await client.query('select creation_source,creation_purpose,created_by_admin_id,created_by_name_snapshot,creation_note,creation_metadata from companies where id=$1', [publishedCompanyId])).rows[0];
  assert.equal(traced.creation_source, 'assisted');
  assert.equal(traced.creation_purpose, 'lead_capture');
  assert.equal(traced.created_by_admin_id, platformAdminId);
  assert.equal(traced.created_by_name_snapshot, 'Platform');
  assert.equal(traced.creation_note, 'Cardapio criado para prospeccao.');
  assert.equal(traced.creation_metadata.declared_source, 'instagram');
  const assistedAudit = await client.query("select count(*)::int count from audit_logs where company_id=$1 and action='company.created'", [publishedCompanyId]);
  assert.equal(assistedAudit.rows[0].count, 1, 'Publicacao repetida nao pode duplicar company.created.');

  server.kill();
  await new Promise((resolve) => server.once('exit', resolve));
  server = await startServer({ TEST_FORCE_REQUIRED_AUDIT_FAILURE_ACTION: 'company.created' });
  const failureCookie = await login(fixture.platformEmail);
  const rollbackName = `Rollback ${suffix}`;
  const failedManual = await request('/api/platform/companies', {
    method: 'POST', cookie: failureCookie, allowFailure: true,
    body: { name: rollbackName, email: `rollback-${suffix}@example.test`, purpose: 'internal_test', note: 'Teste de rollback obrigatório.', declared_source: 'test' }
  });
  assert.equal(failedManual.status, 500, `Falha da auditoria obrigatoria precisa impedir a criacao manual: ${JSON.stringify(failedManual.data)}`);
  assert.equal((await client.query('select count(*)::int count from companies where name=$1', [rollbackName])).rows[0].count, 0, 'Falha da auditoria precisa reverter a empresa manual.');
  const publicRollbackName = `Public rollback ${suffix}`;
  const publicRollback = await request('/api/portal/signup', {
    method: 'POST', allowFailure: true,
    body: { plan_code: 'essential', accept_terms: true, owner: { name: 'Rollback Publico', email: `public-rollback-${suffix}@example.test`, phone: '5511999999999', document: formatCpf(generateCpf()), password, confirm_password: password }, business: { name: publicRollbackName, display_name: publicRollbackName, type: 'restaurante', city: 'Horizontina', state: 'RS', slug: `rollback-${suffix}`.slice(0, 50) } }
  });
  assert.equal(publicRollback.status, 500, 'Falha da auditoria obrigatoria precisa impedir o cadastro publico.');
  assert.equal((await client.query('select count(*)::int count from companies where name=$1', [publicRollbackName])).rows[0].count, 0, 'Falha da auditoria precisa reverter a empresa publica.');

  const assistedRollbackName = `Assisted rollback ${suffix}`;
  const rollbackDraft = await request('/api/platform/assisted-registrations', { method: 'POST', cookie: failureCookie, body: { ...payload, establishment_name: assistedRollbackName, email: `assisted-rollback-${suffix}@example.test`, phone: `557${String(Math.floor(Math.random()*100000000)).padStart(8,'0')}`, document: formatCpf(generateCpf()) } });
  const rollbackRegistrationId = rollbackDraft.data.registration.id;
  const rollbackImport = await request(`/api/platform/assisted-registrations/${rollbackRegistrationId}/import`, { method: 'POST', cookie: failureCookie, body: { text: 'Lanches\nXis - R$ 25,00' } });
  await request(`/api/platform/assisted-registrations/${rollbackRegistrationId}/menu-draft/review`, { method: 'POST', cookie: failureCookie, body: { expected_version: rollbackImport.data.menu_draft.version } });
  const failedAssisted = await request(`/api/platform/assisted-registrations/${rollbackRegistrationId}/publish`, { method: 'POST', cookie: failureCookie, allowFailure: true, body: { confirm: true } });
  assert.equal(failedAssisted.status, 500, 'Falha da auditoria obrigatoria precisa impedir a publicacao assistida.');
  assert.equal((await client.query('select count(*)::int count from companies where name=$1', [assistedRollbackName])).rows[0].count, 0, 'Transacao assistida precisa reverter a empresa sem auditoria.');

  console.log('Assisted registration API smoke: OK');
} finally {
  if (server) server.kill();
  if (client._connected) {
    await client.query("delete from public.assisted_registrations where establishment_name = 'Lancheria Smoke'").catch(() => {});
    await client.query('delete from public.assisted_registrations where establishment_name = $1', [`Assisted rollback ${suffix}`]).catch(() => {});
    await client.query('delete from public.admin_user_store_access where admin_user_id = any($1::uuid[])', [[platformAdminId, regularAdminId].filter(Boolean)]).catch(() => {});
    await client.query('delete from public.admin_users where id = any($1::uuid[])', [[platformAdminId, regularAdminId].filter(Boolean)]).catch(() => {});
    if (publishedCompanyId) await client.query('delete from public.companies where id = $1', [publishedCompanyId]).catch(() => {});
    if (platformCreatedCompanyId) await client.query('delete from public.companies where id = $1', [platformCreatedCompanyId]).catch(() => {});
    if (companyId) await client.query('delete from public.companies where id = $1', [companyId]).catch(() => {});
    await client.end();
  }
}

async function createFixture() {
  const platformEmail = `platform-${suffix}@example.test`;
  const regularEmail = `regular-${suffix}@example.test`;
  const company = (await client.query(`insert into public.companies (name, status) values ($1, 'trial') returning id`, [`Assisted ${suffix}`])).rows[0];
  const platform = (await client.query(`insert into public.admin_users (company_id,name,email,password_hash,role,is_active) values ($1,'Platform',$2,$3,'superadmin',true) returning id`, [company.id, platformEmail, hashPassword(password)])).rows[0];
  const regular = (await client.query(`insert into public.admin_users (company_id,name,email,password_hash,role,is_active) values ($1,'Regular',$2,$3,'admin',true) returning id`, [company.id, regularEmail, hashPassword(password)])).rows[0];
  return { companyId: company.id, platformAdminId: platform.id, regularAdminId: regular.id, platformEmail, regularEmail };
}

async function login(email) {
  const result = await request('/api/admin/login', { method: 'POST', body: { email, password } });
  assert.ok(result.cookie);
  return result.cookie;
}

async function startServer(extraEnv = {}) {
  const child = spawn(process.execPath, ['server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), COOKIE_SECURE: 'false', ADMIN_2FA_REQUIRED: 'false', TRUSTED_PROXY_HOPS: '1', APP_URL: baseUrl, PUBLIC_APP_URL: baseUrl, NODE_ENV: 'test', ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk; });
  child.stderr.on('data', (chunk) => { logs += chunk; });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(logs);
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) return child; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  child.kill();
  throw new Error(`Servidor nao iniciou. ${logs}`);
}

async function request(path, options = {}) {
  const headers = { 'X-Forwarded-For': fixtureIp };
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(baseUrl + path, { method: options.method || 'GET', headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && !options.allowFailure) throw new Error(`${options.method || 'GET'} ${path}: ${response.status} ${data.error || ''}`);
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
}

function hashPassword(value) {
  const salt = randomBytes(16).toString('hex');
  const iterations = 310000;
  return `pbkdf2_sha256$${iterations}$${salt}$${pbkdf2Sync(value, salt, iterations, 32, 'sha256').toString('hex')}`;
}

function loadEnv(file) {
  try {
    const text = process.getBuiltinModule('fs').readFileSync(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {}
}

function shouldUseSsl(value) { return !/localhost|127\.0\.0\.1/i.test(String(value || '')); }

function generateCpf() {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  for (let position = 9; position <= 10; position += 1) {
    const total = base.slice(0, position).reduce((sum, digit, index) => sum + digit * (position + 1 - index), 0);
    const rest = (total * 10) % 11;
    base.push(rest === 10 ? 0 : rest);
  }
  return base.join('');
}
function formatCpf(value) { return `${value.slice(0, 3)}.${value.slice(3, 6)}.${value.slice(6, 9)}-${value.slice(9)}`; }
