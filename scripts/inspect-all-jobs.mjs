import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const jobs = await pool.query(`
    SELECT j.id, j.lead_id, j.status, j.run_at, j.updated_at, l.business_name, l.phone, l.stage
    FROM sales_automation_jobs j
    JOIN sales_leads l ON l.id = j.lead_id
    WHERE j.job_type = 'send_sequence'
    ORDER BY j.run_at DESC
  `);
  console.log(`Total automation jobs send_sequence: ${jobs.rowCount}`);
  console.table(jobs.rows);

  const runs = await pool.query(`
    SELECT * FROM sales_discovery_runs ORDER BY created_at DESC
  `);
  console.log('\nRuns:');
  console.table(runs.rows);

  await pool.end();
}

main().catch(console.error);
