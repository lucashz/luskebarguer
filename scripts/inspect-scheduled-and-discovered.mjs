import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
const pool = getLocalPool();

async function main() {
  const scheduled = await pool.query(`
    SELECT l.id, l.business_name, l.phone, l.city, l.state, l.stage, l.metadata->>'menu_url' as menu_url
    FROM sales_leads l
    WHERE l.stage = 'scheduled'
  `);
  console.log('=== LEADS EM STAGE SCHEDULED (', scheduled.rowCount, ') ===');
  console.table(scheduled.rows);

  const allMobiles = await pool.query(`
    SELECT id, business_name, phone, city, state, stage, last_contact_at, attempt_count
    FROM sales_leads
    WHERE phone ~ '^55[0-9]{2}9[0-9]{8}$'
    ORDER BY stage, business_name
  `);
  console.log(`\n=== TODOS OS LEADS COM CELULAR NO BANCO (${allMobiles.rowCount}) ===`);
  console.table(allMobiles.rows);

  await pool.end();
}

main().catch(console.error);
