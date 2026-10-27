import pg from 'pg';
try { process.loadEnvFile?.('.env'); } catch {}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('--- sales_leads ---');
  const leads = await client.query("SELECT * FROM sales_leads WHERE phone LIKE '%991555260%' OR phone LIKE '%99155-5260%'");
  console.log(leads.rows);

  console.log('\n--- stores ---');
  const stores = await client.query("SELECT id, name, slug, phone, created_at FROM stores WHERE phone LIKE '%991555260%' OR name ILIKE '%shaday%'");
  console.log(stores.rows);

  console.log('\n--- assisted_registrations ---');
  const assisted = await client.query("SELECT * FROM assisted_registrations WHERE phone LIKE '%991555260%' OR lead_name ILIKE '%shaday%'");
  console.log(assisted.rows);

  console.log('\n--- sales_messages ---');
  if (leads.rows.length > 0) {
    const msgs = await client.query("SELECT * FROM sales_messages WHERE lead_id = $1 ORDER BY created_at ASC", [leads.rows[0].id]);
    console.log(msgs.rows);
  }

  await client.end();
}

main().catch(console.error);
