import pg from 'pg';

async function main() {
  const pool = new pg.Pool({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });

  const res = await pool.query(`
    SELECT m.id, m.lead_id, m.direction, m.body, m.created_at, l.business_name
    FROM sales_messages m
    JOIN sales_leads l ON l.id = m.lead_id
    WHERE m.created_at >= '2026-10-26 00:00:00'
  `);

  console.log(`Mensagens enviadas hoje (${res.rows.length}):`);
  for (const r of res.rows) {
    console.log(`- [${r.created_at}] ${r.business_name}: ${r.body.slice(0, 40)}...`);
  }

  await pool.end();
}

main().catch(console.error);

