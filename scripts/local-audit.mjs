import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

loadEnv(new URL('../.env', import.meta.url));

const BASE_URL = process.env.TEST_BASE_URL || `http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 3000}`;
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao necessarios para criar dados temporarios.');
  process.exit(1);
}

const runId = `audit-${Date.now()}`;
const adminEmail = `${runId}@example.test`;
const adminPassword = `Audit!${randomBytes(8).toString('hex')}`;
const phoneA = `1193${String(Date.now()).slice(-7)}`;
const phoneB = `1192${String(Date.now()).slice(-7)}`;
const cleanup = { adminId: null, customerIds: [], orderIds: [] };
const results = [];

try {
  await run();
} finally {
  await clean();
}

const failed = results.filter((result) => result.status === 'FAIL');
console.table(results);
if (failed.length) process.exit(1);

async function run() {
  const health = await request('/api/health');
  check('Servidor responde health', health.status === 200);

  for (const [method, path] of [
    ['GET', '/api/admin/summary'],
    ['GET', '/api/admin/customers'],
    ['GET', '/api/admin/orders'],
    ['POST', '/api/items']
  ]) {
    const response = await request(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'POST' ? '{}' : undefined
    });
    check(`Admin sem auth ${method} ${path}`, response.status === 401, response.status);
  }

  const adminCookie = await createAdmin();
  const customerA = await createCustomer(phoneA, 'Cliente Auditoria A');
  const customerB = await createCustomer(phoneB, 'Cliente Auditoria B');

  const badUpload = await request('/api/admin/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      fileName: 'audit.svg',
      contentType: 'image/svg+xml',
      dataBase64: Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64')
    })
  });
  check('Upload SVG bloqueado', badUpload.status === 422, badUpload.status);

  const item = await firstAvailableItem();
  const order = await createOrder(customerA.cookie, phoneA, item);
  check('Pedido fake criado', Boolean(order?.id), order?.public_code || 'sem pedido');

  const moved = await request(`/api/admin/orders/${order.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ status: 'completed' })
  });
  check('Admin move status', moved.status === 200, moved.status);

  const historyA = await request('/api/customer/orders', { headers: { Cookie: customerA.cookie } });
  const historyB = await request('/api/customer/orders', { headers: { Cookie: customerB.cookie } });
  check('Cliente ve proprio pedido', (historyA.data.orders || []).some((entry) => entry.id === order.id));
  check('Outro cliente nao ve pedido', !(historyB.data.orders || []).some((entry) => entry.id === order.id));

  const today = new Date().toISOString().slice(0, 10);
  const report = await request(`/api/admin/reports/daily?date=${today}`, { headers: { Cookie: adminCookie } });
  const reportOrder = (report.data.report?.orders || []).find((entry) => entry.id === order.id);
  check('Relatorio contem pedido', Boolean(reportOrder));
  check('Relatorio bate valor', Number(reportOrder?.total) === Number(order.total));
  check('Relatorio tem top produtos', Array.isArray(report.data.report?.top_products));

  const resetWrong = await request('/api/customer/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: phoneA,
      order_code: order.public_code,
      order_total: '0,01',
      new_password: 'NovaSenha!123'
    })
  });
  check('Reset senha bloqueia total errado', resetWrong.status === 401, resetWrong.status);
}

async function createAdmin() {
  const [admin] = await supabase('POST', 'admin_users', {}, {
    name: 'Auditoria Local',
    email: adminEmail,
    password_hash: hashPassword(adminPassword),
    role: 'owner',
    is_active: true
  });
  cleanup.adminId = admin.id;
  const login = await request('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, password: adminPassword })
  });
  if (login.status !== 200) throw new Error('Nao foi possivel autenticar admin temporario.');
  return cookieFrom(login);
}

async function createCustomer(phone, name) {
  const response = await request('/api/customer/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: { name, phone, email: `${phone}-${runId}@example.test` },
      password: 'Cliente!12345',
      address: {
        street: 'Rua Auditoria',
        number: '10',
        neighborhood: 'Centro',
        city: 'Cidade Teste'
      }
    })
  });
  if (response.data.customer?.id) cleanup.customerIds.push(response.data.customer.id);
  return { id: response.data.customer?.id, cookie: cookieFrom(response) };
}

async function firstAvailableItem() {
  const bootstrap = await request('/api/bootstrap');
  const item = (bootstrap.data.categories || [])
    .flatMap((category) => category.items || [])
    .find((entry) => entry.is_available !== false);
  if (!item) throw new Error('Nenhum produto disponivel para teste.');
  return item;
}

async function createOrder(cookie, phone, item) {
  const response = await request('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      customer: { name: 'Cliente Auditoria A', phone },
      fulfillment_method: 'delivery',
      address: {
        street: 'Rua Auditoria',
        number: '10',
        neighborhood: 'Centro',
        city: 'Cidade Teste'
      },
      payment_method: 'Pix',
      notes: 'Pedido fake de auditoria local',
      items: [{
        id: item.id,
        quantity: 1,
        modifier_ids: requiredModifiers(item)
      }]
    })
  });
  if (response.data.order?.id) cleanup.orderIds.push(response.data.order.id);
  return response.data.order;
}

function requiredModifiers(item) {
  const ids = [];
  for (const group of item.modifier_groups || []) {
    const min = Math.max(Number(group.min_choices || 0), group.is_required ? 1 : 0);
    if (min > 0) ids.push(...(group.modifiers || []).slice(0, min).map((modifier) => modifier.id));
  }
  return ids;
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { status: response.status, data, headers: response.headers };
}

async function supabase(method, table, query = {}, payload, prefer = 'return=representation') {
  const endpoint = new URL(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}`);
  for (const [key, value] of Object.entries(query)) endpoint.searchParams.set(key, value);
  const response = await fetch(endpoint, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: prefer
    },
    body: payload === undefined ? undefined : JSON.stringify(payload)
  });
  const text = await response.text();
  let data = [];
  try {
    data = text ? JSON.parse(text) : [];
  } catch {
    data = text;
  }
  if (!response.ok) throw new Error(`Supabase ${method} ${table} falhou: ${response.status}`);
  return data;
}

async function clean() {
  for (const id of cleanup.orderIds) {
    await supabase('DELETE', 'order_items', { order_id: `eq.${id}` }, undefined, 'return=minimal').catch(() => {});
    await supabase('DELETE', 'orders', { id: `eq.${id}` }, undefined, 'return=minimal').catch(() => {});
  }
  for (const id of cleanup.customerIds) {
    await supabase('DELETE', 'app_sessions', { owner_id: `eq.${id}` }, undefined, 'return=minimal').catch(() => {});
    await supabase('DELETE', 'customers', { id: `eq.${id}` }, undefined, 'return=minimal').catch(() => {});
  }
  if (cleanup.adminId) {
    await supabase('DELETE', 'app_sessions', { owner_id: `eq.${cleanup.adminId}` }, undefined, 'return=minimal').catch(() => {});
    await supabase('DELETE', 'admin_users', { id: `eq.${cleanup.adminId}` }, undefined, 'return=minimal').catch(() => {});
  }
}

function check(name, ok, evidence = '') {
  results.push({ name, status: ok ? 'PASS' : 'FAIL', evidence });
}

function cookieFrom(response) {
  return (response.headers.get('set-cookie') || '').split(';')[0];
}

function hashPassword(value) {
  const salt = randomBytes(16).toString('hex');
  const iterations = 310000;
  const digest = pbkdf2Sync(value, salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$${iterations}$${salt}$${digest}`;
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
