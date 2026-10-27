import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

async function main() {
  const res = await pool.query(`SELECT conname, pg_get_constraintdef(c.oid) as def FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid WHERE t.relname = 'sales_leads'`);
  for (const r of res.rows) {
    console.log(`${r.conname}: ${r.def}`);
  }
  await pool.end();
}

main().catch(console.error);
