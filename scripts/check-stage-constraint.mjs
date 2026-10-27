import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const res = await client.query(`
    SELECT pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE conname = 'sales_leads_stage_check'
  `);
  console.log("Constraint definition:", res.rows[0]?.pg_get_constraintdef);

  await client.end();
}

main().catch(console.error);

