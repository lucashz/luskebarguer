import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

const pool = getLocalPool();

const res = await pool.query(`
  SELECT id, business_name, stage, metadata->>'menu_url' as menu_url,
         metadata->>'store_id' as store_id,
         metadata->>'registration_id' as registration_id,
         metadata->>'continuity_confirmed' as continuity_confirmed
  FROM sales_leads
  WHERE metadata->>'registration_id' IS NOT NULL
  ORDER BY updated_at DESC
  LIMIT 5
`);

console.log('Sample sales_leads with registration_id:');
console.log(res.rows);

await pool.end();
