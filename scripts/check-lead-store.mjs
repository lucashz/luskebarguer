import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const storeRes = await client.query('SELECT * FROM stores WHERE id = $1', ['4ccc7239-6634-4134-846d-858449c84f54']);
  console.log('Store 4ccc7239:', storeRes.rows);

  const leadRes = await client.query('SELECT * FROM sales_leads WHERE id = $1', ['5ff87f0d-8131-4a26-bdfd-b125de8bb5e0']);
  console.log('Lead 5ff87f0d:', leadRes.rows);

  const anyShaday = await client.query("SELECT id, business_name, phone, stage, metadata FROM sales_leads WHERE business_name ILIKE '%El Shaday%'");
  console.log('Any El Shaday lead:', anyShaday.rows);

  await client.end();
}

main().catch(console.error);

