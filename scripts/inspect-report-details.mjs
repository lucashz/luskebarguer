import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const clicks = await pool.query(`
    SELECT 
      to_char(created_at at time zone 'America/Sao_Paulo', 'HH24:MI:SS') as horario,
      details->>'business_name' as nome,
      details->>'menu_url' as url,
      details->>'ip' as ip,
      details->>'click_number' as clique_num
    FROM sales_automation_events
    WHERE event_type = 'outreach_link_clicked'
      AND (created_at at time zone 'America/Sao_Paulo')::date = '2026-10-20'
    ORDER BY created_at ASC
  `);

  console.log('--- CLIQUES REGISTRADOS HOJE ---');
  console.table(clicks.rows);

  const responses = await pool.query(`
    SELECT 
      to_char(sent_at at time zone 'America/Sao_Paulo', 'HH24:MI:SS') as horario,
      l.business_name,
      l.phone,
      m.body
    FROM sales_messages m
    JOIN sales_leads l ON l.id = m.lead_id
    WHERE m.direction = 'inbound'
      AND (m.sent_at at time zone 'America/Sao_Paulo')::date = '2026-10-20'
    ORDER BY m.sent_at ASC
  `);

  console.log('\n--- RESPOSTAS RECEBIDAS HOJE ---');
  console.table(responses.rows);

  const failureEvents = await pool.query(`
    SELECT 
      to_char(e.created_at at time zone 'America/Sao_Paulo', 'HH24:MI:SS') as horario,
      l.business_name,
      e.event_type,
      e.result,
      e.details
    FROM sales_automation_events e
    JOIN sales_leads l ON l.id = e.lead_id
    WHERE e.result = 'failure'
      AND (e.created_at at time zone 'America/Sao_Paulo')::date = '2026-10-20'
  `);

  console.log('\n--- FALHAS REGISTRADAS HOJE ---');
  console.log(JSON.stringify(failureEvents.rows, null, 2));

  const jobs = await pool.query(`
    SELECT
      to_char(j.run_at at time zone 'America/Sao_Paulo', 'HH24:MI') as horario,
      l.business_name,
      j.status,
      j.last_error,
      l.stage
    FROM sales_automation_jobs j
    JOIN sales_leads l ON l.id = j.lead_id
    WHERE (j.run_at at time zone 'America/Sao_Paulo')::date = '2026-10-20'
    ORDER BY j.run_at ASC
  `);

  console.log('\n--- STATUS DOS 15 JOBS HOJE ---');
  console.table(jobs.rows);

  await pool.end();
}

main().catch(console.error);
