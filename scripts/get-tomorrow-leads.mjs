import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const date = new Date(Date.now() + 86400000).toISOString().slice(0,10); // tomorrow's date
  const res = await pool.query(`
    SELECT j.id AS job_id, l.id AS lead_id, l.business_name, l.phone, to_char(j.run_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS scheduled_time
    FROM sales_automation_jobs j
    LEFT JOIN sales_leads l ON l.id = j.lead_id
    WHERE (j.run_at at time zone 'America/Sao_Paulo')::date = $1
      AND j.status = 'pending'
    ORDER BY j.run_at ASC
  `, [date]);
  console.table(res.rows);
  await pool.end();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
