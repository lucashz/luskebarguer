import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  console.log('=== DISTRIBUIÇÃO DOS LEADS POR ESTÁGIO ===');
  const stageRes = await pool.query(`
    SELECT stage, count(*)::int as count
    FROM sales_leads
    GROUP BY stage
    ORDER BY count DESC
  `);
  console.table(stageRes.rows);

  console.log('\n=== MOTIVOS DE DESCARTE ===');
  const discardRes = await pool.query(`
    SELECT discard_code, count(*)::int as count
    FROM sales_leads
    WHERE stage = 'discarded'
    GROUP BY discard_code
    ORDER BY count DESC
  `);
  console.table(discardRes.rows);

  console.log('\n=== LEADS AGENDADOS ATUALMENTE ===');
  const scheduledRes = await pool.query(`
    SELECT
      l.id,
      l.business_name,
      l.phone,
      l.city,
      l.state,
      l.segment,
      j.status as job_status,
      to_char(j.run_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as run_at_sp,
      l.metadata->>'menu_url' as menu_url
    FROM sales_automation_jobs j
    JOIN sales_leads l ON l.id = j.lead_id
    WHERE j.job_type = 'send_sequence' AND j.status IN ('pending', 'retry', 'claimed')
    ORDER BY j.run_at ASC
  `);
  console.table(scheduledRes.rows);

  console.log('\n=== CIDADES TRABALHADAS HOJE / RECENTEMENTE ===');
  const citiesRes = await pool.query(`
    SELECT city, state, count(*)::int as leads_count
    FROM sales_leads
    WHERE stage IN ('scheduled', 'awaiting_reply', 'engaged')
    GROUP BY city, state
    ORDER BY leads_count DESC
  `);
  console.table(citiesRes.rows);

  console.log('\n=== ÚLTIMAS RUNS DE DESCOBERTA ===');
  const runsRes = await pool.query(`
    SELECT id, run_key, scheduled_for, status, sent_count, to_char(started_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as started_sp
    FROM sales_discovery_runs
    ORDER BY started_at DESC
    LIMIT 5
  `);
  console.table(runsRes.rows);

  await pool.end();
}

main().catch(console.error);
