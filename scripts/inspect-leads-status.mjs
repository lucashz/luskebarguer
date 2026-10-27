import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

const pool = getLocalPool();

async function main() {
  const res = await pool.query(`
    SELECT stage, count(*) 
    FROM sales_leads 
    GROUP BY stage
  `);
  console.log('Distribuição por stage:');
  console.table(res.rows);

  const candidates = await pool.query(`
    SELECT id, business_name, city, state, phone, stage, metadata->>'menu_slug' as slug,
           created_at
    FROM sales_leads
    WHERE stage NOT IN ('contacted', 'replied', 'converted', 'unsubscribed', 'discarded')
    ORDER BY created_at DESC
    LIMIT 30
  `);
  console.log(`Leads não contactados disponíveis (${candidates.rows.length}):`);
  console.table(candidates.rows);

  await pool.end();
}

main().catch(console.error);

