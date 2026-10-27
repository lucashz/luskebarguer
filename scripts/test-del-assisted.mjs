import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const testId = '5fe2d2ba-5687-4e58-9a9e-26449ff0d8fe'; // Boteco Do Bakana
  try {
    const res = await client.query("DELETE FROM assisted_registrations WHERE id = $1", [testId]);
    console.log("Deleted directly:", res.rowCount);
  } catch (err) {
    console.error("FAILED TO DELETE:", err.message);
    console.error(err);
  }

  await client.end();
}

main().catch(console.error);

