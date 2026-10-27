import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

async function main() {
  const res = await pool.query(`SELECT id, email, role, name FROM admin_users LIMIT 5`);
  console.log('Admin users:', res.rows);
  await pool.end();
}

main().catch(console.error);

