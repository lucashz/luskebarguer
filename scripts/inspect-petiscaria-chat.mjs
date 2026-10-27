import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const leadRes = await pool.query(`SELECT * FROM sales_leads WHERE business_name ILIKE '%Petiscaria%' LIMIT 1`);
  const lead = leadRes.rows[0];
  console.log('=== CONVERSA COM ' + lead.business_name + ' (' + lead.phone + ') ===');
  console.log('Cardápio: ' + (lead.metadata?.menu_url || 'N/A'));

  const messages = await pool.query(`
    SELECT direction, body, status, created_at
    FROM sales_messages
    WHERE lead_id = $1
    ORDER BY created_at ASC
  `, [lead.id]);

  for (const m of messages.rows) {
    const time = new Date(m.created_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const dir = m.direction === 'inbound' ? '🟢 CLIENTE' : '🔵 TÁPRONTO';
    console.log(`\n[${time}] ${dir}:`);
    console.log(m.body);
  }

  // Verificar se há mensagens inbound de qualquer outro lead hoje
  console.log('\n=== TODAS AS RESPOSTAS INBOUND RECEBIDAS HOJE ===');
  const allInbound = await pool.query(`
    SELECT m.created_at, l.business_name, l.phone, m.body
    FROM sales_messages m
    JOIN sales_leads l ON l.id = m.lead_id
    WHERE m.direction = 'inbound'
      AND (m.created_at at time zone 'America/Sao_Paulo')::date = '2026-10-17'
    ORDER BY m.created_at ASC
  `);

  if (allInbound.rowCount === 0) {
    console.log('Nenhuma resposta inbound adicional hoje.');
  } else {
    for (const row of allInbound.rows) {
      const time = new Date(row.created_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      console.log(`[${time}] ${row.business_name}: "${row.body}"`);
    }
  }

  await pool.end();
}

main().catch(console.error);

