import pg from 'pg';

const client = new pg.Client('postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public');
await client.connect();

const jobs = (await client.query(`
  select id, status, payload, created_at, updated_at
  from sales_automation_jobs
  where status = 'completed' and updated_at >= '2026-10-24 14:00:00-03:00'
  order by updated_at desc
  limit 2
`)).rows;

for (const j of jobs) {
  console.log('JOB:', j.id, j.status);
  console.log('PAYLOAD:', JSON.stringify(j.payload, null, 2));
}

await client.end();

