import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

loadEnv(new URL('../.env', import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL ausente.');
  process.exit(1);
}

const port = Number(process.env.PLATFORM_HEALTH_SMOKE_PORT || 3207 + Math.floor(Math.random() * 500));
const baseUrl = `http://127.0.0.1:${port}`;
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = '12345678';
const backupDir = new URL(`../.tmp/platform-health-${suffix}/backups/`, import.meta.url);
const uploadDir = new URL(`../.tmp/platform-health-${suffix}/uploads/`, import.meta.url);
const backupDirPath = fileURLToPath(backupDir);
const uploadDirPath = fileURLToPath(uploadDir);
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: shouldUseSsl(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false
});

let serverProcess = null;
let companyId = null;

try {
  await client.connect();
  await prepareDelayedBackup();
  const fixture = await createFixture();
  companyId = fixture.companyId;

  serverProcess = await startServer();

  await fetch(`${baseUrl}/api/health`);
  await fetch(`${baseUrl}/api/health`);

  const superLogin = await request('/api/admin/login', {
    method: 'POST',
    body: { email: fixture.superEmail, password }
  });
  assert(superLogin.cookie, 'Login do Admin Master nao retornou cookie.');

  const page = await fetch(`${baseUrl}/plataform`, { headers: { Cookie: superLogin.cookie } });
  assert(page.ok, '/plataform nao carregou o HTML da plataforma.');

  const health = await request('/api/platform/health?period=24h', { cookie: superLogin.cookie });
  assert(Array.isArray(health.data.statuses) && health.data.statuses.length >= 7, 'Status operacional incompleto.');
  assert(health.data.metrics?.api && health.data.metrics?.database && health.data.metrics?.checkout && health.data.metrics?.order_mutations, 'Metricas operacionais incompletas.');
  assert(Array.isArray(health.data.config?.items) && health.data.config.items.length >= 8, 'Checklist operacional incompleto.');
  assert(health.data.backup?.status, 'Monitoramento de backup nao retornou status.');
  assert(health.data.alerts?.some((alert) => alert.key === 'backup_delayed'), 'Backup atrasado nao gerou alerta.');

  const rawHealth = JSON.stringify(health.data);
  assert(!rawHealth.includes(process.env.DATABASE_URL), 'DATABASE_URL vazou na resposta de saude operacional.');
  assert(!rawHealth.includes('password_hash'), 'Campo sensivel password_hash vazou na resposta.');
  assert(!rawHealth.includes(password), 'Senha de teste vazou na resposta.');
  assert(!rawHealth.includes('Ã'), 'Resposta de saude operacional contem acentuacao quebrada.');

  const tenantLogin = await request('/api/admin/login', {
    method: 'POST',
    body: { email: fixture.adminEmail, password }
  });
  const denied = await request('/api/platform/health', {
    cookie: tenantLogin.cookie,
    allowFailure: true
  });
  assert(denied.status === 403, 'Admin comum acessou a saude operacional da plataforma.');

  console.log('Saude operacional da plataforma validada com sucesso.');
} finally {
  if (companyId) {
    await client.query('delete from public.companies where id = $1', [companyId]).catch(() => {});
  }
  await client.end().catch(() => {});
  if (serverProcess) {
    serverProcess.kill();
    await new Promise((resolve) => serverProcess.once('exit', resolve));
  }
  await rm(new URL(`../.tmp/platform-health-${suffix}/`, import.meta.url), { recursive: true, force: true }).catch(() => {});
}

async function createFixture() {
  const superEmail = `platform-super-${suffix}@cardapio.local`;
  const adminEmail = `platform-admin-${suffix}@cardapio.local`;
  const company = await client.query(`
    insert into public.companies (name, status, billing_email)
    values ($1, 'trial', $2)
    returning id
  `, [`Smoke Plataforma ${suffix}`, superEmail]);
  const createdCompanyId = company.rows[0].id;
  const store = await client.query(`
    insert into public.stores (company_id, name, slug, public_url, is_active)
    values ($1, $2, $3, $4, true)
    returning id
  `, [createdCompanyId, `Smoke Plataforma ${suffix}`, `platform-health-${suffix}`, `/platform-health-${suffix}`]);
  const storeId = store.rows[0].id;
  const superAdmin = await insertAdmin(createdCompanyId, superEmail, 'Admin Master Smoke', 'superadmin');
  const tenantAdmin = await insertAdmin(createdCompanyId, adminEmail, 'Admin Loja Smoke', 'admin');
  await linkAccess(superAdmin.id, createdCompanyId, storeId, 'superadmin');
  await linkAccess(tenantAdmin.id, createdCompanyId, storeId, 'admin');
  return { companyId: createdCompanyId, storeId, superEmail, adminEmail };
}

async function insertAdmin(targetCompanyId, email, name, role) {
  const result = await client.query(`
    insert into public.admin_users (company_id, name, email, password_hash, role, is_active)
    values ($1, $2, $3, $4, $5, true)
    returning id
  `, [targetCompanyId, name, email, hashPassword(password), role]);
  return result.rows[0];
}

async function linkAccess(adminUserId, targetCompanyId, storeId, role) {
  await client.query(`
    insert into public.admin_user_store_access (admin_user_id, company_id, store_id, role, permissions, is_active)
    values ($1, $2, $3, $4, array[]::text[], true)
  `, [adminUserId, targetCompanyId, storeId, role]);
}

async function prepareDelayedBackup() {
  await mkdir(backupDir, { recursive: true });
  await mkdir(uploadDir, { recursive: true });
  const backupFile = new URL('postgres-old.dump', backupDir);
  await writeFile(backupFile, 'old backup');
  const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
  await utimes(backupFile, oldDate, oldDate);
  await writeFile(new URL('backup-status.json', backupDir), JSON.stringify({
    status: 'success',
    finished_at: oldDate.toISOString(),
    updated_at: oldDate.toISOString(),
    output: 'postgres-old.dump',
    size_bytes: 10
  }));
}

async function startServer() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      COOKIE_SECURE: 'false',
      PLATFORM_BILLING_PROVIDER: 'mock',
      PLATFORM_BILLING_API_KEY: 'test-platform-key',
      PLATFORM_BILLING_WEBHOOK_SECRET: 'test-platform-secret',
      APP_URL: baseUrl,
      PUBLIC_APP_URL: baseUrl,
      BACKUP_DIR: backupDirPath,
      UPLOAD_DIR: uploadDirPath
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Servidor encerrou durante o boot.\n${logs}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return child;
    } catch {
      // Aguarda o servidor subir.
    }
    await delay(250);
  }
  child.kill();
  throw new Error(`Servidor nao respondeu em ${baseUrl}.\n${logs}`);
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  if (options.cookie) headers.Cookie = options.cookie;
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  const cookie = response.headers.get('set-cookie')?.split(';')[0] || options.cookie || '';
  if (!response.ok && !options.allowFailure) {
    throw new Error(`${options.method || 'GET'} ${path}: ${data.error || response.statusText}`);
  }
  return { status: response.status, data, cookie };
}

function hashPassword(value) {
  const salt = randomBytes(16).toString('hex');
  const iterations = 310000;
  const digest = pbkdf2Sync(value, salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$${iterations}$${salt}$${digest}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadEnv(url) {
  if (!existsSync(url)) return;
  const content = readFileSync(url, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    process.env[key.trim()] ||= rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
}

function shouldUseSsl(value) {
  return process.env.DB_SSL === 'true' || /sslmode=require/i.test(String(value || ''));
}
