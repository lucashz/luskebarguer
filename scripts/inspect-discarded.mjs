import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
const pool = getLocalPool();

async function main() {
  const disc = await pool.query(`
    SELECT id, business_name, city, phone, discard_code, discard_details
    FROM sales_leads
    WHERE stage = 'discarded' AND phone ~ '^55[0-9]{2}9[0-9]{8}$'
  `);
  console.table(disc.rows);
  await pool.end();
}

main().catch(console.error);

