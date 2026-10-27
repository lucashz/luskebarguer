import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const r = await pool.query(`
    SELECT j.id, j.status, 
           to_char(j.run_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') as hora,
           l.business_name, l.phone, l.city, l.stage
    FROM sales_automation_jobs j
    JOIN sales_leads l ON l.id = j.lead_id
    WHERE (j.run_at AT TIME ZONE 'America/Sao_Paulo')::date = '2026-10-21'
    ORDER BY j.run_at ASC
  `);
  console.log(`Jobs de 21/10: ${r.rowCount}`);
  console.table(r.rows);
  await pool.end();
}

main().catch(console.error);

