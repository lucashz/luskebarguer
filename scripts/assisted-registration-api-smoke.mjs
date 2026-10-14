import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { createAssistedPreview } from '../src/lib/assisted-registration-preview.js';

const { default: sharp } = await import('sharp');

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
    phone: `559${String(Math.floor(Math.random()*100000000)).padStart(8,'0')}`,
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
  assert.equal(uploaded.data.file.purpose, 'menu_source');
  assert.ok(!JSON.stringify(uploaded.data).includes('storage_key'), 'Caminho privado não pode vazar na API.');
  const imported = await request(`/api/platform/assisted-registrations/${registrationId}/import`, { method: 'POST', cookie: platformCookie, body: {} });
  assert.equal(imported.data.import_run.status, 'completed');
  assert.equal(imported.data.menu_draft.content.categories[0].items[0].price_cents, 2500);
  const importStatus = await request(`/api/platform/assisted-registrations/${registrationId}/imports/${imported.data.import_run.id}`, { cookie: platformCookie });
  assert.equal(importStatus.data.import_run.product_count, 1);
  const photoBytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ff0000' } }).jpeg().toBuffer();
  const photo = await request(`/api/platform/assisted-registrations/${registrationId}/files`, { method: 'POST', cookie: platformCookie, body: { name: 'xis.jpg', mime_type: 'image/jpeg', purpose: 'product_photo', data_base64: photoBytes.toString('base64') } });
  const suggestions = await request(`/api/platform/assisted-registrations/${registrationId}/media-suggestions`, { cookie: platformCookie });
  assert.equal(suggestions.data.suggestions[0].file_id, photo.data.file.id);
  const draftItemId = imported.data.menu_draft.content.categories[0].items[0].id;
  const confirmedPhoto = await request(`/api/platform/assisted-registrations/${registrationId}/product-photos/${photo.data.file.id}/confirm`, { method: 'POST', cookie: platformCookie, body: { draft_item_id: draftItemId } });
  assert.equal(confirmedPhoto.data.link.status, 'confirmed');
  const menuDraft = await request(`/api/platform/assisted-registrations/${registrationId}/menu-draft`, { cookie: platformCookie });
  assert.equal(menuDraft.data.menu_draft.registration_id, registrationId);
  const patchedMenu = await request(`/api/platform/assisted-registrations/${registrationId}/menu-draft`, { method: 'PATCH', cookie: platformCookie, body: { expected_version: 1, operations: [] } });
  assert.equal(patchedMenu.data.menu_draft.version, 2);
  const reviewedMenu = await request(`/api/platform/assisted-registrations/${registrationId}/menu-draft/review`, { method: 'POST', cookie: platformCookie, body: { expected_version: patchedMenu.data.menu_draft.version } });
  assert.equal(reviewedMenu.data.status, 'ready_for_preview');
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

  const rollbackPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: shouldUseSsl(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false });
  await assert.rejects(() => createAssistedPreview(rollbackPool, registrationId, { id: platformAdminId }, { fail_at: 'after_menu' }), /injected_preview_failure/);
  assert.equal(Number((await client.query("select count(*) from companies where document=$1", [documentDigits])).rows[0].count), 0, 'Falha injetada precisa reverter empresa e loja.');
  await rollbackPool.end();
  const preview = await request(`/api/platform/assisted-registrations/${registrationId}/preview`, { method: 'POST', cookie: platformCookie, body: { confirm: true } });
  publishedCompanyId = preview.data.company.id;
  assert.equal(preview.data.registration.status, 'preview_created');
  assert.equal(preview.data.subscription.status, 'pending_activation');
  assert.equal(preview.data.subscription.trial_ends_at, null);
  assert.equal(preview.data.company.status, 'onboarding');
  assert.equal(preview.data.store.is_active, false);
  assert.equal(preview.data.admin.is_active, false);
  assert.equal(preview.data.registration.email_status, 'not_sent');
  assert.equal(preview.data.preview.orders_enabled, false);
  assert.ok(!JSON.stringify(preview.data).includes('token'), 'Prévia não pode criar nem expor token.');
  const repeatedPreview = await request(`/api/platform/assisted-registrations/${registrationId}/preview`, { method: 'POST', cookie: platformCookie, body: { confirm: true } });
  assert.equal(repeatedPreview.data.company.id, preview.data.company.id, 'Criação repetida da prévia precisa ser idempotente.');
  const previewAccess = await request(`/api/platform/assisted-registrations/${registrationId}/preview-access`, { method: 'POST', cookie: platformCookie, body: {} });
  assert.match(previewAccess.data.redirect_url, /admin\.html\?assisted_preview=1/);
  assert.ok(previewAccess.cookie, 'Acesso à prévia precisa criar cookie temporário HttpOnly.');
  const previewMenu = await request(`/${preview.data.store.slug}`, { cookie: previewAccess.cookie });
  assert.equal(previewMenu.status, 200, 'Sessão temporária precisa abrir o cardápio ainda inativo.');
  const previewMenuData = await request('/api/admin/menu-data', { cookie: previewAccess.cookie });
  const previewItemId = previewMenuData.data.categories[0].items[0].id;
  await request(`/api/items/${previewItemId}`, { method: 'PATCH', cookie: previewAccess.cookie, body: { price: 31.9 } });
  assert.equal((await client.query('select status from assisted_registrations where id=$1', [registrationId])).rows[0].status, 'preview_created', 'Ajuste no painel precisa invalidar uma revisão anterior.');
  const lockedUpload = await request(`/api/platform/assisted-registrations/${registrationId}/files`, { method: 'POST', cookie: platformCookie, body: { name: 'tardio.txt', mime_type: 'text/plain', purpose: 'menu_source', data_base64: Buffer.from('Xis 20').toString('base64') }, allowFailure: true });
  assert.equal(lockedUpload.status, 409, 'A Central não pode alterar fontes depois que a prévia existe.');
  const previewReviewed = await request(`/api/platform/assisted-registrations/${registrationId}/preview-review`, { method: 'POST', cookie: platformCookie, body: { menu_version: preview.data.registration.preview_menu_version } });
  assert.equal(previewReviewed.data.registration.status, 'preview_reviewed');
  const completed = await request(`/api/platform/assisted-registrations/${registrationId}/complete`, { method: 'POST', cookie: platformCookie, body: { confirm: true } });
  assert.equal(completed.data.registration.status, 'published');
  assert.ok(['sent','failed'].includes(completed.data.email_status));
  assert.ok(!JSON.stringify(completed.data).includes('token'), 'Token de ativação não pode vazar na API.');
  assert.equal(Number((await client.query("select count(*) from admin_activation_tokens where admin_user_id=$1 and status='pending'", [completed.data.activation.admin_id])).rows[0].count), 1);
  assert.equal((await client.query('select status from company_subscriptions where id=$1', [preview.data.subscription.id])).rows[0].status, 'pending_activation');
  assert.equal((await client.query('select is_active from stores where id=$1', [preview.data.store.id])).rows[0].is_active, false);
  await request(`/api/platform/assisted-registrations/${registrationId}/complete`, { method: 'POST', cookie: platformCookie, body: { confirm: true } });
  assert.equal(Number((await client.query("select count(*) from admin_activation_tokens where admin_user_id=$1 and status='pending'", [completed.data.activation.admin_id])).rows[0].count), 1, 'Clique duplo não pode criar outro token.');
  await request(`/api/platform/assisted-registrations/${registrationId}/resend-activation`, { method: 'POST', cookie: platformCookie, body: {} });
  assert.equal(Number((await client.query("select count(*) from admin_activation_tokens where admin_user_id=$1 and status='pending'", [completed.data.activation.admin_id])).rows[0].count), 1, 'Reenvio deve cancelar o token anterior.');

  console.log('Assisted registration API smoke: OK');
} finally {
  if (server) server.kill();
  if (client._connected) {
    await client.query("delete from public.assisted_registrations where establishment_name = 'Lancheria Smoke'").catch(() => {});
    await client.query('delete from public.admin_user_store_access where admin_user_id = any($1::uuid[])', [[platformAdminId, regularAdminId].filter(Boolean)]).catch(() => {});
    await client.query('delete from public.admin_users where id = any($1::uuid[])', [[platformAdminId, regularAdminId].filter(Boolean)]).catch(() => {});
    await client.query('delete from public.app_sessions where owner_id = any($1::uuid[])', [[platformAdminId, regularAdminId].filter(Boolean)]).catch(() => {});
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
