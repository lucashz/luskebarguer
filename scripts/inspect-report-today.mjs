import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  console.log('====================================================');
  console.log('📊 RELATÓRIO COMPLETO DO OUTREACH DE HOJE (20/10/2026)');
  console.log('====================================================\n');

  // 1. Status de todos os 15 jobs agendados
  const jobsRes = await pool.query(`
    SELECT
      to_char(j.run_at at time zone 'America/Sao_Paulo', 'HH24:MI') as horario_agendado,
      l.business_name,
      l.phone,
      l.city || '/' || l.state as localizacao,
      j.status as job_status,
      l.stage as lead_stage,
      l.metadata->>'menu_slug' as slug,
      l.metadata->>'menu_url' as menu_url
    FROM sales_automation_jobs j
    JOIN sales_leads l ON l.id = j.lead_id
    WHERE (j.run_at at time zone 'America/Sao_Paulo')::date = '2026-10-20'
    ORDER BY j.run_at ASC
  `);

  console.log(`📌 JOBS AGENDADOS (${jobsRes.rowCount} total):`);
  console.table(jobsRes.rows.map(r => ({
    Horário: r.horario_agendado,
    Estabelecimento: r.business_name,
    Cidade: r.localizacao,
    Telefone: r.phone,
    Status: r.job_status,
    Fase: r.lead_stage
  })));

  // 2. Eventos de disparos realizados hoje
  const eventsSummary = await pool.query(`
    SELECT event_type, result, COUNT(*)::int as count
    FROM sales_automation_events
    WHERE (created_at at time zone 'America/Sao_Paulo')::date = '2026-10-20'
    GROUP BY event_type, result
    ORDER BY count DESC
  `);
  console.log('\n📌 RESUMO DE EVENTOS DE AUTOMAÇÃO HOJE:');
  console.table(eventsSummary.rows);

  // 3. Cliques nos cardápios demonstrativos hoje
  const clicksRes = await pool.query(`
    SELECT
      to_char(created_at at time zone 'America/Sao_Paulo', 'HH24:MI:SS') as horario,
      details->>'business_name' as estabelecimento,
      details->>'menu_url' as url,
      details->>'ip' as ip,
      details->>'click_number' as clique_num
    FROM sales_automation_events
    WHERE event_type = 'outreach_link_clicked'
      AND (created_at at time zone 'America/Sao_Paulo')::date = '2026-10-20'
    ORDER BY created_at ASC
  `);
  console.log(`\n📌 CLIQUES NOS CARDÁPIOS HOJE (${clicksRes.rowCount} cliques registrados):`);
  if (clicksRes.rowCount > 0) {
    console.table(clicksRes.rows);
  } else {
    console.log('Nenhum clique registrado ainda.');
  }

  // 4. Mensagens recebidas (inbound) hoje
  const inboundRes = await pool.query(`
    SELECT
      to_char(m.sent_at at time zone 'America/Sao_Paulo', 'HH24:MI:SS') as horario,
      l.business_name,
      l.phone,
      m.body
    FROM sales_messages m
    JOIN sales_leads l ON l.id = m.lead_id
    WHERE m.direction = 'inbound'
      AND (m.sent_at at time zone 'America/Sao_Paulo')::date = '2026-10-20'
    ORDER BY m.sent_at ASC
  `);
  console.log(`\n📌 RESPOSTAS RECEBIDAS DE CLIENTES HOJE (${inboundRes.rowCount} mensagens):`);
  if (inboundRes.rowCount > 0) {
    for (const msg of inboundRes.rows) {
      console.log(`[${msg.horario}] ${msg.business_name} (${msg.phone}): "${msg.body}"`);
    }
  } else {
    console.log('Nenhuma resposta recebida pelo WhatsApp ainda.');
  }

  // 5. Total de mensagens enviadas (outbound) hoje
  const outboundRes = await pool.query(`
    SELECT
      to_char(m.sent_at at time zone 'America/Sao_Paulo', 'HH24:MI:SS') as horario,
      l.business_name,
      l.phone,
      m.metadata->>'kind' as tipo,
      m.status
    FROM sales_messages m
    JOIN sales_leads l ON l.id = m.lead_id
    WHERE m.direction = 'outbound'
      AND (m.sent_at at time zone 'America/Sao_Paulo')::date = '2026-10-20'
    ORDER BY m.sent_at ASC
  `);
  console.log(`\n📌 DISPAROS OUTBOUND HOJE (${outboundRes.rowCount} mensagens):`);
  console.table(outboundRes.rows);

  await pool.end();
}

main().catch(console.error);
