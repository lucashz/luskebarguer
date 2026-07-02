import { readFileSync } from 'node:fs';
import pg from 'pg';

loadEnv(new URL('../.env', import.meta.url));

const baseUrl = process.env.LOCAL_BASE_URL || 'http://127.0.0.1:3000';
const connectionString = process.env.DATABASE_URL || buildConnectionString();
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const slug = `teste-isolamento-${suffix}`;
const itemName = `Item Isolamento ${suffix}`;
let companyId = null;

try {
  await client.connect();
  await createTemporaryStore();
  await assertTemporaryStoreShowsOwnItem();
  await assertDefaultStoreDoesNotShowTemporaryItem();
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
  const data = await getJson(`${baseUrl}/api/bootstrap?store=luske-burguer`);
  const names = flattenItemNames(data);
  if (names.includes(itemName)) {
    throw new Error('A loja padrao vazou item da loja temporaria.');
  }
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

function loadEnv(url) {
  const content = readFileSync(url, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    process.env[key.trim()] ||= rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
}
