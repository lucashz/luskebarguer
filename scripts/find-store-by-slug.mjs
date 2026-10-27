import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const res = await client.query("SELECT id, name, slug FROM stores WHERE slug ILIKE '%shaday%' OR name ILIKE '%shaday%'");
  console.log("Matching by name/slug:", res.rows);

  const allStores = await client.query("SELECT id, name, slug FROM stores");
  console.log("Total stores count:", allStores.rows.length);
  const found = allStores.rows.filter(s => s.name.toLowerCase().includes('shaday') || s.slug.toLowerCase().includes('shaday'));
  console.log("Filtered manually:", found);

  await client.end();
}

main().catch(console.error);

