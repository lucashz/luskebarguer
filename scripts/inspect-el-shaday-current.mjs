import pg from 'pg';
try { process.loadEnvFile?.('.env'); } catch {}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const storeId = '4ccc7239-6634-4134-846d-858449c84f54';
  const cats = await client.query('SELECT * FROM menu_categories WHERE store_id = $1 ORDER BY sort_order ASC', [storeId]);
  console.log('Categories count:', cats.rows.length);
  for (const c of cats.rows) {
    console.log(`Cat: ${c.name} (${c.id})`);
  }

  const items = await client.query('SELECT id, category_id, name, price, image_url, description FROM menu_items WHERE store_id = $1 ORDER BY sort_order ASC', [storeId]);
  console.log('\nMenu items count:', items.rows.length);
  for (const item of items.rows) {
    console.log(`Item: ${item.name} - R$ ${item.price} | Img: ${item.image_url ? 'YES' : 'NO'}`);
  }

  await client.end();
}

main().catch(console.error);
