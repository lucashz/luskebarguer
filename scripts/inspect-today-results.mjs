import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  console.log('=== MENSAGENS DE HOJE (OUTBOUND & INBOUND) ===');
  const messages = await pool.query(`
    SELECT
      to_char(m.sent_at at time zone 'America/Sao_Paulo', 'HH24:MI:SS') as time_sp,
      l.business_name,
      l.phone,
      m.direction,
      m.status,
      m.metadata->>'kind' as kind,
      m.body
    FROM sales_messages m
    JOIN sales_leads l ON l.id = m.lead_id
    WHERE (m.sent_at at time zone 'America/Sao_Paulo')::date = '2026-10-17'
    ORDER BY m.sent_at ASC
  `);

  console.log('Total de mensagens hoje: ' + messages.rowCount);
  for (const row of messages.rows) {
    const dir = row.direction === 'inbound' ? '📥 [RESPOSTA DO CLIENTE]' : '📤 [DISPARO ENVIADO]';
    console.log(`\n${row.time_sp} | ${row.business_name} (${row.phone}) | ${dir} (${row.kind || row.status})`);
    console.log(`Mensagem: "${row.body?.slice(0, 300)}"`);
  }

  console.log('\n=== STATUS DOS LEADS DISPARADOS HOJE ===');
  const leads = await pool.query(`
    SELECT
      business_name,
      phone,
      stage,
      attempt_count,
      to_char(last_contact_at at time zone 'America/Sao_Paulo', 'HH24:MI:SS') as contact_time,
      metadata->>'menu_url' as menu_url
    FROM sales_leads
    WHERE (last_contact_at at time zone 'America/Sao_Paulo')::date = '2026-10-17'
    ORDER BY last_contact_at ASC
  `);
  console.table(leads.rows);

  console.log('\n=== STATUS DOS JOBS NA FILA HOJE ===');
  const jobs = await pool.query(`
    SELECT
      to_char(j.run_at at time zone 'America/Sao_Paulo', 'HH24:MI:SS') as scheduled_time,
      l.business_name,
      j.job_type,
      j.status,
      j.last_error
    FROM sales_automation_jobs j
    JOIN sales_leads l ON l.id = j.lead_id
    WHERE (j.run_at at time zone 'America/Sao_Paulo')::date = '2026-10-17'
    ORDER BY j.run_at ASC
  `);
  console.table(jobs.rows);

  await pool.end();
}

main().catch(console.error);

