import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

const pool = getLocalPool();

async function run() {
  const stores = await pool.query(`
    SELECT id, name, slug FROM stores 
    WHERE name ILIKE '%Cantinho da Rose%' OR slug ILIKE '%rose%' OR slug ILIKE '%cantinho%'
  `);
  console.log('Stores:', stores.rows);

  const leads = await pool.query(`
    SELECT id, business_name, phone, stage, preview_desktop_path, preview_mobile_path, metadata 
    FROM sales_leads 
    WHERE business_name ILIKE '%Rose%' OR business_name ILIKE '%Cantinho%'
  `);
  console.log('Leads:', leads.rows);

  if (stores.rows.length > 0) {
    const storeId = stores.rows[0].id;
    const items = await pool.query(`
      SELECT id, name, price, image_url 
      FROM menu_items 
      WHERE store_id = $1
    `, [storeId]);
    console.log(`Items in store (${stores.rows[0].name}):`, items.rows);
  }

  await pool.end();
}

run().catch(console.error);
