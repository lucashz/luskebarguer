import { readFileSync } from 'node:fs';
import pg from 'pg';

loadEnv(new URL('../.env', import.meta.url));

const baseUrl = process.env.LOCAL_BASE_URL || 'http://127.0.0.1:3000';
const connectionString = process.env.DATABASE_URL || buildConnectionString();
const client = new pg.Client({
  connectionString,
  ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : false
});
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const slug = `teste-isolamento-${suffix}`;
const secondSlug = `teste-isolamento-b-${suffix}`;
const itemName = `Item Isolamento ${suffix}`;
let companyId = null;

try {
  await client.connect();
  await createTemporaryStore();
  await assertTemporaryStoreShowsOwnItem();
  await assertDefaultStoreDoesNotShowTemporaryItem();
  await assertDiningTableCodesAreStoreScoped();
  console.log('Isolamento multiempresa validado.');
} finally {
  if (companyId) {
    await client.query('delete from public.companies where id = $1', [companyId]).catch(() => {});
  }
  await client.end().catch(() => {});
}

async function createTemporaryStore() {
  const company = await client.query(`
    insert into public.companies (name, status)
    values ($1, 'trial')
    returning id
  `, [`Empresa Isolamento ${suffix}`]);
  companyId = company.rows[0].id;

  const store = await client.query(`
    insert into public.stores (company_id, name, slug, public_url, is_active)
    values ($1, $2, $3, $4, true)
    returning id
  `, [companyId, `Loja Isolamento ${suffix}`, slug, `/${slug}`]);
  const storeId = store.rows[0].id;

  await client.query(`
    insert into public.store_settings (store_id, name, slug, description)
    values ($1, $2, $3, 'Loja temporaria de teste.')
  `, [storeId, `Loja Isolamento ${suffix}`, slug]);

  const category = await client.query(`
    insert into public.menu_categories (store_id, name, sort_order, is_active)
    values ($1, 'Categoria Isolamento', 1, true)
    returning id
  `, [storeId]);

  await client.query(`
    insert into public.menu_items (store_id, category_id, name, description, price, is_available, sort_order)
    values ($1, $2, $3, 'Item exclusivo da loja temporaria.', 9.99, true, 1)
  `, [storeId, category.rows[0].id, itemName]);
}

async function assertTemporaryStoreShowsOwnItem() {
  const data = await getJson(`${baseUrl}/api/bootstrap?store=${encodeURIComponent(slug)}`);
  const names = flattenItemNames(data);
  if (!names.includes(itemName)) {
    throw new Error('A loja temporaria nao retornou o item exclusivo.');
  }
}

async function assertDefaultStoreDoesNotShowTemporaryItem() {
  const store = await client.query(`
    select slug from public.stores
    where slug <> $1 and is_active = true
    order by created_at asc
    limit 1
  `, [slug]);
  const existingSlug = store.rows[0]?.slug;
  if (!existingSlug) return;
  const data = await getJson(`${baseUrl}/api/bootstrap?store=${encodeURIComponent(existingSlug)}`);
  const names = flattenItemNames(data);
  if (names.includes(itemName)) {
    throw new Error('Outra loja vazou item da loja temporaria.');
  }
}

async function assertDiningTableCodesAreStoreScoped() {
  const stores = await client.query(`
    select id from public.stores
    where company_id = $1 and slug = $2
    limit 1
  `, [companyId, slug]);
  const firstStoreId = stores.rows[0]?.id;
  if (!firstStoreId) throw new Error('Loja temporaria nao encontrada para teste de mesas.');

  const secondStore = await client.query(`
    insert into public.stores (company_id, name, slug, public_url, is_active)
    values ($1, $2, $3, $4, true)
    returning id
  `, [companyId, `Loja Isolamento B ${suffix}`, secondSlug, `/${secondSlug}`]);
  const secondStoreId = secondStore.rows[0].id;

  await client.query(`
    insert into public.dining_tables (store_id, name, code, is_active)
    values ($1, 'Mesa 1', 'mesa-1', true)
  `, [firstStoreId]);
  await client.query(`
    insert into public.dining_tables (store_id, name, code, is_active)
    values ($1, 'Mesa 1', 'mesa-1', true)
  `, [secondStoreId]);

  let duplicated = false;
  try {
    await client.query(`
      insert into public.dining_tables (store_id, name, code, is_active)
      values ($1, 'Mesa duplicada', 'mesa-1', true)
    `, [firstStoreId]);
  } catch (error) {
    duplicated = error.code === '23505';
  }
  if (!duplicated) throw new Error('A mesma loja conseguiu duplicar o codigo mesa-1.');
}

function flattenItemNames(data) {
  return (data.categories || []).flatMap((category) => category.items || []).map((item) => item.name);
}

async function getJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Falha HTTP ${response.status}`);
  return data;
}

function buildConnectionString() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL ausente.');
  }
  return process.env.DATABASE_URL;
}

function shouldUseSsl(value) {
  return process.env.DB_SSL === 'true' || /sslmode=require/i.test(String(value || ''));
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
