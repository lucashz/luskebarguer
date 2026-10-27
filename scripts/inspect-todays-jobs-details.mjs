import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

const pool = getLocalPool();

async function main() {
  const res = await pool.query(`
    SELECT j.id, j.status, j.run_at, j.payload, l.business_name, l.metadata
    FROM sales_automation_jobs j
    JOIN sales_leads l ON l.id = j.lead_id
    WHERE l.business_name ILIKE '%taverna%'
    ORDER BY j.created_at DESC LIMIT 1
  `);
  console.log('Job payload for Taverna:');
  console.log(JSON.stringify(res.rows[0], null, 2));

  const allJobsToday = await pool.query(`
    SELECT j.id, j.status, j.idempotency_key,
           to_char(j.run_at at time zone 'America/Sao_Paulo', 'HH24:MI') as time_brt,
           l.business_name,
           (j.payload->>'message') as message,
           (j.payload->'previews'->>'desktopPath') as desktop,
           (j.payload->'previews'->>'mobilePath') as mobile
    FROM sales_automation_jobs j
    JOIN sales_leads l ON l.id = j.lead_id
    WHERE (j.run_at at time zone 'America/Sao_Paulo')::date = '2026-10-21'
    ORDER BY j.run_at ASC
  `);
  console.log(`\nTodos os jobs de hoje (${allJobsToday.rowCount}):`);
  console.table(allJobsToday.rows.map(r => ({
    horario: r.time_brt,
    nome: r.business_name,
    status: r.status,
    idemp: r.idempotency_key,
    tem_ref_wa: r.message?.includes('ref=wa&lid=') || false,
    desktop: r.desktop
  })));

  await pool.end();
}

main().catch(console.error);
