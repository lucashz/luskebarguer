import pg from 'pg';

const client = new pg.Client('postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public');
await client.connect();

const inbounds = (await client.query(`
  SELECT m.id, m.lead_id, m.body, m.created_at, m.sent_at, l.business_name, l.phone, l.normalized_phone, l.stage, l.metadata
  FROM sales_messages m
  JOIN sales_leads l ON l.id = m.lead_id
  WHERE m.direction = 'inbound'
  ORDER BY m.created_at DESC
  LIMIT 10
`)).rows;

console.log(`Found ${inbounds.length} inbound messages:`);
for (const msg of inbounds) {
  console.log(`[INBOUND] Lead: ${msg.business_name} (${msg.phone}) | At: ${msg.created_at} | Msg: "${msg.body}" | Stage: ${msg.stage}`);
}

await client.end();
