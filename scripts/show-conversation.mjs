import pg from 'pg';
try { process.loadEnvFile?.('.env'); } catch {}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const lead = (await client.query("SELECT * FROM sales_leads WHERE phone = '5514991555260'")).rows[0];
  console.log('Lead:', lead.business_name, lead.phone, lead.stage);

  const msgs = await client.query("SELECT direction, body, created_at, status FROM sales_messages WHERE lead_id = $1 ORDER BY created_at ASC", [lead.id]);
  console.log('Messages count:', msgs.rows.length);
  for (const m of msgs.rows) {
    console.log(`[${m.direction.toUpperCase()}] ${m.created_at.toISOString()}: ${m.body}`);
  }

  await client.end();
}

main().catch(console.error);
