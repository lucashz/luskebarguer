import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const leads = await client.query("SELECT id, business_name, phone, city, metadata FROM sales_leads WHERE city ILIKE '%botucatu%' OR metadata::text ILIKE '%shaday%'");
  console.log(`Found ${leads.rows.length} leads:`);
  for (const l of leads.rows) {
    console.log(`- ${l.id} | ${l.business_name} | ${l.phone} | ${l.city} | strategy: ${l.metadata?.outreach_strategy}`);
  }

  await client.end();
}

main().catch(console.error);

