import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

const res = await pool.query(`
  UPDATE sales_automation_jobs
  SET status = 'cancelled', updated_at = now()
  WHERE status IN ('pending', 'retry', 'claimed')
`);

console.log('Cancelled rogue jobs:', res.rowCount);

await pool.end();
