import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const r1 = await pool.query(`
    SELECT j.id, j.status, 
           to_char(j.run_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as time_brt,
           j.last_error,
           l.business_name, l.phone
    FROM sales_automation_jobs j
    LEFT JOIN sales_leads l ON l.id = j.lead_id
    WHERE (j.run_at at time zone 'America/Sao_Paulo')::date = '2026-10-21'
    ORDER BY j.run_at ASC
  `);
  console.log(`Total jobs agendados para 2026-10-21: ${r1.rowCount}`);
  if (r1.rowCount > 0) {
    console.table(r1.rows);
  }

  const r2 = await pool.query(`
    SELECT status, count(*) 
    FROM sales_automation_jobs 
    GROUP BY status
  `);
  console.log('\nStatus geral dos jobs:');
  console.table(r2.rows);

  const r3 = await pool.query(`
    SELECT id, status, 
           to_char(run_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as run_brt, 
           last_error
    FROM sales_automation_jobs
    ORDER BY run_at DESC 
    LIMIT 10
  `);
  console.log('\nÚltimos 10 jobs agendados:');
  console.table(r3.rows);

  const rPending = await pool.query(`
    SELECT j.id, j.status, 
           to_char(j.run_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as run_brt, 
           j.last_error, l.business_name, l.phone
    FROM sales_automation_jobs j
    LEFT JOIN sales_leads l ON l.id = j.lead_id
    WHERE j.status = 'pending'
    ORDER BY j.run_at ASC
  `);
  console.log('\nJobs PENDING:');
  console.table(rPending.rows);

  const r4 = await pool.query(`
    SELECT event_type, result, count(*) 
    FROM sales_automation_events 
    WHERE (created_at at time zone 'America/Sao_Paulo')::date = '2026-10-21'
    GROUP BY event_type, result
  `);
  console.log('\nEventos registrados hoje (21/10):');
  console.table(r4.rows);

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
