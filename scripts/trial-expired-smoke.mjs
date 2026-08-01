import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pbkdf2Sync } from 'node:crypto';
import pg from 'pg';

loadEnv(new URL('../.env', import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL ausente.');
  process.exit(1);
}

const port = Number(process.env.TRIAL_SMOKE_PORT || 3507 + Math.floor(Math.random() * 400));
const baseUrl = `http://127.0.0.1:${port}`;
const password = '12345678';
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = `trial-expired-${suffix}@cardapio.local`;
const slug = `trial-expired-${suffix}`;
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: shouldUseSsl(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false
});

let serverProcess = null;
let companyId = null;

try {
  await client.connect();
  serverProcess = await startServer();

  const signup = await request('/api/portal/signup', {
    method: 'POST',
    body: {
      accept_terms: true,
      owner: {
        name: 'Trial Expired Smoke',
        email,
        phone: '5599999999999',
        password,
        confirm_password: password
      },
      business: {
        name: `Trial Expired ${suffix}`,
        display_name: `Trial Expired ${suffix}`,
        type: 'restaurante',
        city: 'Sao Paulo',
        state: 'SP',
        address: 'Rua Smoke, 123',
        phone: '5599999999999',
        slug
      }
    }
  });

  companyId = signup.data.admin?.company_id || signup.data.company?.id || null;
  assert(companyId, 'Cadastro temporario nao retornou empresa.');
  assert(signup.data.needs_activation === true, 'Cadastro deveria exigir ativacao por e-mail.');

  const activationToken = await replaceSignupActivationToken(signup.data.admin?.id);
  await request(`/api/portal/activate/${activationToken}`);
  const activated = await request(`/api/portal/activate/${activationToken}`, { method: 'POST' });
  const adminCookie = activated.cookie;
  assert(adminCookie, 'Ativacao nao retornou cookie de admin.');

  await expireTrial(companyId);

  const tables = await request('/api/admin/tables', { cookie: adminCookie, allowFailure: true });
  assert(tables.status === 402, `Mesas deveria bloquear com 402, recebeu ${tables.status}.`);
  assert(tables.data.commercial_status === 'trial_expired', `Status esperado trial_expired, recebeu ${tables.data.commercial_status || 'vazio'}.`);

  const plan = await request('/api/admin/plan', { cookie: adminCookie, allowFailure: true });
  assert(plan.status === 200, `Plano deve continuar acessivel, recebeu ${plan.status}.`);

  const support = await request('/api/admin/support/tickets', { cookie: adminCookie, allowFailure: true });
  assert(support.status === 200, `Suporte deve continuar acessivel, recebeu ${support.status}.`);

  const account = await request('/api/admin/me', { cookie: adminCookie, allowFailure: true });
  assert(account.status === 200, `Conta deve continuar acessivel, recebeu ${account.status}.`);

  console.log('Trial vencido validado: areas pagas bloqueadas; Plano, Suporte e Conta acessiveis.');
} finally {
  if (companyId) {
    await client.query('delete from public.companies where id = $1', [companyId]).catch(() => {});
  }
  await client.end().catch(() => {});
  if (serverProcess) {
    serverProcess.kill();
    await new Promise((resolve) => serverProcess.once('exit', resolve));
  }
}

async function expireTrial(targetCompanyId) {
  const plan = await client.query("select id from public.subscription_plans where code = 'trial' limit 1");
  assert(plan.rows[0]?.id, 'Plano trial nao encontrado.');
  await client.query(`
    update public.company_subscriptions
       set plan_id = $2,
           status = 'trial',
           trial_ends_at = now() - interval '1 day',
           current_period_ends_at = now() - interval '1 day',
           payment_due_at = null
     where company_id = $1
  `, [targetCompanyId, plan.rows[0].id]);
  await client.query("update public.companies set status = 'trial' where id = $1", [targetCompanyId]);
}

async function replaceSignupActivationToken(adminUserId) {
  assert(adminUserId, 'Cadastro nao retornou admin para ativacao.');
  const token = `a${Date.now().toString(16)}${Math.random().toString(16).slice(2).padEnd(32, '0')}`.slice(0, 48);
  const tokenHash = pbkdf2Sync(token, 'admin_account_activation', 120000, 32, 'sha256').toString('hex');
  await client.query(`
    update public.admin_activation_tokens
       set token_hash = $2,
           status = 'pending',
           expires_at = now() + interval '1 hour',
           used_at = null
     where admin_user_id = $1
       and status = 'pending'
  `, [adminUserId, tokenHash]);
  return token;
}

async function startServer() {
  const child = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      APP_URL: baseUrl,
      PUBLIC_APP_URL: baseUrl
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
