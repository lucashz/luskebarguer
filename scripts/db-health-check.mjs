import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

const pool = getLocalPool();

async function run() {
  const stores = await pool.query('SELECT count(*) as total FROM store_settings');
  const leads = await pool.query('SELECT stage, count(*) FROM sales_leads GROUP BY stage ORDER BY count DESC');
  const nullImages = await pool.query('SELECT count(*) as missing FROM menu_items WHERE image_url IS NULL');
  
  const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'store_settings'");
  const bannerCol = cols.rows.some(r => r.column_name === 'cover_image_url') ? 'cover_image_url' : 
                   cols.rows.some(r => r.column_name === 'banner_url') ? 'banner_url' : null;
  
  let missingBanners = 0;
  if (bannerCol) {
    const res = await pool.query(`SELECT count(*) as missing FROM store_settings WHERE ${bannerCol} IS NULL`);
    missingBanners = res.rows[0].missing;
  }
  
  console.log('Stores count:', stores.rows[0].total);
  console.log('Leads by stage:', leads.rows);
  console.log('Menu items without photo:', nullImages.rows[0].missing);
  console.log(`Stores without cover banner (${bannerCol}):`, missingBanners);
  
  await pool.end();
}

run().catch(console.error);

