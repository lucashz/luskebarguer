import { spawn } from 'node:child_process';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

loadEnv(new URL('../.env', import.meta.url));

const shouldManageServer = !process.env.BASE_URL;
const port = Number(process.env.SECURITY_SMOKE_PORT || 3707 + Math.floor(Math.random() * 400));
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${port}`;
let serverProcess = null;
const paymentCookieSecret = randomBytes(32).toString('hex');

try {
  if (shouldManageServer) serverProcess = await startServer();
  await ensureDefaultStoreCanReceiveOrders();

  const payloads = [
    {
      name: 'GET /api/payments/order rejeita codigo e paginacao malformados',
      path: `/api/payments/order?code=${encodeURIComponent("x' OR '1'='1")}&limit=${encodeURIComponent('1;drop table orders')}`,
      options: { method: 'GET' },
      allowedStatuses: [400, 403, 404, 422]
    },
    {
      name: 'POST /api/orders rejeita id de item malformado',
      path: '/api/orders',
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fulfillment_method: 'delivery',
          customer: { name: 'Cliente Teste SQLi', phone: '5599999999999' },
          address: {
            street: 'Rua Teste',
            number: '123',
            neighborhood: 'Centro',
            city: 'Cidade'
          },
          payment_method: 'Pix',
          items: [
            {
              id: '00000000-0000-4000-8000-000000000000),id.not.is.null',
              quantity: 1,
              modifier_ids: ['00000000-0000-4000-8000-000000000001),id.not.is.null']
            }
          ]
        })
      },
      allowedStatuses: [400, 401, 403, 404, 422, 423]
    },
    {
      name: 'POST /api/coupons/preview rejeita id de item malformado',
      path: '/api/coupons/preview',
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'TESTE',
          subtotal: 10,
          delivery_fee: 0,
          items: [
            { id: '00000000-0000-4000-8000-000000000000,or(id.not.is.null)', quantity: 1 }
          ]
        })
      },
      allowedStatuses: [400, 401, 404, 422]
    },
    {
      name: 'POST /api/payments/webhook sanitiza provider/transaction_id malformados',
      path: '/api/payments/webhook?provider=mock),or(provider.not.is.null)',
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: 'evt_1),or(id.not.is.null)',
          transaction_id: 'tx_1),or(payment_transaction_id.not.is.null)',
          status: 'paid',
          amount: 1
        })
      },
      allowedStatuses: [400, 401, 404, 422]
    },
    {
      name: 'GET autenticado obrigatorio nao interpreta filtro SQL em URL',
      path: `/api/admin/support/tickets?search=${encodeURIComponent("%' OR 1=1 --")}&order=${encodeURIComponent('created_at;drop table support_tickets')}`,
      options: { method: 'GET' },
      allowedStatuses: [400, 401, 403, 404, 422]
    }
  ];

  let failures = 0;

  for (const test of payloads) {
    const response = await fetch(`${BASE_URL}${test.path}`, test.options);
    const text = await response.text();
    const ok = test.allowedStatuses.includes(response.status);
    if (!ok || response.status >= 500) {
      failures += 1;
      console.error(`FAIL ${test.name}: HTTP ${response.status} ${text.slice(0, 300)}`);
    } else {
      console.log(`OK ${test.name}: HTTP ${response.status}`);
    }
  }

  failures += await testPrivatePaymentAccess();

  if (failures) process.exitCode = 1;
} finally {
  if (serverProcess) {
    serverProcess.kill();
    await new Promise((resolve) => serverProcess.once('exit', resolve));
  }
}

async function testPrivatePaymentAccess() {
  if (!process.env.DATABASE_URL) return 0;
  const pg = await import('pg');
  const client = new pg.default.Client({ connectionString: process.env.DATABASE_URL });
  const token = randomBytes(32).toString('base64url');
  const code = `SEC${randomBytes(4).toString('hex')}`.toUpperCase();
  const otherCode = `SEC${randomBytes(4).toString('hex')}`.toUpperCase();
  let orderId = '';
  let otherOrderId = '';
  try {
    await client.connect();
    const created = await client.query(`
      insert into orders (store_id, public_code, payment_method, customer_snapshot, subtotal, total, financial_status, payment_access_token_hash, payment_access_expires_at)
      select id, $1, 'Pix Online', '{}'::jsonb, 1, 1, 'pending', $2, now() + interval '1 hour'
      from stores where slug = 'luske-burguer' limit 1
      returning id
    `, [code, createHash('sha256').update(token).digest('hex')]);
    orderId = created.rows[0]?.id || '';
    if (!orderId) throw new Error('Loja de teste não encontrada.');
    const other = await client.query(`
      insert into orders (store_id, public_code, payment_method, customer_snapshot, subtotal, total, financial_status, payment_access_token_hash, payment_access_expires_at)
      select id, $1, 'Pix Online', '{}'::jsonb, 1, 1, 'pending', $2, now() + interval '1 hour'
      from stores where slug = 'luske-burguer' limit 1
      returning id
    `, [otherCode, createHash('sha256').update(randomBytes(32).toString('base64url')).digest('hex')]);
    otherOrderId = other.rows[0]?.id || '';
    const missing = await fetch(`${BASE_URL}/api/payments/order?code=${code}`);
    const queryToken = await fetch(`${BASE_URL}/api/payments/order?code=${code}&token=${encodeURIComponent(token)}`);
    const correct = await fetch(`${BASE_URL}/api/payments/order?code=${code}`, { headers: { Cookie: signedPaymentCookie(code, token) } });
    const wrongCode = await fetch(`${BASE_URL}/api/payments/order?code=${otherCode}`, { headers: { Cookie: signedPaymentCookie(code, token) } });
    const ok = missing.status === 403 && queryToken.status === 403 && correct.status === 200 && wrongCode.status === 403;
    console.log(`${ok ? 'OK' : 'FAIL'} acesso privado ao pagamento: sem=${missing.status} query=${queryToken.status} cookie=${correct.status} cruzado=${wrongCode.status}`);
    return ok ? 0 : 1;
  } catch (error) {
    console.error(`FAIL acesso privado ao pagamento: ${error.message}`);
    return 1;
  } finally {
    if (orderId) await client.query('delete from orders where id = $1', [orderId]).catch(() => {});
    if (otherOrderId) await client.query('delete from orders where id = $1', [otherOrderId]).catch(() => {});
    await client.end().catch(() => {});
  }
}

async function ensureDefaultStoreCanReceiveOrders() {
  if (!process.env.DATABASE_URL) return;
  let pg;
  try {
    pg = await import('pg');
  } catch {
    return;
  }
  const client = new pg.default.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: shouldUseSsl(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false
  });
  try {
    await client.connect();
    await client.query(`
      insert into public.company_subscriptions (
        company_id,
        plan_id,
        status,
        trial_ends_at,
        current_period_starts_at,
        current_period_ends_at,
        next_renewal_at,
        billing_provider,
        metadata
      )
      select
        s.company_id,
        p.id,
        'active',
        now() + interval '14 days',
        now(),
        now() + interval '30 days',
        now() + interval '30 days',
        'test',
        jsonb_build_object('source', 'sql_injection_smoke')
      from public.stores s
      join public.subscription_plans p on p.code in ('essential', 'professional', 'premium', 'trial')
      join public.plan_features pf on pf.plan_id = p.id
      join public.platform_features f on f.id = pf.feature_id and f.code = 'orders'
      where s.slug = 'luske-burguer'
        and coalesce(pf.is_enabled, true) = true
        and not exists (
          select 1
          from public.company_subscriptions existing
          where existing.company_id = s.company_id
            and existing.status in ('active', 'trial', 'grace_period', 'payment_pending')
        )
      order by
        case p.code
          when 'essential' then 1
          when 'professional' then 2
          when 'premium' then 3
          when 'trial' then 4
          else 5
        end
      limit 1
    `);
  } catch (error) {
    console.warn(`Aviso: não foi possível preparar plano para teste de segurança: ${error.message}`);
  } finally {
    await client.end().catch(() => {});
  }
}

async function startServer() {
  const child = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      APP_URL: BASE_URL,
      PUBLIC_APP_URL: BASE_URL,
      PAYMENT_COOKIE_SECRET: paymentCookieSecret
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Servidor encerrou durante o boot.\n${logs}`);
    try {
      const response = await fetch(`${BASE_URL}/api/health`);
      if (response.ok) return child;
    } catch {
      // Aguarda o servidor subir.
    }
    await delay(250);
  }
  child.kill();
  throw new Error(`Servidor não respondeu em ${BASE_URL}.\n${logs}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function signedPaymentCookie(code, token) {
  const payload = Buffer.from(JSON.stringify({ code, token })).toString('base64url');
  const signature = createHmac('sha256', paymentCookieSecret).update(payload).digest('base64url');
  return `payment_access=${payload}.${signature}`;
}

function shouldUseSsl(databaseUrl) {
  return /sslmode=require/i.test(databaseUrl || '') || /supabase|neon|render|railway/i.test(databaseUrl || '');
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
