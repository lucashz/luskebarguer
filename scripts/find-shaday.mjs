import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const stores = await client.query("SELECT id, name, slug FROM stores WHERE name ILIKE '%shaday%' OR slug ILIKE '%shaday%'");
  console.log("Matching stores:", stores.rows);

  const leads = await client.query("SELECT id, business_name, phone, stage, metadata FROM sales_leads WHERE business_name ILIKE '%shaday%' OR phone LIKE '%991555260%'");
  console.log("Matching leads:", JSON.stringify(leads.rows, null, 2));

  await client.end();
}

main().catch(console.error);

