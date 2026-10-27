import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  try {
    const res = await client.query(`
      UPDATE sales_leads
      SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{outreach_strategy}', '"trojan_inquiry_step1"'::jsonb),
          attempt_count = attempt_count + 1,
          last_contact_at = now(),
          stage = 'contacted',
          updated_at = now()
      WHERE id = $1
      RETURNING *
    `, ['dc90bb07-335e-445b-903b-ecc21c899e24']);
    console.log("Update result row count:", res.rowCount);
    console.log("Updated row:", res.rows[0]);
  } catch (err) {
    console.error("Error updating:", err);
  }

  await client.end();
}

main().catch(console.error);

