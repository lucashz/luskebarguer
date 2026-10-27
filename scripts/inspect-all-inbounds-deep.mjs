import pg from 'pg';

async function main() {
  const pool = new pg.Pool({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });

  const inbounds = await pool.query(`
    SELECT m.id, m.lead_id, m.body, m.created_at, l.business_name, l.phone, l.stage
    FROM sales_messages m
    JOIN sales_leads l ON l.id = m.lead_id
    WHERE m.direction = 'inbound'
    ORDER BY m.created_at DESC
  `);

  console.log(`=== TOTAL DE INBOUNDS NO BANCO: ${inbounds.rows.length} ===\n`);
  for (const r of inbounds.rows) {
    console.log(`[${r.created_at.toISOString()}] ${r.business_name} (${r.phone}) | Stage: ${r.stage}`);
    console.log(`  Mensagem recebida: "${r.body}"`);

    // Pegar o que foi enviado para ele antes
    const priorOutbound = await pool.query(`
      SELECT body, created_at, metadata->>'kind' as kind
      FROM sales_messages
      WHERE lead_id = $1 AND direction = 'outbound'
      ORDER BY created_at ASC
    `, [r.lead_id]);

    console.log(`  Histórico enviado (${priorOutbound.rows.length} msgs):`);
    for (const out of priorOutbound.rows) {
      console.log(`    - [${out.kind}] ${out.body.slice(0, 70)}...`);
    }
    console.log('------------------------------------------------------------\n');
  }

  await pool.end();
}

main().catch(console.error);

