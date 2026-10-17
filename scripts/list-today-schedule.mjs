import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const res = await pool.query(`
    SELECT
      to_char(j.run_at at time zone 'America/Sao_Paulo', 'HH24:MI') as time_sp,
      l.business_name,
      l.phone,
      l.city || '/' || l.state as location,
      l.metadata->>'menu_url' as menu_url,
      j.status
    FROM sales_automation_jobs j
    JOIN sales_leads l ON l.id = j.lead_id
    WHERE j.job_type = 'send_sequence'
      AND (j.run_at at time zone 'America/Sao_Paulo')::date = '2026-10-17'
    ORDER BY j.run_at ASC
  `);

  console.log('=== DISPAROS AGENDADOS PARA HOJE (17/10) - TOTAL: ' + res.rowCount + ' ===');
  console.table(res.rows);
  await pool.end();
}

main().catch(console.error);
