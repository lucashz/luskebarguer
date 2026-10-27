import pg from 'pg';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

async function main() {
  const events = await pool.query("SELECT * FROM sales_automation_events ORDER BY created_at DESC LIMIT 10");
  console.log("Recent Events:", events.rows.map(e => ({ type: e.event_type, stage: e.stage, created_at: e.created_at, lead_id: e.lead_id })));

  const messages = await pool.query("SELECT m.id, m.lead_id, m.direction, m.body, m.status, m.created_at, l.business_name, l.stage FROM sales_messages m JOIN sales_leads l ON l.id = m.lead_id ORDER BY m.created_at DESC LIMIT 10");
  console.log("Recent Messages:", messages.rows);

  await pool.end();
}

main().catch(console.error);

