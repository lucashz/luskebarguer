import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const cancelled = await client.query('SELECT id, status, last_error FROM sales_automation_jobs WHERE status = \'cancelled\'');
  console.log("Cancelled errors:", cancelled.rows);

  const res = await client.query(`
    SELECT j.id as job_id, j.status, j.run_at, j.payload, l.id as lead_id, l.business_name, l.phone, l.normalized_phone, l.city, l.stage, l.attempt_count
    FROM sales_automation_jobs j
    LEFT JOIN sales_leads l ON l.id = j.lead_id
    ORDER BY j.run_at ASC
  `);

  console.log(`=== ${res.rows.length} JOBS NA TABELA ===\n`);
  for (let i = 0; i < res.rows.length; i++) {
    const row = res.rows[i];
    console.log(`[${i+1}] Job: ${row.job_id} | Status: ${row.status} | LeadId: ${row.lead_id}`);
    console.log(`    Lead: ${row.business_name} (${row.phone}) - ${row.city}`);
    console.log(`    Stage: ${row.stage} | Attempts: ${row.attempt_count}`);
  }

  await client.end();
}

main().catch(console.error);
