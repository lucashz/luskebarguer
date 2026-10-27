import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const res = await client.query(`
    UPDATE sales_leads
    SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{outreach_strategy}', '"trojan_inquiry_step1"'::jsonb),
        attempt_count = 1,
        last_contact_at = now(),
        stage = 'awaiting_reply',
        updated_at = now()
    WHERE phone LIKE '%991569890%'
    RETURNING id, business_name, phone, stage, attempt_count, last_contact_at
  `);
  console.log("Fixed lead:", res.rows[0]);

  await client.end();
}

main().catch(console.error);

