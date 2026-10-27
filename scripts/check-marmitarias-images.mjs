import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const res = await client.query(`
    SELECT s.id, s.name, s.slug,
           count(mi.id) as total_items,
           count(CASE WHEN mi.image_url IS NULL OR mi.image_url = '' THEN 1 END) as missing_images
    FROM stores s 
    JOIN sales_leads l ON l.metadata->>'store_id' = s.id::text 
    LEFT JOIN menu_items mi ON mi.store_id = s.id
    WHERE l.segment = 'marmitaria'
    GROUP BY s.id, s.name, s.slug
  `);

  console.log("Marmitarias menu audit:");
  for (const r of res.rows) {
    console.log(`- ${r.name} (${r.slug}): ${r.total_items} items, ${r.missing_images} missing images`);
  }

  await client.end();
}

main().catch(console.error);

