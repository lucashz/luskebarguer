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
const signupCpf = cpfFromSeed(onlyDigits(suffix).slice(-9).padStart(9, '1'));
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
  assert(missingStorePage.status === 404 && missingStoreHtml.includes('Página não encontrada'), 'Pagina de loja inexistente nao retornou o 404 amigavel.');
  assert(/noindex/i.test(missingStorePage.headers.get('x-robots-tag') || ''), 'Pagina de loja inexistente pode ser indexada.');

  const signup = await request('/api/portal/signup', {
    method: 'POST',
    body: {
      plan_code: 'essential',
      accept_terms: true,
      attribution: {
        utm_source: 'instagram',
        utm_medium: 'direct',
        utm_campaign: 'primeiros_clientes',
        landing_path: '/cardapio-digital',
        visitor_key: `visitor-${suffix}`
      },
      owner: {
        name: 'Smoke Admin',
        email,
        phone: '5511999999999',
        document: signupCpf,
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
  const duplicateCpf = await request('/api/portal/signup', {
    method: 'POST', allowFailure: true,
    body: {
      accept_terms: true,
      owner: { name: 'CPF Duplicado', email: `duplicate-${email}`, phone: '5511977777777', document: signupCpf, password, confirm_password: password },
      business: { name: `Duplicado ${companyName}`, display_name: `Duplicado ${companyName}`, type: 'restaurante', slug: `duplicate-${slug}` }
    }
  });
  assert(duplicateCpf.status === 409, 'CPF duplicado deveria ser rejeitado no cadastro da plataforma.');
  assert(companyId && storeId, 'Cadastro nao retornou empresa/loja.');
  const attribution = await client.query('select marketing_attribution from public.companies where id = $1', [companyId]);
  assert(attribution.rows[0]?.marketing_attribution?.utm_source === 'instagram', 'Origem de marketing nao foi persistida na empresa.');
  const promotionalTrial = await client.query(`
    select trial_ends_at, current_period_starts_at, metadata
      from public.company_subscriptions
     where company_id = $1
       and status = 'trial'
     order by created_at desc
     limit 1
  `, [companyId]);
  const trial = promotionalTrial.rows[0];
  const trialDurationDays = (new Date(trial?.trial_ends_at).getTime() - new Date(trial?.current_period_starts_at).getTime()) / 86400000;
  assert(trialDurationDays === 21, `Campanha primeiros_clientes deveria liberar 21 dias, recebeu ${trialDurationDays}.`);
  assert(trial?.metadata?.trial_days === 21 && trial?.metadata?.trial_campaign === 'primeiros_clientes', 'Oferta promocional nao foi registrada nos metadados da assinatura.');
  const inactiveLogin = await request('/api/admin/login', {
    method: 'POST',
    allowFailure: true,
    body: { email, password }
  });
  assert(inactiveLogin.status === 403, `Login sem ativacao deveria retornar 403, recebeu ${inactiveLogin.status}.`);
  assert(/ativ/i.test(inactiveLogin.data.error || ''), 'Login sem ativacao deveria orientar ativacao por e-mail.');
  const activationToken = await replaceSignupActivationToken(signup.data.admin?.id);
  const activationInfo = await request(`/api/portal/activate/${activationToken}`);
  assert(activationInfo.data.activation?.email === email, 'Link de ativacao nao validou o e-mail criado.');
  const activated = await request(`/api/portal/activate/${activationToken}`, { method: 'POST' });
  adminCookie = activated.cookie;
  assert(adminCookie, 'Ativacao nao retornou cookie de admin.');
  await setSmokeCompanyPlan(companyId, 'premium');

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
  const milestones = await client.query(`
    select event_name from public.marketing_events
     where company_id = $1
       and event_name in ('signup_completed', 'menu_published', 'first_product_created', 'first_order_received')
  `, [companyId]);
  const milestoneNames = new Set(milestones.rows.map((row) => row.event_name));
  for (const expected of ['signup_completed', 'menu_published', 'first_product_created', 'first_order_received']) {
    assert(milestoneNames.has(expected), `Marco de marketing ausente: ${expected}.`);
  }
  const statusUpdated = await request(`/api/admin/orders/${order.id}/status`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: { status: 'accepted' }
  });
  assert(statusUpdated.data.order?.status === 'accepted', 'Status do pedido nao foi atualizado.');
  const whatsappLog = await waitForOrderWhatsappLog(order.id, 'accepted');
  assert(whatsappLog?.recipient_phone === '5511777777777', 'WhatsApp de status nao usou o telefone do cliente.');
  assert(
    ['sent', 'skipped', 'failed'].includes(whatsappLog.delivery_status),
    `WhatsApp de status retornou situacao invalida: ${whatsappLog.delivery_status || 'vazio'}.`
  );

  const checkout = await request('/api/admin/billing/checkout', {
    method: 'POST',
    cookie: adminCookie,
    body: { plan_code: 'professional' }
  });
  assert(checkout.data.subscription?.id, 'Checkout de plano nao retornou assinatura pendente.');
  assert(checkout.data.subscription?.status === 'payment_pending', `Checkout deveria manter assinatura pendente, recebeu ${checkout.data.subscription?.status || 'vazio'}.`);
  assert(checkout.data.checkout_url, 'Checkout de plano pago deveria retornar URL de pagamento.');
  const webhook = await request('/api/billing/webhook?provider=mock', {
    method: 'POST',
    body: {
      eventId: `smoke-billing-${suffix}`,
      id: checkout.data.subscription.external_subscription_id,
      status: 'paid',
      metadata: { companyId, planCode: 'professional' }
    }
  });
  assert(webhook.data.ok === true, 'Webhook de billing nao retornou ok.');
  const planAfterPayment = await client.query(`
    select p.code, s.status
      from public.company_subscriptions s
      join public.subscription_plans p on p.id = s.plan_id
     where s.company_id = $1
       and s.status = 'active'
     order by s.created_at desc
     limit 1
  `, [companyId]);
  assert(planAfterPayment.rows[0]?.code === 'professional', `Pagamento nao ativou o plano professional, recebeu ${planAfterPayment.rows[0]?.code || 'vazio'}.`);

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

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function cpfFromSeed(value) {
  let cpf = onlyDigits(value).slice(0, 9).padStart(9, '1');
  const digit = (length) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) sum += Number(cpf[index]) * (length + 1 - index);
    const remainder = (sum * 10) % 11;
    return String(remainder === 10 ? 0 : remainder);
  };
  cpf += digit(9);
  cpf += digit(10);
  return cpf;
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

async function waitForOrderWhatsappLog(orderId, status) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await client.query(`
      select recipient_phone, delivery_status, provider, error_message
        from public.order_whatsapp_logs
       where order_id = $1
         and order_status = $2
         and is_manual = false
       order by created_at desc
       limit 1
    `, [orderId, status]);
    if (result.rows[0]) return result.rows[0];
    await delay(200);
  }
  throw new Error(`WhatsApp de status ${status} nao gerou log para o pedido ${orderId}.`);
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
