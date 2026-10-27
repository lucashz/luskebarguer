import pg from 'pg';
try { process.loadEnvFile?.('.env'); } catch {}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const storeRes = await client.query('SELECT * FROM stores WHERE id = $1', ['4ccc7239-6634-4134-846d-858449c84f54']);
  console.log('Store:', storeRes.rows[0]);

  const catRes = await client.query('SELECT * FROM categories WHERE store_id = $1 ORDER BY position ASC', ['4ccc7239-6634-4134-846d-858449c84f54']);
  console.log('Categories count:', catRes.rows.length);
  console.log('Categories:', catRes.rows);

  const itemsRes = await client.query('SELECT id, category_id, name, price, image_url, description FROM products WHERE store_id = $1', ['4ccc7239-6634-4134-846d-858449c84f54']);
  console.log('Products count:', itemsRes.rows.length);
  console.log('Products:', itemsRes.rows);

  await client.end();
}

main().catch(console.error);
