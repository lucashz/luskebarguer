import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const res = await client.query(`
    SELECT sm.id, sl.business_name, sl.phone, sm.body, sm.created_at
    FROM sales_messages sm
    JOIN sales_leads sl ON sl.id = sm.lead_id
    WHERE sm.direction = 'outbound'
      AND sl.business_name IN ('Dibon Pizzaria', 'Bozó Lanches', 'Café da Di', 'Brasa Hamburgueria Artesanal', 'Titus lanches delivery')
    ORDER BY sm.created_at DESC
    LIMIT 6
  `);

  for (const r of res.rows) {
    console.log(`=== ${r.business_name} (${r.phone}) at ${r.created_at} ===`);
    console.log(r.body);
    console.log('----------------------------------------------------');
  }

  await client.end();
}

main().catch(console.error);

