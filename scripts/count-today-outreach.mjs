import pg from 'pg';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const contactedTodayRes = await pool.query(`
    SELECT DISTINCT sl.id, sl.business_name, sl.phone, sl.city, sl.segment, sl.stage,
           sl.last_contact_at,
           COUNT(sm.id) as total_messages,
           MIN(sm.created_at) as first_msg_at,
           MAX(sm.created_at) as last_msg_at,
           ARRAY_AGG(DISTINCT sm.metadata->>'kind') as kinds
    FROM sales_leads sl
    JOIN sales_messages sm ON sm.lead_id = sl.id
    WHERE sm.direction = 'outbound'
      AND sm.created_at >= (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')
    GROUP BY sl.id, sl.business_name, sl.phone, sl.city, sl.segment, sl.stage, sl.last_contact_at
    ORDER BY first_msg_at ASC
  `);

  console.log(`=== TOTAL DE LEADS ÚNICOS CONTATADOS HOJE (2026-10-27): ${contactedTodayRes.rows.length} ===\n`);

  for (let i = 0; i < contactedTodayRes.rows.length; i++) {
    const l = contactedTodayRes.rows[i];
    const firstTime = new Date(l.first_msg_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const lastTime = new Date(l.last_msg_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`${(i+1).toString().padStart(2, ' ')}. [${firstTime}] ${l.business_name} (${l.city}) - Tel: ${l.phone} [${l.segment}]`);
    console.log(`    Msgs: ${l.total_messages} (${l.kinds.join(', ')}) | Stage: ${l.stage}`);
  }

  const totalMsgsRes = await pool.query(`
    SELECT count(*) as total_outbound
    FROM sales_messages
    WHERE direction = 'outbound'
      AND created_at >= (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')
  `);
  console.log(`\nTotal de mensagens outbound enviadas hoje: ${totalMsgsRes.rows[0].total_outbound}`);

  const bySegment = {};
  for (const l of contactedTodayRes.rows) {
    bySegment[l.segment || 'outro'] = (bySegment[l.segment || 'outro'] || 0) + 1;
  }
  console.log("\nPor segmento contatado hoje:", bySegment);

  const uncontactedRes = await pool.query(`
    SELECT count(*) as count
    FROM sales_leads
    WHERE attempt_count = 0 
      AND last_contact_at IS NULL
      AND stage NOT IN ('discarded', 'lost', 'won', 'opt_out')
      AND NOT EXISTS (
        SELECT 1 FROM sales_messages WHERE sales_messages.lead_id = sales_leads.id
      )
  `);
  console.log(`\nLeads 100% INTACTOS disponíveis no banco agora: ${uncontactedRes.rows[0].count}`);

  await pool.end();
}

main().catch(console.error);

