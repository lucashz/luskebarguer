import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const cols = await client.query("SELECT * FROM app_sessions LIMIT 1");
  console.log("APP SESSIONS COLS:", Object.keys(cols.rows[0] || {}));

  const sessions = await client.query("SELECT * FROM app_sessions ORDER BY created_at DESC LIMIT 5");
  console.log("SESSIONS:", JSON.stringify(sessions.rows, null, 2));

  await client.end();
}

main().catch(console.error);

