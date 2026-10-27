import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const res = await client.query("SELECT id, business_name, phone, stage, attempt_count, last_contact_at, metadata FROM sales_leads WHERE phone LIKE '%991569890%'");
  console.log("Restaurante da Gaúcha in DB:", JSON.stringify(res.rows, null, 2));

  await client.end();
}

main().catch(console.error);

