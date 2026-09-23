import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';
import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';
import { assertSafePublicPayload, redactSensitive } from '../src/lib/security-redaction.js';

loadEnv(new URL('../.env', import.meta.url));

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente para o teste de seguranca.');

const port = Number(process.env.SECURITY_HARDENING_PORT || 4300 + Math.floor(Math.random() * 300));
const baseUrl = `http://127.0.0.1:${port}`;
const rateLimitTestSecret = randomBytes(24).toString('hex');
let child;
let syntheticCompanyId = '';

export async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

export async function startServer() {
  const processChild = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      APP_URL: baseUrl,
      PUBLIC_APP_URL: baseUrl,
      COOKIE_SECURE: 'false',
      APP_ENV: 'production',
      NODE_ENV: 'test',
      SKIP_SIGNUP_ACTIVATION_EMAIL: 'true',
      TRUSTED_PROXY_HOPS: '1',
      SECURITY_RATE_LIMIT_SECRET: rateLimitTestSecret
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  processChild.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  processChild.stderr.on('data', (chunk) => { logs += chunk.toString(); });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (processChild.exitCode !== null) throw new Error(`Servidor encerrou durante o boot.\n${logs}`);
    try {
      const health = await fetch(`${baseUrl}/api/health`);
      if (health.ok) return processChild;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  processChild.kill();
  throw new Error(`Servidor nao respondeu em ${baseUrl}.\n${logs}`);
}

export async function withSyntheticTenant(callback) {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: shouldUseSsl(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false
  });
  await client.connect();
  await client.query('begin');
  try {
    return await callback(client);
  } finally {
    await client.query('rollback').catch(() => {});
    await client.end().catch(() => {});
  }
}

try {
  child = await startServer();
  const health = await request('/api/health');
  assert.equal(health.response.status, 200);
  const suffix = randomBytes(6).toString('hex');
  const syntheticAdmin = await createSyntheticAdmin(suffix);
  syntheticCompanyId = syntheticAdmin.companyId;
  const sessionA = await adminLogin(syntheticAdmin.email, syntheticAdmin.password, '192.0.2.5');
  const sessionB = await adminLogin(syntheticAdmin.email, syntheticAdmin.password, '192.0.2.6');
  assert.equal(sessionA.response.status, 200);
  assert.equal(sessionB.response.status, 200);
  assertSafePublicPayload(sessionA.body.admin);
  assertSafePublicPayload(sessionB.body.admin);
  const redacted = redactSensitive({
    profile: { name: 'Teste', password_hash: 'senha-secreta', document: '00000000000' },
    authorization: 'Bearer token-secreto'
  });
  assert.equal(JSON.stringify(redacted).includes('senha-secreta'), false);
  assert.equal(JSON.stringify(redacted).includes('token-secreto'), false);
  assert.equal(JSON.stringify(redacted).includes('00000000000'), false);
  const cookieA = sessionCookieFrom(sessionA.response);
  const cookieB = sessionCookieFrom(sessionB.response);
  assert.match(sessionA.response.headers.get('set-cookie') || '', /HttpOnly/i);
  assert.match(sessionA.response.headers.get('set-cookie') || '', /Secure/i);
  assert.match(sessionA.response.headers.get('set-cookie') || '', /SameSite=Lax/i);
  assert.doesNotMatch(sessionA.response.headers.get('set-cookie') || '', /Domain=/i);
  const changed = await request('/api/admin/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieA },
    body: JSON.stringify({ current_password: syntheticAdmin.password, new_password: 'nova-senha-segura' })
  });
  assert.equal(changed.response.status, 200);
  assert.equal((await request('/api/admin/me', { headers: { Cookie: cookieA } })).response.status, 401);
  assert.equal((await request('/api/admin/me', { headers: { Cookie: cookieB } })).response.status, 401);
  const unknown = await timedLogin(`unknown-${suffix}@example.invalid`, '192.0.2.10');
  const wrong = await timedLogin(syntheticAdmin.email, '192.0.2.11');
  assert.equal(unknown.result.response.status, 401);
  assert.equal(wrong.result.response.status, 401);
  assert.equal(unknown.result.body.error, wrong.result.body.error);
  assert.ok(Math.abs(unknown.durationMs - wrong.durationMs) < 250, 'tempo permite distinguir conta existente');
  for (let index = 0; index < 8; index += 1) {
    await loginAttempt(`network-${suffix}-${index}@example.invalid`, `198.51.100.${10 + index * 0}`);
  }
  const blockedNetwork = await loginAttempt(`network-other-${suffix}@example.invalid`, '198.51.100.10');
  assert.equal(blockedNetwork.response.status, 429, 'limite por rede nao bloqueou a nona tentativa');
  assert.match(blockedNetwork.response.headers.get('retry-after') || '', /^\d+$/, '429 sem Retry-After');

  const equivalentIdentity = ` Identity-${suffix}@Example.Invalid `;
  for (let index = 0; index < 8; index += 1) {
    await loginAttempt(index % 2 ? equivalentIdentity.trim().toLowerCase() : equivalentIdentity, `203.0.113.${10 + index}`);
  }
  const blockedIdentity = await loginAttempt(equivalentIdentity.trim().toLowerCase(), '203.0.113.99');
  assert.equal(blockedIdentity.response.status, 429, 'limite por identidade normalizada nao bloqueou a nona tentativa');

  for (let index = 0; index < 8; index += 1) {
    await loginAttempt(`malformed-${suffix}-${index}@example.invalid`, 'valor-invalido, 192.0.2.44');
  }
  const blockedMalformedChain = await loginAttempt(`malformed-other-${suffix}@example.invalid`, 'outro-invalido, 192.0.2.44');
  assert.equal(blockedMalformedChain.response.status, 429, 'cadeia X-Forwarded-For malformada multiplicou o limite');
  console.log('Security hardening smoke: base HTTP OK');
} finally {
  if (syntheticCompanyId) await deleteSyntheticCompany(syntheticCompanyId);
  if (child && child.exitCode === null) {
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
  }
}

async function timedLogin(email, forwardedFor) {
  const startedAt = performance.now();
  const result = await loginAttempt(email, forwardedFor);
  return { result, durationMs: performance.now() - startedAt };
}

async function createSyntheticAdmin(suffix) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const companyId = randomUUID();
    const adminId = randomUUID();
    const email = `security-${suffix}@example.invalid`;
    const salt = randomBytes(16).toString('hex');
    const password = 'senha-valida-sintetica';
    const digest = pbkdf2Sync(password, salt, 310000, 32, 'sha256').toString('hex');
    const passwordHash = `pbkdf2_sha256$310000$${salt}$${digest}`;
    await client.query('insert into companies(id,name,status) values($1,$2,$3)', [companyId, `Security ${suffix}`, 'trial']);
    await client.query('insert into admin_users(id,company_id,name,email,password_hash,role,is_active) values($1,$2,$3,$4,$5,$6,true)', [adminId, companyId, 'Security Smoke', email, passwordHash, 'admin']);
    return { companyId, email, password };
  } finally {
    await client.end();
  }
}

async function deleteSyntheticCompany(companyId) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try { await client.query('delete from companies where id = $1', [companyId]); } finally { await client.end(); }
}

function loginAttempt(email, forwardedFor) {
  return request('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': forwardedFor },
    body: JSON.stringify({ email, password: 'senha-incorreta' })
  });
}

function adminLogin(email, password, forwardedFor) {
  return request('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': forwardedFor },
    body: JSON.stringify({ email, password })
  });
}

function sessionCookieFrom(response) {
  return String(response.headers.get('set-cookie') || '').split(';')[0];
}

function loadEnv(url) {
  if (!existsSync(url)) return;
  for (const line of readFileSync(url, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    process.env[key.trim()] ||= rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
}

function shouldUseSsl(value) {
  return process.env.DB_SSL === 'true' || /sslmode=require/i.test(String(value || ''));
}
