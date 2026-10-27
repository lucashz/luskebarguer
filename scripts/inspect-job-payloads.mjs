import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const r = await pool.query(`
    SELECT j.id as job_id, l.business_name, l.phone, j.payload
    FROM sales_automation_jobs j
    JOIN sales_leads l ON l.id = j.lead_id
    WHERE j.status = 'pending'
    ORDER BY j.run_at ASC
  `);
  for (const row of r.rows) {
    console.log(`\nJob: ${row.job_id} | ${row.business_name} | ${row.phone}`);
    console.log(`Message preview: ${row.payload?.message?.slice(0, 80)}...`);
    console.log(`Previews:`, row.payload?.previews);
  }
  await pool.end();
}

main().catch(console.error);

