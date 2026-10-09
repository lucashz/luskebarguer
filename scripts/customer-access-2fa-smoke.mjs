import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { readFileSync } from 'node:fs';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (match) process.env[match[1]] ||= match[2].replace(/^['"]|['"]$/g, '');
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/i.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
const companyId = randomUUID(), adminId = randomUUID(), suffix = randomBytes(6).toString('hex');
const email = `two-factor-${suffix}@example.test`, password = 'TwoFactorSmoke123!', code = '654321';
const port = 4700 + Math.floor(Math.random() * 150), baseUrl = `http://127.0.0.1:${port}`;
let server;
try {
  await client.connect();
  const salt = randomBytes(16).toString('hex');
  const hash = `pbkdf2_sha256$310000$${salt}$${pbkdf2Sync(password, salt, 310000, 32, 'sha256').toString('hex')}`;
  await client.query("insert into companies(id,name,status) values($1,$2,'trial')", [companyId, `2FA ${suffix}`]);
  await client.query("insert into admin_users(id,company_id,name,email,password_hash,role,is_active) values($1,$2,'2FA Smoke',$3,$4,'superadmin',true)", [adminId, companyId, email, hash]);
  server = spawn(process.execPath, ['server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), APP_URL: baseUrl, PUBLIC_APP_URL: baseUrl, COOKIE_SECURE: 'false', NODE_ENV: 'test', ADMIN_2FA_REQUIRED: 'true', TEST_ADMIN_2FA_CODE: code }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (let i=0;i<80;i+=1) { try { if ((await fetch(`${baseUrl}/api/health`)).ok) break; } catch {} await new Promise((resolve)=>setTimeout(resolve,125)); }
  const login = await post('/api/admin/login', { email, password });
  assert.equal(login.status, 202);
  assert.equal(await lastAccess(), null, 'Desafio pendente não pode contar como acesso.');
  const wrong = await post('/api/admin/login/2fa', { challenge: login.data.challenge, code: '000000' });
  assert.equal(wrong.status, 401);
  assert.equal(await lastAccess(), null, 'Código 2FA inválido não pode contar como acesso.');
  const success = await post('/api/admin/login/2fa', { challenge: login.data.challenge, code });
  assert.equal(success.status, 200);
  assert.ok(await lastAccess(), '2FA válido precisa registrar acesso direto do cliente.');
  console.log('Customer access 2FA smoke: OK');
} finally {
  server?.kill();
  if (client._connected) { await client.query('delete from companies where id=$1', [companyId]).catch(()=>{}); await client.end(); }
}
async function post(path, body) { const response=await fetch(baseUrl+path,{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':'192.0.2.77'},body:JSON.stringify(body)}); return {status:response.status,data:await response.json().catch(()=>({}))}; }
async function lastAccess() { return (await client.query('select last_customer_login_at from companies where id=$1',[companyId])).rows[0]?.last_customer_login_at || null; }
