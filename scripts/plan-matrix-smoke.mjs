import { readFileSync, existsSync } from 'node:fs';
import pg from 'pg';

loadEnv(new URL('../.env', import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL ausente.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: shouldUseSsl(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false
});

try {
  await client.connect();
  const { rows } = await client.query(`
    SELECT p.code AS plan_code, p.monthly_price, f.code AS feature_code, pf.is_enabled, pf.limit_value
    FROM subscription_plans p
    JOIN plan_features pf ON pf.plan_id = p.id
    JOIN platform_features f ON f.id = pf.feature_id
    WHERE p.code IN ('trial','essential','professional','premium')
  `);

  const byKey = new Map(rows.map((row) => [`${row.plan_code}:${row.feature_code}`, row]));
  const expect = (plan, feature, enabled, limit) => {
    const row = byKey.get(`${plan}:${feature}`);
    assert(row, `Recurso ${feature} nao encontrado no plano ${plan}.`);
    assert(row.is_enabled === enabled, `${plan}.${feature} deveria ter enabled=${enabled}.`);
    const actualLimit = row.limit_value === null ? null : Number(row.limit_value);
    assert(actualLimit === limit, `${plan}.${feature} deveria ter limite ${limit}, recebeu ${actualLimit}.`);
  };
  const price = (plan) => Number(rows.find((row) => row.plan_code === plan)?.monthly_price || -1);

  assert(price('trial') === 0, 'Teste gratis deve custar 0.');
  assert(price('essential') === 49.9, 'Essencial deve custar 49.90.');
  assert(price('professional') === 89.9, 'Profissional deve custar 89.90.');
  assert(price('premium') === 149.9, 'Premium deve custar 149.90.');

  expect('trial', 'digital_menu', true, 10);
  expect('trial', 'menu_categories', true, 3);
  expect('trial', 'orders', true, 30);
  expect('trial', 'admin_users', true, 1);
  expect('trial', 'tables', false, null);
  expect('trial', 'basic_reports', false, null);
  expect('trial', 'advanced_reports', false, null);
  expect('trial', 'business_insights', false, null);
  expect('trial', 'manual_whatsapp', true, null);
  expect('trial', 'automatic_whatsapp', false, null);

  expect('essential', 'digital_menu', true, 25);
  expect('essential', 'menu_categories', true, 5);
  expect('essential', 'orders', true, 150);
  expect('essential', 'admin_users', true, 1);
  expect('essential', 'tables', true, 2);
  expect('essential', 'basic_reports', true, null);
  expect('essential', 'advanced_reports', false, null);
  expect('essential', 'business_insights', false, null);
  expect('essential', 'manual_whatsapp', true, null);
  expect('essential', 'automatic_whatsapp', false, null);
  expect('essential', 'promotions', false, null);
  expect('essential', 'custom_domain', false, null);

  expect('professional', 'digital_menu', true, 100);
  expect('professional', 'orders', true, null);
  expect('professional', 'admin_users', true, 5);
  expect('professional', 'tables', true, null);
  expect('professional', 'basic_reports', true, null);
  expect('professional', 'advanced_reports', true, null);
  expect('professional', 'business_insights', false, null);
  expect('professional', 'manual_whatsapp', true, null);
  expect('professional', 'automatic_whatsapp', false, null);
  expect('professional', 'promotions', true, null);
  expect('professional', 'print_kitchen', true, null);
  expect('professional', 'custom_domain', false, null);

  expect('premium', 'digital_menu', true, null);
  expect('premium', 'admin_users', true, 10);
  expect('premium', 'tables', true, null);
  expect('premium', 'basic_reports', true, null);
  expect('premium', 'advanced_reports', true, null);
  expect('premium', 'business_insights', true, null);
  expect('premium', 'manual_whatsapp', false, null);
  expect('premium', 'automatic_whatsapp', true, null);
  expect('premium', 'loyalty', true, null);
  expect('premium', 'cart_suggestions', true, null);
  expect('premium', 'custom_domain', true, null);

  console.log('Matriz de planos validada com sucesso.');
} finally {
  await client.end().catch(() => {});
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadEnv(envUrl) {
  if (!existsSync(envUrl)) return;
  const content = readFileSync(envUrl, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function shouldUseSsl(url) {
  return /sslmode=require|supabase|pooler/i.test(url || '');
}
