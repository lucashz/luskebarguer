import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const leads = await client.query(
    "SELECT * FROM sales_leads WHERE phone LIKE '%981921392%' OR phone LIKE '%98192-1392%'"
  );
  console.log("LEAD DATA:", JSON.stringify(leads.rows, null, 2));

  if (leads.rows.length > 0) {
    const lead = leads.rows[0];
    const msgCols = await client.query("SELECT * FROM sales_messages LIMIT 1");
    console.log("MSG COLS:", Object.keys(msgCols.rows[0] || {}));
    const msgs = await client.query(
      "SELECT * FROM sales_messages WHERE lead_id = $1 ORDER BY created_at ASC",
      [lead.id]
    );
    console.log("MESSAGES:", JSON.stringify(msgs.rows, null, 2));

    if (lead.store_id) {
      const store = await client.query("SELECT * FROM stores WHERE id = $1", [lead.store_id]);
      console.log("STORE:", JSON.stringify(store.rows, null, 2));
    }
  }

  const plans = await client.query("SELECT * FROM plans");
  console.log("PLANS:", JSON.stringify(plans.rows, null, 2));

  await client.end();
}

main().catch(console.error);

