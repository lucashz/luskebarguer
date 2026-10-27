import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const users = await client.query("SELECT id, name, email, role, is_active FROM admin_users ORDER BY created_at ASC");
  console.log("ALL ADMIN USERS:", JSON.stringify(users.rows, null, 2));

  await client.end();
}

main().catch(console.error);

