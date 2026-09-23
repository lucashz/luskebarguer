import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';

loadEnv(new URL('../.env', import.meta.url));
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente para o teste IDOR.');

const port = 4700 + Math.floor(Math.random() * 200);
const baseUrl = `http://127.0.0.1:${port}`;
const ids = { companies: [] };
let child;
let client;

try {
  client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const fixture = await createFixture(client);
  child = await startServer();

  const headers = { Cookie: `customer_session=${fixture.tokenA}`, 'Content-Type': 'application/json' };
  const update = await fetch(`${baseUrl}/api/customer/addresses/${fixture.addressB}?loja=${fixture.slugA}`, {
    method: 'PATCH', headers, body: JSON.stringify({ street: 'Rua isolada', number: '10', neighborhood: 'Centro', city: 'Teste', is_default: true })
  });
  assert.equal(update.status, 404, 'PATCH aceitou endereco de outro tenant');

  const remove = await fetch(`${baseUrl}/api/customer/addresses/${fixture.addressB}?loja=${fixture.slugA}`, {
    method: 'DELETE', headers
  });
  assert.equal(remove.status, 404, 'DELETE ocultou falha de pertencimento de outro tenant');

  const stillExists = await client.query('select 1 from customer_addresses where id = $1', [fixture.addressB]);
  assert.equal(stillExists.rowCount, 1, 'recurso do tenant B foi removido');

  const malformed = await fetch(`${baseUrl}/api/customer/addresses/${encodeURIComponent("x' OR '1'='1")}?loja=${fixture.slugA}`, {
    method: 'DELETE', headers
  });
  assert.ok([400, 404, 422].includes(malformed.status));
  assert.ok(malformed.status < 500);
  console.log('IDOR security smoke: isolamento de enderecos OK');
} finally {
  if (child?.exitCode === null) {
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
  }
  if (client) {
    for (const companyId of ids.companies) await client.query('delete from companies where id = $1', [companyId]).catch(() => {});
    await client.end().catch(() => {});
  }
}

async function createFixture(db) {
  const suffix = randomBytes(5).toString('hex');
  const companyA = randomUUID(); const companyB = randomUUID();
  const storeA = randomUUID(); const storeB = randomUUID();
  const customerA = randomUUID(); const customerB = randomUUID();
  const addressB = randomUUID(); const tokenA = randomBytes(32).toString('hex');
  const slugA = `idor-a-${suffix}`; const slugB = `idor-b-${suffix}`;
  ids.companies.push(companyA, companyB);
  await db.query('insert into companies(id,name,status) values($1,$2,$3),($4,$5,$3)', [companyA, `IDOR A ${suffix}`, 'trial', companyB, `IDOR B ${suffix}`]);
  await db.query('insert into stores(id,company_id,name,slug,is_active) values($1,$2,$3,$4,true),($5,$6,$7,$8,true)', [storeA, companyA, 'Loja A', slugA, storeB, companyB, 'Loja B', slugB]);
  await db.query('insert into customers(id,store_id,name,phone) values($1,$2,$3,$4),($5,$6,$7,$8)', [customerA, storeA, 'Cliente A', `5591${suffix}`, customerB, storeB, 'Cliente B', `5592${suffix}`]);
  await db.query('insert into customer_addresses(id,store_id,customer_id,street,is_default) values($1,$2,$3,$4,true)', [addressB, storeB, customerB, 'Rua B']);
  await db.query(`insert into app_sessions(token,company_id,store_id,type,owner_id,data,expires_at)
    values($1,$2,$3,'customer',$4,$5::jsonb,now() + interval '1 hour')`, [
    createHash('sha256').update(tokenA).digest('hex'), companyA, storeA, customerA,
    JSON.stringify({ id: customerA, name: 'Cliente A', phone: `5591${suffix}`, store_id: storeA })
  ]);
  return { tokenA, slugA, slugB, addressB };
}

async function startServer() {
  const processChild = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), APP_URL: baseUrl, PUBLIC_APP_URL: baseUrl, ALLOWED_ORIGINS: baseUrl, COOKIE_SECURE: 'false', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  processChild.stdout.on('data', (chunk) => { logs += chunk; });
  processChild.stderr.on('data', (chunk) => { logs += chunk; });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (processChild.exitCode !== null) throw new Error(`Servidor encerrou durante o boot.\n${logs}`);
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) return processChild; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  processChild.kill();
  throw new Error(`Servidor nao respondeu.\n${logs}`);
}

function loadEnv(url) {
  if (!existsSync(url)) return;
  for (const line of readFileSync(url, 'utf8').split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith('#') || !text.includes('=')) continue;
    const [key, ...rest] = text.split('=');
    process.env[key.trim()] ||= rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
}
