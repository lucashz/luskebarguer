import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const res = await client.query(`
    SELECT id, status, last_error, payload->>'businessName' as name
    FROM sales_automation_jobs
    WHERE idempotency_key LIKE 'monday-marmitarias-2026-10-26:%'
  `);
  console.log('Jobs status:');
  for (const r of res.rows) {
    console.log(`- ${r.name}: status=${r.status}, error=${r.last_error}`);
  }

  await client.end();
}

main().catch(console.error);

