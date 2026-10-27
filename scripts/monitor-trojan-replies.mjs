import pg from 'pg';

async function main() {
  const pool = new pg.Pool({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });

  const res = await pool.query(`
    SELECT m.id, m.direction, m.body, m.created_at, l.business_name, l.phone, l.city
    FROM sales_messages m
    JOIN sales_leads l ON l.id = m.lead_id
    WHERE m.lead_id IN (
      SELECT id FROM sales_leads WHERE metadata->>'outreach_strategy' = 'trojan_inquiry_step1'
    )
    ORDER BY m.created_at ASC
  `);

  console.log(`Mensagens trocadas no teste (${res.rows.length}):`);
  for (const r of res.rows) {
    const dir = r.direction === 'inbound' ? '📩 INBOUND (RECEBIDA)' : '📤 OUTBOUND (ENVIADA)';
    console.log(`\n${dir} | ${r.business_name} (${r.phone} - ${r.city}):`);
    console.log(`"${r.body}"`);
  }

  await pool.end();
}

main().catch(console.error);

