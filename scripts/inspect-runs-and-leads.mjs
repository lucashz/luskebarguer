import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
const pool = getLocalPool();

async function main() {
  const cols = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'sales_discovery_runs'
  `);
  console.log('sales_discovery_runs columns:', cols.rows.map(r => r.column_name));

  const runs = await pool.query(`
    SELECT id, run_key, scheduled_for, status, qualified_count, preview_count, created_at 
    FROM sales_discovery_runs 
    ORDER BY created_at DESC LIMIT 10
  `);
  console.table(runs.rows);

  const pendingJobs = await pool.query(`
    SELECT j.id, j.lead_id, j.idempotency_key, j.run_at, j.status, l.business_name, l.phone, l.city
    FROM sales_automation_jobs j
    JOIN sales_leads l ON l.id = j.lead_id
    WHERE j.status = 'pending'
    ORDER BY j.run_at ASC
  `);
  console.log('Pending Jobs Details:');
  console.table(pendingJobs.rows);

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
