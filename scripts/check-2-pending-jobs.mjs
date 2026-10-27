import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const jobs = await client.query("SELECT * FROM sales_automation_jobs WHERE status IN ('pending', 'processing')");
  console.log("PENDING JOBS:", JSON.stringify(jobs.rows, null, 2));

  await client.end();
}

main().catch(console.error);

