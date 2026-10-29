import pg from 'pg';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

async function check() {
  const inbounds = await pool.query(`
    SELECT 
      l.business_name,
      l.phone,
      l.stage,
      m.direction,
      m.body,
      to_char(m.created_at, 'HH24:MI:SS') as msg_time
    FROM sales_messages m
    JOIN sales_leads l ON l.id = m.lead_id
    WHERE l.metadata->>'target_date' = '2026-10-29'
      AND l.metadata->>'target_turn' = 'noite'
      AND l.id IN (
        SELECT lead_id FROM sales_messages WHERE direction = 'inbound'
      )
    ORDER BY l.business_name, m.created_at ASC
  `);
  
  console.log(`\n=== CONVERSAS COM RESPOSTAS RECEBIDAS (${inbounds.rows.length} mensagens) ===\n`);
  for (const row of inbounds.rows) {
    const icon = row.direction === 'inbound' ? '📥 [LEAD]' : '📤 [ANTIGRAVITY]';
    console.log(`[${row.msg_time}] ${icon} ${row.business_name} (${row.phone}):`);
    console.log(`   "${row.body}"\n`);
  }

  await pool.end();
}

check().catch(console.error);
