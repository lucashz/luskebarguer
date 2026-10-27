import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const r = await pool.query(`
    SELECT j.id, j.job_type, j.status, j.run_at, j.payload, l.business_name
    FROM sales_automation_jobs j
    LEFT JOIN sales_leads l ON l.id = j.lead_id
    WHERE j.status = 'pending'
  `);
  console.table(r.rows.map(x => ({ id: x.id.slice(0, 8), type: x.job_type, name: x.business_name, payload: JSON.stringify(x.payload) })));
  await pool.end();
}

main().catch(console.error);

