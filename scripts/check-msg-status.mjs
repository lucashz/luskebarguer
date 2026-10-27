import pg from 'pg';

async function main() {
  const pool = new pg.Pool({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });

  const res = await pool.query(`SELECT DISTINCT status FROM sales_messages`);
  console.log('Statuses in sales_messages:', res.rows);

  const conRes = await pool.query(`SELECT conname, pg_get_constraintdef(c.oid) as def FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid WHERE t.relname = 'sales_messages'`);
  for (const r of conRes.rows) {
    console.log(`${r.conname}: ${r.def}`);
  }

  await pool.end();
}

main().catch(console.error);
