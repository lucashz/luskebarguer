import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

const pool = getLocalPool();

async function run() {
  const res = await pool.query(`
    SELECT mi.name, mi.image_url 
    FROM menu_items mi 
    JOIN stores s ON s.id = mi.store_id 
    WHERE s.slug = 'bares'
  `);
  console.log('Items for Bares:');
  for (const r of res.rows) {
    console.log(` - ${r.name}: ${r.image_url}`);
  }
  await pool.end();
}

run().catch(console.error);
