import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

const pool = getLocalPool();

async function run() {
  const res = await pool.query(`
    SELECT count(*) 
    FROM menu_items 
    WHERE image_url LIKE '%photo-1608270197495%' 
       OR image_url LIKE '%photo-1535141192574%' 
       OR image_url LIKE '%photo-1606755962773%'
  `);
  console.log('Remaining 404 URLs in menu_items:', res.rows[0].count);
  await pool.end();
}

run().catch(console.error);
