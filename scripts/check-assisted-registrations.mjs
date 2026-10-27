import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const cols = await client.query("SELECT * FROM assisted_registrations LIMIT 1");
  console.log("COLUMNS:", Object.keys(cols.rows[0]));

  const sample = await client.query("SELECT id, status, store_id, company_id, created_at, updated_at FROM assisted_registrations ORDER BY created_at DESC LIMIT 10");
  console.log("RECENT SAMPLES:", JSON.stringify(sample.rows, null, 2));

  await client.end();
}

main().catch(console.error);

