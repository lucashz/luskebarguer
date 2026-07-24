import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pbkdf2Sync } from 'node:crypto';
import pg from 'pg';

loadEnv(new URL('../.env', import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL ausente.');
  process.exit(1);
}

const port = Number(process.env.SMOKE_PORT || 3107 + Math.floor(Math.random() * 500));
const baseUrl = `http://127.0.0.1:${port}`;
const password = '12345678';
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = `smoke-${suffix}@cardapio.local`;
const slug = `smoke-${suffix}`;
const companyName = `Smoke Restaurante ${suffix}`;
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: shouldUseSsl(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false
});

let serverProcess = null;
let adminCookie = '';
let companyId = null;
let storeId = null;

try {
  await client.connect();
  serverProcess = await startServer();

  const missingStore = await request('/api/bootstrap?store=loja-inexistente-smoke', { allowFailure: true });
  assert(missingStore.status === 404, 'Loja inexistente deveria retornar 404 no bootstrap.');
  assert(missingStore.data.code === 'STORE_NOT_FOUND', 'Loja inexistente deveria retornar codigo STORE_NOT_FOUND.');
  const missingStorePage = await fetch(`${baseUrl}/loja-inexistente-smoke`);
  const missingStoreHtml = await missingStorePage.text();
  assert(missingStorePage.ok && missingStoreHtml.includes('storeNotFound'), 'Pagina de loja inexistente nao carregou o estado visual.');

  const signup = await request('/api/portal/signup', {
    method: 'POST',
    body: {
      plan_code: 'essential',
      accept_terms: true,
      owner: {
        name: 'Smoke Admin',
        email,
        phone: '5511999999999',
        password,
        confirm_password: password
      },
      business: {
        name: companyName,
        display_name: companyName,
        type: 'restaurante',
        city: 'Sao Paulo',
        state: 'SP',
        address: 'Rua Smoke, 123',
        phone: '5511888888888',
        slug
      }
    }
  });
  companyId = signup.data.admin?.company_id || signup.data.company?.id || null;
  storeId = signup.data.admin?.store_id || signup.data.store?.id || null;
  assert(signup.data.needs_activation === true, 'Cadastro deveria exigir ativacao por e-mail.');
  assert(companyId && storeId, 'Cadastro nao retornou empresa/loja.');
  const activationToken = await replaceSignupActivationToken(signup.data.admin?.id);
  const activationInfo = await request(`/api/portal/activate/${activationToken}`);
  assert(activationInfo.data.activation?.email === email, 'Link de ativacao nao validou o e-mail criado.');
  const activated = await request(`/api/portal/activate/${activationToken}`, { method: 'POST' });
  adminCookie = activated.cookie;
  assert(adminCookie, 'Ativacao nao retornou cookie de admin.');
  await setSmokeCompanyPlan(companyId, 'professional');

  await request('/api/admin/logout', { method: 'POST', cookie: adminCookie });
  const login = await request('/api/admin/login', {
    method: 'POST',
    body: { email, password }
  });
  adminCookie = login.cookie;
  assert(adminCookie, 'Login nao retornou cookie de admin.');

  const onboarding = await request('/api/admin/onboarding', { cookie: adminCookie });
  assert(onboarding.data.can_publish === false, 'Onboarding novo nao deveria estar publicado automaticamente.');
  await request('/api/admin/onboarding', {
    method: 'PATCH',
    cookie: adminCookie,
    body: {
      current_step: 'training',
      completed_steps: ['welcome', 'store', 'operation', 'payments', 'delivery', 'category', 'product', 'appearance', 'training']
    }
  });
  const published = await request('/api/admin/onboarding/publish', { method: 'POST', cookie: adminCookie });
  assert(published.data.progress?.store_published === true || published.data.store?.onboarding_completed === true, 'Onboarding nao foi publicado.');
  assert(published.data.store?.is_open === true, 'Loja nao ficou aberta apos publicar onboarding.');

  const categoryCreated = await request('/api/categories', {
    method: 'POST',
    cookie: adminCookie,
    body: { name: `Categoria Smoke ${suffix}`, description: 'Categoria criada pelo smoke.', sort_order: 99, is_active: true }
  });
  const category = firstRow(categoryCreated.data);
  assert(category?.id, 'Categoria nao foi criada.');
  const categoryEdited = await request(`/api/categories/${category.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: { name: `Categoria Smoke Editada ${suffix}` }
  });
  assert(firstRow(categoryEdited.data)?.name?.includes('Editada'), 'Categoria nao foi editada.');

  const itemCreated = await request('/api/items', {
    method: 'POST',
    cookie: adminCookie,
    body: {
      category_id: category.id,
      name: `Produto Smoke ${suffix}`,
      description: 'Produto criado pelo smoke.',
      price: 19.9,
      image_url: '',
      tags: [],
      is_available: true,
      is_featured: false,
      sort_order: 10
    }
  });
  const item = firstRow(itemCreated.data);
  assert(item?.id, 'Produto nao foi criado.');
  const itemEdited = await request(`/api/items/${item.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: { name: `Produto Smoke Editado ${suffix}`, price: 21.9 }
  });
  assert(firstRow(itemEdited.data)?.name?.includes('Editado'), 'Produto nao foi editado.');

  const tableCreated = await request('/api/admin/tables', {
    method: 'POST',
    cookie: adminCookie,
    body: { name: 'Mesa Smoke', is_active: true }
  });
  const table = tableCreated.data.table;
  assert(table?.code === 'mesa-1', `Primeira mesa deveria ser mesa-1, recebeu ${table?.code || 'vazio'}.`);
  const tableEdited = await request(`/api/admin/tables/${table.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: { name: 'Mesa Smoke Editada', is_active: true }
  });
  assert(tableEdited.data.table?.name === 'Mesa Smoke Editada', 'Mesa nao foi editada.');

  await assertDiningTableIsolation();

  const orderCreated = await request(`/api/orders?store=${encodeURIComponent(slug)}`, {
    method: 'POST',
    body: {
      fulfillment_method: 'pickup',
      customer: { name: 'Cliente Smoke', phone: '5511777777777' },
      payment_method: 'Pix',
      payment_details: {},
      items: [{ id: item.id, quantity: 1, modifier_ids: [] }]
    }
  });
  const order = orderCreated.data.order;
  assert(order?.id && order.public_code, 'Pedido nao foi criado.');
  const statusUpdated = await request(`/api/admin/orders/${order.id}/status`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: { status: 'accepted' }
  });
  assert(statusUpdated.data.order?.status === 'accepted', 'Status do pedido nao foi atualizado.');

  const checkout = await request('/api/admin/billing/checkout', {
    method: 'POST',
    cookie: adminCookie,
    body: { plan_code: 'premium' }
  });
  assert(checkout.data.subscription?.id, 'Checkout/ativacao de plano nao retornou assinatura.');
  const webhook = await request('/api/billing/webhook?provider=manual', {
    method: 'POST',
    body: {
      eventId: `smoke-billing-${suffix}`,
      status: 'paid',
      metadata: { companyId, planCode: 'premium' }
    }
  });
  assert(webhook.data.ok === true, 'Webhook de billing nao retornou ok.');

  await request('/api/admin/account/delete', {
    method: 'POST',
    cookie: adminCookie,
    body: { confirmation: 'EXCLUIR CONTA', password }
  });
  companyId = null;
  storeId = null;

  const deletedLogin = await request('/api/admin/login', {
    method: 'POST',
    body: { email, password },
    allowFailure: true
  });
  assert(deletedLogin.status === 404, 'Login deveria falhar apos excluir a conta.');

  console.log('Fluxos principais validados com sucesso.');
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

async function assertDiningTableIsolation() {
  const otherCompany = await client.query(`
    insert into public.companies (name, status)
    values ($1, 'trial')
    returning id
  `, [`Smoke Isolamento ${suffix}`]);
  const otherCompanyId = otherCompany.rows[0].id;
  try {
    const otherStore = await client.query(`
      insert into public.stores (company_id, name, slug, public_url, is_active)
      values ($1, $2, $3, $4, true)
      returning id
    `, [otherCompanyId, `Smoke Outra Loja ${suffix}`, `smoke-outra-${suffix}`, `/smoke-outra-${suffix}`]);
    const otherStoreId = otherStore.rows[0].id;
    await client.query(`
      insert into public.dining_tables (store_id, name, code, is_active)
      values ($1, 'Mesa 1', 'mesa-1', true)
    `, [otherStoreId]);

    let duplicateBlocked = false;
    try {
      await client.query(`
        insert into public.dining_tables (store_id, name, code, is_active)
        values ($1, 'Mesa duplicada', 'mesa-1', true)
      `, [storeId]);
    } catch (error) {
      duplicateBlocked = error.code === '23505';
    }
    assert(duplicateBlocked, 'A mesma loja conseguiu duplicar mesa-1.');
  } finally {
    await client.query('delete from public.companies where id = $1', [otherCompanyId]).catch(() => {});
  }
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
      PUBLIC_APP_URL: baseUrl,
      APP_URL: baseUrl
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

async function setSmokeCompanyPlan(targetCompanyId, planCode) {
  const plan = await client.query('select id from public.subscription_plans where code = $1 limit 1', [planCode]);
  assert(plan.rows[0]?.id, `Plano ${planCode} nao encontrado para o smoke.`);
  await client.query(`
    update public.company_subscriptions
       set plan_id = $2,
           status = 'active',
           trial_ends_at = null,
           current_period_starts_at = now(),
           current_period_ends_at = now() + interval '30 days',
           next_renewal_at = now() + interval '30 days',
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('source', 'core_flow_smoke')
     where company_id = $1
  `, [targetCompanyId, plan.rows[0].id]);
  await client.query(`update public.companies set status = 'active' where id = $1`, [targetCompanyId]);
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

function firstRow(data) {
  return Array.isArray(data) ? data[0] : data?.[0] || data;
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
