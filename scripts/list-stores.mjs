import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const stores = await client.query("SELECT id, name, slug FROM stores ORDER BY created_at DESC LIMIT 20");
  console.log("Stores in cardapio DB:", stores.rows);

  const leads = await client.query("SELECT id, business_name, phone, stage FROM sales_leads ORDER BY created_at DESC LIMIT 10");
  console.log("Recent leads:", leads.rows);

  await client.end();
}

main().catch(console.error);

