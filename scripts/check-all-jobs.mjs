import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const mondayJobs = await client.query("SELECT * FROM sales_automation_jobs WHERE idempotency_key LIKE 'monday-marmitarias%'");
  console.log("Monday marmitarias jobs in DB:", mondayJobs.rows.length);

  const allJobs = await client.query("SELECT id, idempotency_key, status, lead_id FROM sales_automation_jobs");
  console.log("All jobs in DB:", allJobs.rows);

  await client.end();
}

main().catch(console.error);

