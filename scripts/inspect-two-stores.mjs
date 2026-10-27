import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const store = (await pool.query("SELECT id, name, slug FROM stores WHERE slug = 'beer-point'")).rows[0];
  console.log('Loja:', store);
  const items = await pool.query("SELECT id, name, description, image_url FROM menu_items WHERE store_id = $1 ORDER BY sort_order", [store.id]);
  console.table(items.rows);

  const pStore = (await pool.query("SELECT id, name, slug FROM stores WHERE slug = 'pizzaria-em-dois-corregos-rodizi'")).rows[0];
  console.log('Loja Pizzaria:', pStore);
  const pItems = await pool.query("SELECT id, name, description, image_url FROM menu_items WHERE store_id = $1 ORDER BY sort_order", [pStore.id]);
  console.table(pItems.rows);

  await pool.end();
}

main().catch(console.error);
