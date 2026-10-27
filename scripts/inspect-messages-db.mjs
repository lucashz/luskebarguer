import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

async function main() {
  const phone = '5514981921392';
  const leadRes = await pool.query(`SELECT * FROM sales_leads WHERE phone LIKE $1`, [`%${phone}%`]);
  console.log('Lead found:', leadRes.rows);

  if (leadRes.rows.length > 0) {
    const leadId = leadRes.rows[0].id;
    const msgs = await pool.query(
      `SELECT id, direction, body, status, sent_at, created_at, metadata 
       FROM sales_messages 
       WHERE lead_id = $1 
       ORDER BY created_at ASC`,
      [leadId]
    );
    console.log(`\nMessages for lead (${leadId}):`, msgs.rows.length);
    for (const m of msgs.rows) {
      console.log(`[${m.direction.toUpperCase()}] ${m.created_at?.toISOString?.() || m.created_at}: ${m.body}`);
      if (m.metadata) console.log('Metadata:', JSON.stringify(m.metadata));
    }
  }

  // Also check if there are messages with this phone in metadata or raw
  const rawMsgs = await pool.query(
    `SELECT sm.*, sl.business_name, sl.phone 
     FROM sales_messages sm 
     JOIN sales_leads sl ON sm.lead_id = sl.id 
     WHERE sl.phone LIKE $1 
     ORDER BY sm.created_at ASC`,
    [`%${phone}%`]
  );
  console.log(`\nTotal matched messages:`, rawMsgs.rows.length);

  await pool.end();
}

main().catch(console.error);

