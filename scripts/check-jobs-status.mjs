import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

const res = await pool.query(`
  SELECT status, count(*) 
  FROM sales_automation_jobs 
  GROUP BY status
`);
console.log('Status dos jobs em sales_automation_jobs:');
console.table(res.rows);

const recentJobs = await pool.query(`
  SELECT id, job_type, status, idempotency_key, run_at, updated_at, last_error
  FROM sales_automation_jobs
  ORDER BY updated_at DESC
  LIMIT 10
`);
console.log('\nÚltimos jobs atualizados:');
console.table(recentJobs.rows);

await pool.end();
