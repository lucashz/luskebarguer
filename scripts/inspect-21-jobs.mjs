import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
const pool = getLocalPool();

async function main() {
  const jobs21 = await pool.query(`
    SELECT j.id, j.run_at, j.status, l.business_name, l.phone, l.city, l.state
    FROM sales_automation_jobs j
    JOIN sales_leads l ON l.id = j.lead_id
    WHERE j.idempotency_key LIKE '2026-10-21:live:%'
    ORDER BY j.run_at ASC
  `);
  console.log('Jobs from 2026-10-21:live:');
  console.table(jobs21.rows);
  await pool.end();
}

main().catch(console.error);

