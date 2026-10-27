import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  try {
    await client.query("ALTER TABLE menu_items ADD COLUMN is_active boolean GENERATED ALWAYS AS (is_available) STORED");
    console.log("Successfully added is_active generated column to menu_items!");
  } catch (err) {
    console.log("Error or already exists:", err.message);
  }

  // Also notify postgrest to reload schema cache
  try {
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log("Notified PostgREST schema reload.");
  } catch (err) {
    console.log("Notify error:", err.message);
  }

  await client.end();
}

main().catch(console.error);

