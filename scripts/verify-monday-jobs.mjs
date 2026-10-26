import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const res = await client.query(`
    SELECT 
      j.id, 
      j.status, 
      j.run_at, 
      l.business_name, 
      l.phone, 
      l.city, 
      l.stage,
      l.metadata->>'menu_url' AS menu_url
    FROM sales_automation_jobs j
    JOIN sales_leads l ON l.id = j.lead_id
    WHERE j.idempotency_key LIKE 'monday-marmitarias-2026-10-26:%'
    ORDER BY j.run_at ASC
  `);

  console.log(`TOTAL AGENDADOS: ${res.rows.length}`);
  console.log(JSON.stringify(res.rows, null, 2));

  await client.end();
}

main().catch(console.error);

