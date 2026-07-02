import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';

loadEnv(new URL('../.env', import.meta.url));

const baseUrl = process.env.LOCAL_BASE_URL || 'http://127.0.0.1:3000';
const connectionString = process.env.DATABASE_URL || buildConnectionString();
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const records = {
  companyIds: [],
  sessionTokens: []
};

try {
  await client.connect();
  const a = await createTenant('A');
  const b = await createTenant('B');
  const createdOrder = await createPublicOrder(a);
  await createAndAssertCustomDomain(a);
  await assertAdminSeesOnlyOwnOrder(a, createdOrder.public_code);
  await assertAdminDoesNotSeeOtherStoreOrder(b, createdOrder.public_code);
  await moveOrderStatus(a, createdOrder.id, 'accepted');
  await assertReportContainsOnlyOwnStore(a, createdOrder.public_code);
  await assertKitchenOrdersAreScoped(a, createdOrder.public_code);
  await assertAuditCreated(a, 'order.status.update');
  console.log('Fluxo E2E multiempresa validado.');
} finally {
  await cleanup();
  await client.end().catch(() => {});
}

async function createTenant(label) {
  const company = await one(`
    insert into public.companies (name, status)
    values ($1, 'trial')
    returning id, name
  `, [`Empresa E2E ${label} ${suffix}`]);
  records.companyIds.push(company.id);

  await client.query(`
    insert into public.company_subscriptions (
      company_id, plan_id, status, trial_ends_at, current_period_starts_at,
      current_period_ends_at, next_renewal_at, metadata
    )
    select $1, p.id, 'trial', now() + interval '7 days', now(),
      now() + interval '7 days', now() + interval '7 days', '{"source":"e2e"}'::jsonb
    from public.subscription_plans p
    where p.code = 'essential'
    limit 1
  `, [company.id]);

  const slug = `e2e-${label.toLowerCase()}-${suffix}`.replace(/[^a-z0-9-]/g, '-').slice(0, 60);
  const store = await one(`
    insert into public.stores (company_id, name, slug, public_url, is_active)
    values ($1, $2, $3, $4, true)
    returning id, company_id, name, slug
  `, [company.id, `Loja E2E ${label}`, slug, `/${slug}`]);

  await client.query(`
    insert into public.store_settings (
      store_id, name, slug, description, is_open, whatsapp_number, delivery_fee,
      minimum_order, payment_methods, business_hours
    )
    values ($1, $2, $3, 'Loja temporaria E2E.', true, '5555936191201', 5, 0, $4, '{}'::jsonb)
  `, [store.id, store.name, store.slug, ['Pix', 'Dinheiro']]);

  const category = await one(`
    insert into public.menu_categories (store_id, name, sort_order, is_active)
    values ($1, 'Categoria E2E', 1, true)
    returning id
  `, [store.id]);

  const item = await one(`
    insert into public.menu_items (store_id, category_id, name, description, price, is_available, sort_order)
    values ($1, $2, $3, 'Item temporario do teste E2E.', 19.9, true, 1)
    returning id, name, price
  `, [store.id, category.id, `Produto E2E ${label}`]);

  const admin = await one(`
    insert into public.admin_users (company_id, name, email, password_hash, role, is_active)
    values ($1, $2, $3, 'test-only', 'admin', true)
    returning id, name, email, role
  `, [company.id, `Admin E2E ${label}`, `admin-${label}-${suffix}@example.test`]);

  await client.query(`
    insert into public.admin_user_store_access (admin_user_id, company_id, store_id, role, permissions, is_active)
    values ($1, $2, $3, 'admin', '{}'::text[], true)
  `, [admin.id, company.id, store.id]);

  const token = crypto.randomBytes(24).toString('hex');
  records.sessionTokens.push(token);
  const adminData = {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: 'admin',
    company_id: company.id,
    store_id: store.id,
    active_store: {
      id: store.id,
      company_id: company.id,
      name: store.name,
      slug: store.slug,
      public_url: `/${store.slug}`,
      is_active: true
    },
    stores: [{
      id: store.id,
      company_id: company.id,
      name: store.name,
      slug: store.slug,
      public_url: `/${store.slug}`,
      is_active: true
    }]
  };
  await client.query(`
    insert into public.app_sessions (token, type, owner_id, company_id, store_id, data, expires_at)
    values ($1, 'admin', $2, $3, $4, $5::jsonb, now() + interval '1 day')
  `, [token, admin.id, company.id, store.id, JSON.stringify(adminData)]);

  return { company, store, category, item, admin, token };
}

async function createAndAssertCustomDomain(tenant) {
  const domain = `cardapio-${tenant.store.slug}.example.test`;
  await client.query(`
    insert into public.store_domains (store_id, domain, status, verified_at)
    values ($1, $2, 'verified', now())
  `, [tenant.store.id, domain]);
  const data = await getJsonWithHost('/api/bootstrap', domain);
  const names = (data.categories || []).flatMap((category) => category.items || []).map((item) => item.name);
  if (!names.includes(tenant.item.name)) throw new Error('Dominio personalizado nao resolveu a loja correta.');
}

async function createPublicOrder(tenant) {
  const response = await postJson(`/api/orders?store=${encodeURIComponent(tenant.store.slug)}`, {
    fulfillment_method: 'delivery',
    customer: {
      name: `Cliente E2E ${suffix}`,
      phone: `119${String(Date.now()).slice(-8)}`,
      email: `cliente-${suffix}@example.test`
    },
    address: {
      label: 'Casa',
      street: 'Rua E2E',
      number: '123',
      neighborhood: 'Centro',
      city: 'Santa Maria',
      complement: '',
      reference: ''
    },
    payment_method: 'Pix',
    payment_details: {},
    items: [{ id: tenant.item.id, quantity: 1, modifier_ids: [], notes: 'Sem cebola' }],
    notes: 'Pedido E2E'
  });
  if (!response.order?.id || !response.order?.public_code) throw new Error('Pedido publico nao retornou id/codigo.');
  return response.order;
}

async function assertAdminSeesOnlyOwnOrder(tenant, publicCode) {
  const data = await getJson('/api/admin/orders', tenant.token);
  const codes = (data.orders || []).map((order) => order.public_code);
  if (!codes.includes(publicCode)) throw new Error('Admin da loja A nao viu o proprio pedido.');
}

async function assertAdminDoesNotSeeOtherStoreOrder(tenant, publicCode) {
  const data = await getJson('/api/admin/orders', tenant.token);
  const codes = (data.orders || []).map((order) => order.public_code);
  if (codes.includes(publicCode)) throw new Error('Admin da loja B viu pedido da loja A.');
}

async function moveOrderStatus(tenant, orderId, status) {
  const data = await patchJson(`/api/admin/orders/${orderId}/status`, { status }, tenant.token);
  if (data.order?.status !== status) throw new Error('Status do pedido nao foi atualizado.');
}

async function assertReportContainsOnlyOwnStore(tenant, publicCode) {
  const data = await getJson('/api/admin/reports/range?days=7', tenant.token);
  const raw = JSON.stringify(data);
  if (!raw.includes(publicCode)) throw new Error('Relatorio da loja A nao contem o pedido criado.');
}

async function assertKitchenOrdersAreScoped(tenant, publicCode) {
  const data = await getJson('/api/admin/orders', tenant.token);
  const order = (data.orders || []).find((entry) => entry.public_code === publicCode);
  if (!order || order.store_id !== tenant.store.id) throw new Error('Pedido da cozinha/admin nao esta escopado por loja.');
}

async function assertAuditCreated(tenant, action) {
  const result = await client.query(`
    select id, action from public.audit_logs
    where company_id = $1 and store_id = $2 and action = $3
    limit 1
  `, [tenant.company.id, tenant.store.id, action]);
  if (!result.rows[0]) throw new Error(`Auditoria nao registrada: ${action}`);
}

async function getJson(path, adminToken) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: adminToken ? { Cookie: `admin_session=${adminToken}` } : {}
  });
  return parseResponse(response);
}

async function getJsonWithHost(path, host) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'x-forwarded-host': host }
  });
  return parseResponse(response);
}

async function postJson(path, body, adminToken) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(adminToken ? { Cookie: `admin_session=${adminToken}` } : {})
    },
    body: JSON.stringify(body)
  });
  return parseResponse(response);
}

async function patchJson(path, body, adminToken) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(adminToken ? { Cookie: `admin_session=${adminToken}` } : {})
    },
    body: JSON.stringify(body)
  });
  return parseResponse(response);
}

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || data.error || `Falha HTTP ${response.status}`);
  return data;
}

async function one(sql, params) {
  const result = await client.query(sql, params);
  return result.rows[0];
}

async function cleanup() {
  for (const token of records.sessionTokens) {
    await client.query('delete from public.app_sessions where token = $1', [token]).catch(() => {});
  }
  for (const companyId of records.companyIds) {
    await client.query('delete from public.companies where id = $1', [companyId]).catch(() => {});
  }
}

function buildConnectionString() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL ausente.');
  }
  return process.env.DATABASE_URL;
}

function loadEnv(url) {
  const content = readFileSync(url, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    process.env[key.trim()] ||= rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
}
