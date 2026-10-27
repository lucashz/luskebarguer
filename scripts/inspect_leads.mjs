import pg from 'pg';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

async function main() {
  const napio = await pool.query("SELECT id, business_name, phone, stage, last_contact_at, metadata FROM sales_leads WHERE business_name ILIKE '%napio%'");
  console.log("Napio:", JSON.stringify(napio.rows, null, 2));

  const stages = await pool.query("SELECT stage, count(*) FROM sales_leads GROUP BY stage ORDER BY count DESC");
  console.log("Stages count:", stages.rows);

  const nonDiscovered = await pool.query("SELECT id, business_name, phone, stage, last_contact_at, metadata FROM sales_leads WHERE stage != 'discovered' LIMIT 10");
  console.log("Non discovered:", JSON.stringify(nonDiscovered.rows, null, 2));

  const recentMessages = await pool.query("SELECT m.id, m.lead_id, m.direction, m.body, m.status, m.intent, m.sent_at, m.received_at, l.business_name, l.stage FROM sales_messages m JOIN sales_leads l ON l.id = m.lead_id ORDER BY COALESCE(m.received_at, m.sent_at, m.created_at) DESC LIMIT 10");
  console.log("Recent messages:", JSON.stringify(recentMessages.rows, null, 2));

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

