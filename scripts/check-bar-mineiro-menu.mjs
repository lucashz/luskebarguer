import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const store = await client.query("SELECT * FROM stores WHERE slug = 'bar-do-mineiro-pederneiras-sp'");
  if (store.rows.length > 0) {
    const s = store.rows[0];
    const items = await client.query("SELECT name, price, is_available FROM menu_items WHERE store_id = $1", [s.id]);
    console.log("ITEMS COUNT:", items.rows.length);
    console.log("ITEMS:", JSON.stringify(items.rows, null, 2));
  }

  await client.end();
}

main().catch(console.error);

