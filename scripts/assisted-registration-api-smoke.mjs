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

try {
  await client.connect();
  await client.query("delete from public.assisted_registrations where establishment_name = 'Lancheria Smoke'");
  const fixture = await createFixture();
  ({ companyId, platformAdminId, regularAdminId } = fixture);
  server = await startServer();

  const platformCookie = await login(fixture.platformEmail);
  const regularCookie = await login(fixture.regularEmail);

  const denied = await request('/api/platform/assisted-registrations', { cookie: regularCookie, allowFailure: true });
  assert.equal(denied.status, 403, 'Administrador comum nao pode acessar cadastros assistidos.');

  const payload = {
    responsible_name: 'Contato Smoke',
    phone: '(55) 9 9100-2200',
    email: `lead-${suffix}@example.test`,
    establishment_name: 'Lancheria Smoke',
    document: formatCpf(generateCpf()),
    answers: { establishment: { city: 'Horizontina' } },
    attribution: { utm_source: 'instagram', utm_campaign: 'smoke' }
  };
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
  const reviewedMenu = await request(`/api/platform/assisted-registrations/${registrationId}/menu-draft/review`, { method: 'POST', cookie: platformCookie, body: {} });
  assert.equal(reviewedMenu.data.status, 'ready_to_publish');
  assert.ok(reviewedMenu.data.menu_draft.reviewed_hash);

  for (const query of ['Contato%20Smoke', encodeURIComponent(payload.document), '55991002200']) {
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
  assert.equal(published.data.store.is_active, false);
  assert.ok(!('token' in published.data.activation), 'Token de ativação não pode vazar na API.');
  const repeatedPublish = await request(`/api/platform/assisted-registrations/${registrationId}/publish`, { method: 'POST', cookie: platformCookie, body: { confirm: true } });
  assert.equal(repeatedPublish.data.company.id, published.data.company.id, 'Publicação repetida precisa ser idempotente.');

  console.log('Assisted registration API smoke: OK');
} finally {
  if (server) server.kill();
  if (client._connected) {
    await client.query("delete from public.assisted_registrations where establishment_name = 'Lancheria Smoke'").catch(() => {});
    await client.query('delete from public.admin_user_store_access where admin_user_id = any($1::uuid[])', [[platformAdminId, regularAdminId].filter(Boolean)]).catch(() => {});
    await client.query('delete from public.admin_users where id = any($1::uuid[])', [[platformAdminId, regularAdminId].filter(Boolean)]).catch(() => {});
    if (publishedCompanyId) await client.query('delete from public.companies where id = $1', [publishedCompanyId]).catch(() => {});
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

async function startServer() {
  const child = spawn(process.execPath, ['server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), COOKIE_SECURE: 'false', ADMIN_2FA_REQUIRED: 'false', APP_URL: baseUrl, PUBLIC_APP_URL: baseUrl }, stdio: ['ignore', 'pipe', 'pipe'] });
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
