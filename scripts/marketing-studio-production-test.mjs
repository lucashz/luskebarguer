import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, scryptSync } from 'node:crypto';
import pg from 'pg';
import sharp from 'sharp';
import { createProductionStudio } from '../src/lib/marketing-studio-production.js';
import { provisionStudioAdministrator } from '../src/lib/marketing-studio-accounts.js';

// Every table and fixture is confined to a random schema; no clinic data is read.
const schema = 'studio_test_' + randomUUID().replaceAll('-', '');
assert.match(schema, /^studio_test_[a-f0-9]{32}$/);
const connectionString = process.env.DATABASE_URL?.replace(/\/[^/?]+(\?|$)/, '/clinica_estetica$1');
if (!connectionString) throw new Error('DATABASE_URL is required for isolated PostgreSQL tests');
const admin = new pg.Pool({ connectionString, max: 1 });
await admin.query(`CREATE SCHEMA ${schema}`);
const pool = new pg.Pool({ connectionString, options: `-c search_path=${schema}`, max: 8 });
const root = await mkdtemp(path.join(os.tmpdir(), 'studio-prod-test-'));
const password = randomUUID(); const salt = 'test-salt'; const passwordHash = `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
const clinicA = randomUUID(); const clinicB = randomUUID();
const brand = { name: 'Teste', color: '#345643', background: '#faf5ee', services: '', tone: 'claro', contact: '', logoId: '' };
const buffer = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#ccddee' } }).png().toBuffer();
let calls = 0; const apps = []; const servers = [];
async function launch(org, clinic) {
  const app = await createProductionStudio({ pool, organizationId: org, clinicId: clinic, root, origin: 'https://studio.test', config: { provider: 'openai', apiKey: 'fake' }, limits: { images: 2, captions: 2 }, imageRequest: async () => { calls++; await new Promise(r => setTimeout(r, 80)); return buffer; }, captionRequest: async () => 'Legenda teste' });
  apps.push(app);
  const server = createServer((req, res) => app.handle(req, res, () => { res.statusCode = 404; res.end(); })); servers.push(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let cookie = ''; let csrf = '';
  const api = (url, method = 'GET', data, headers = {}) => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path: url.startsWith('/clinic/') ? url.slice(7) : '/marketing' + url, method, headers: { Host: 'studio.test', Origin: 'https://studio.test', 'Content-Type': 'application/json', Cookie: cookie, 'X-Studio-Csrf': csrf, ...headers } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => { const raw = Buffer.concat(chunks); const value = String(res.headers['content-type']).includes('json') ? JSON.parse(raw) : raw; resolve({ status: res.statusCode, data: value, headers: res.headers }); });
    }); req.on('error', reject); req.end(data ? JSON.stringify(data) : undefined);
  });
  return { app, api, auth: async (username = org, secret = password) => {
    const result = await api('/api/login', 'POST', { username, password: secret, organizationId: 'evil' }); assert.equal(result.status, 200);
    const header = result.headers['set-cookie'][0]; assert.match(header, /Secure; HttpOnly; SameSite=Strict/); cookie = header.split(';')[0]; csrf = result.data.csrf;
  }, credentials: () => ({ Cookie: cookie, 'X-Studio-Csrf': csrf }) };
}
async function finished(client, key) {
  for (let i = 0; i < 100; i++) { const job = await client.api('/api/jobs/' + key); if (job.data.status !== 'running') return job.data; await new Promise(r => setTimeout(r, 20)); }
  throw new Error('job timed out');
}
try {
  await pool.query('CREATE TABLE clinic_admin_credentials(clinic_id uuid PRIMARY KEY,username text,password_hash text)');
  await pool.query('INSERT INTO clinic_admin_credentials VALUES($1,$2,$3),($4,$5,$3)', [clinicA, 'alpha', passwordHash, clinicB, 'beta']);
  const a = await launch('alpha', clinicA); const b = await launch('beta', clinicB);
  assert.equal((await a.api('/api/studio')).status, 401);
  assert.equal((await a.api('/api/generate', 'POST', { key: randomUUID(), kind: 'image' })).status, 401);
  assert.equal((await a.api('/api/login', 'POST', { username: 'alpha', password: 'wrong' })).status, 401);
  assert.equal((await a.api('/api/login', 'POST', { username: 'alpha', password }, { Origin: 'https://evil.test' })).status, 403);
  await a.auth(); await b.auth();
  const invite = await provisionStudioAdministrator(pool, 'alpha', 'lucas', 'Lucas');
  await assert.rejects(provisionStudioAdministrator(pool, 'alpha', 'lucas', 'Lucas'), /já existe/);
  assert.equal((await a.api('/api/login', 'POST', { username: 'lucas', password })).status, 401);
  const newSecret = 'Test123!';
  assert.equal((await a.api('/api/activate', 'POST', { token: invite.activationToken, password: 'short7!', confirmPassword: 'short7!' })).status, 422);
  assert.equal((await b.api('/api/activate', 'POST', { token: invite.activationToken, password: newSecret, confirmPassword: newSecret })).status, 422);
  assert.equal((await a.api('/api/activate', 'POST', { token: invite.activationToken, password: newSecret, confirmPassword: newSecret })).status, 200);
  assert.equal((await a.api('/api/activate', 'POST', { token: invite.activationToken, password: newSecret, confirmPassword: newSecret })).status, 422);
  const member = await launch('alpha', clinicA); await member.auth('lucas', newSecret);
  const clinicLogin = await a.api('/clinic/api/auth/login', 'POST', { username: 'alpha', password });
  assert.equal(clinicLogin.status, 200);
  assert.match(clinicLogin.headers['set-cookie'][0], /Path=\/; Secure; HttpOnly/);
  const clinicHeaders = { Cookie: clinicLogin.headers['set-cookie'][0].split(';')[0], 'X-Studio-Csrf': clinicLogin.data.csrf };
  assert.equal((await a.api('/clinic/api/auth/session', 'GET', null, clinicHeaders)).status, 200);
  assert.equal((await a.api('/api/studio', 'GET', null, clinicHeaders)).status, 200);
  assert.equal((await b.api('/api/studio', 'GET', null, clinicHeaders)).status, 401);
  assert.equal((await a.api('/clinic/api/auth/session', 'GET', null, { Cookie: '' })).status, 401);
  assert.equal((await member.api('/clinic/api/auth/login', 'POST', { username: 'lucas', password: newSecret })).status, 401);
  assert.equal((await member.api('/clinic/api/auth/session', 'GET', null, { Cookie: member.credentials().Cookie.replace('__Secure-studio_session', '__Secure-clinic_session') })).status, 401);
  assert.equal((await a.api('/clinic/api/auth/logout', 'POST', {}, { ...clinicHeaders, 'X-Studio-Csrf': 'wrong' })).status, 403);
  assert.equal((await a.api('/clinic/api/auth/logout', 'POST', {}, clinicHeaders)).status, 200);
  assert.equal((await a.api('/api/studio', 'GET', null, clinicHeaders)).status, 401);
  const user = (await member.api('/api/profile')).data;
  await pool.query('UPDATE marketing_studio_users SET clinic_access=true WHERE id=$1', [user.id]);
  const lucasLogin = await member.api('/clinic/api/auth/login', 'POST', { username: 'lucas', password: newSecret });
  assert.equal(lucasLogin.status, 200);
  const lucasHeaders = { Cookie: lucasLogin.headers['set-cookie'][0].split(';')[0] };
  assert.equal((await member.api('/clinic/api/auth/session', 'GET', null, lucasHeaders)).status, 200);
  assert.equal((await member.api('/api/studio', 'GET', null, lucasHeaders)).status, 200);
  assert.equal((await b.api('/api/studio', 'GET', null, lucasHeaders)).status, 401);
  await pool.query('UPDATE marketing_studio_users SET clinic_access=false WHERE id=$1', [user.id]);
  assert.equal((await member.api('/clinic/api/auth/session', 'GET', null, lucasHeaders)).status, 401);
  assert.equal(user.username, 'lucas'); assert.equal(user.role, 'admin'); assert.equal(user.sharedClinicPassword, false);
  assert.equal((await member.api('/api/profile', 'PUT', { displayName: 'Lucas Teste', email: 'lucas@example.test', userId: (await a.api('/api/profile')).data.id, role: 'owner' })).status, 200);
  assert.equal((await member.api('/api/profile')).data.displayName, 'Lucas Teste');
  assert.notEqual((await a.api('/api/profile')).data.displayName, 'Lucas Teste');
  assert.equal((await member.api('/api/profile/photo', 'PUT', { base64: buffer.toString('base64') })).status, 200);
  assert.equal((await sharp((await member.api('/api/profile/photo')).data).metadata()).width, 320);
  assert.equal((await a.api('/api/profile/photo')).status, 404);
  assert.equal((await member.api('/api/profile/photo', 'PUT', { remove: true })).status, 200);
  assert.equal((await member.api('/api/profile/photo')).status, 404);
  const changedSecret = randomUUID();
  assert.equal((await member.api('/api/profile/password', 'PUT', { currentPassword: newSecret, newPassword: 'short7!', confirmPassword: 'short7!' })).status, 422);
  assert.equal((await a.api('/')).headers['x-frame-options'], 'SAMEORIGIN');
  assert.match((await a.api('/')).headers['content-security-policy'], /frame-ancestors 'self'/);
  assert.equal((await member.api('/api/profile/password', 'PUT', { currentPassword: 'wrong', newPassword: changedSecret, confirmPassword: changedSecret })).status, 422);
  assert.equal((await member.api('/api/profile/password', 'PUT', { currentPassword: newSecret, newPassword: changedSecret, confirmPassword: changedSecret })).status, 200);
  assert.equal((await member.api('/api/studio')).status, 401);
  assert.equal((await a.api('/api/studio')).status, 200);
  await member.auth('lucas', changedSecret);
  assert.equal((await a.api('/api/brand', 'PUT', brand, { 'X-Studio-Csrf': 'bad' })).status, 403);
  assert.equal((await b.api('/api/studio', 'GET', null, a.credentials())).status, 401);
  await a.api('/api/brand', 'PUT', brand); await b.api('/api/brand', 'PUT', { ...brand, name: 'Beta' });
  const uploaded = await a.api('/api/references', 'POST', { name: 'ref.png', base64: buffer.toString('base64') }); assert.equal(uploaded.status, 201);
  assert.equal((await b.api('/api/assets/' + uploaded.data.id)).status, 404);
  const input = { kind: 'image', key: randomUUID(), subject: 'Assunto', format: '4:5', referenceIds: [uploaded.data.id] };
  assert.equal((await a.api('/api/generate', 'POST', input)).status, 202);
  assert.equal((await a.api('/api/generate', 'POST', input)).status, 202);
  const result = await finished(a, input.key); assert.equal(result.status, 'done'); assert.equal(calls, 1);
  assert.equal((await b.api('/api/jobs/' + input.key)).status, 404);
  const again = await launch('alpha', clinicA);
  assert.equal((await again.api('/api/studio', 'GET', null, a.credentials())).status, 200); // session survives handler restart
  const concurrent = { kind: 'image', key: randomUUID(), subject: 'Segundo', format: '9:16' };
  await Promise.all([a.app.store.generate('alpha', concurrent), again.app.store.generate('alpha', concurrent)]);
  assert.equal(calls, 2); assert.equal((await again.app.store.snapshot('alpha')).usage.images, 2);
  await assert.rejects(a.app.store.generate('alpha', { ...concurrent, key: randomUUID(), subject: 'Limite' }), /Limite/);
  assert.equal((await b.app.store.snapshot('beta')).usage.images, 0);
  const captionInput = { kind: 'caption', key: randomUUID(), ...result.result };
  await a.api('/api/generate', 'POST', captionInput); assert.equal((await finished(a, captionInput.key)).status, 'done');
  await a.api('/api/caption', 'PUT', { ...result.result, caption: 'Editada' });
  assert.equal((await a.app.store.snapshot('alpha')).posts.find(p => p.id === result.result.postId).versions[0].caption, 'Editada');
  assert.equal((await a.api('/api/logout', 'POST', {})).status, 200); assert.equal((await a.api('/api/studio')).status, 401);
  await a.auth(); await pool.query("UPDATE clinic_admin_credentials SET password_hash='changed' WHERE clinic_id=$1", [clinicA]);
  assert.equal((await a.api('/api/studio')).status, 401);
  for (let i = 0; i < 10; i++) await b.api('/api/login', 'POST', { username: 'beta', password: 'wrong' }, { 'X-Real-IP': 'test-limiter' });
  assert.equal((await b.api('/api/login', 'POST', { username: 'beta', password: 'wrong' }, { 'X-Real-IP': 'test-limiter' })).status, 429);
  console.log('Production: login/session, logout/revocation, CSRF, rate limit, organization isolation, PostgreSQL assets, async jobs, cross-handler idempotency, quotas and captions OK.');
} finally {
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
  await Promise.all(apps.map(app => app.close())); await pool.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
  await rm(root, { recursive: true, force: true });
}
