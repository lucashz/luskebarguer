import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const res = await client.query(`
    SELECT s.id, s.name, s.slug, l.business_name, l.city, l.phone, l.stage
    FROM stores s 
    JOIN sales_leads l ON l.metadata->>'store_id' = s.id::text 
    WHERE l.segment = 'marmitaria'
  `);
  console.log(`Marmitarias com lojas provisionadas (${res.rows.length}):`);
  for (const r of res.rows) {
    console.log(`- ${r.business_name} (${r.city}) | slug: ${r.slug} | stage: ${r.stage}`);
  }

  await client.end();
}

main().catch(console.error);

