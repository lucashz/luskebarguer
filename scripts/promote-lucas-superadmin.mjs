import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const res = await client.query(`
    UPDATE admin_users 
    SET role = 'superadmin'
    WHERE email = 'lucasbulow@hotmail.com'
  `);
  console.log(`Updated ${res.rowCount} admin user to superadmin.`);

  const user = await client.query("SELECT id, email, role, name FROM admin_users WHERE email = 'lucasbulow@hotmail.com'");
  console.log("Updated user:", user.rows[0]);

  await client.end();
}

main().catch(console.error);

