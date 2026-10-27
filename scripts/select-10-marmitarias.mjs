import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const query = `
    SELECT id, business_name, phone, city, state, segment, stage, metadata
    FROM sales_leads
    WHERE attempt_count = 0 
      AND last_contact_at IS NULL
      AND stage = 'discovered'
      AND segment = 'marmitaria'
      AND NOT EXISTS (
        SELECT 1 FROM sales_messages WHERE sales_messages.lead_id = sales_leads.id
      )
    ORDER BY city ASC, created_at DESC
    LIMIT 12
  `;

  const res = await client.query(query);
  console.log(`Found ${res.rows.length} marmitarias:`);
  console.log(JSON.stringify(res.rows, null, 2));

  await client.end();
}

main().catch(console.error);
