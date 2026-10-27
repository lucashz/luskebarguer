import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  // Test the query with 'active' (the broken one)
  try {
    await client.query("SELECT * FROM assisted_registrations WHERE status NOT IN ('published', 'active', 'activated') LIMIT 1");
    console.log("With 'active': SUCCEEDED");
  } catch (e) {
    console.log("With 'active': FAILED WITH ERROR ->", e.message);
  }

  // Test the query without 'active' (the fixed one)
  try {
    const res = await client.query("SELECT * FROM assisted_registrations WHERE status NOT IN ('published', 'activated') LIMIT 1");
    console.log("Without 'active': SUCCEEDED! Rows found:", res.rows.length);
  } catch (e) {
    console.log("Without 'active': FAILED ->", e.message);
  }

  await client.end();
}

main().catch(console.error);

