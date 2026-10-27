import pg from 'pg';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

async function main() {
  const napio = await pool.query("SELECT * FROM sales_leads WHERE id = '5470dfe7-827a-4737-8fe7-6d65b8b275c7'");
  console.log("Napio Lead:", napio.rows[0]);

  const napioEvents = await pool.query("SELECT * FROM sales_automation_events WHERE lead_id = '5470dfe7-827a-4737-8fe7-6d65b8b275c7' ORDER BY created_at ASC");
  console.log("Napio Events:", napioEvents.rows);

  const napioMessages = await pool.query("SELECT * FROM sales_messages WHERE lead_id = '5470dfe7-827a-4737-8fe7-6d65b8b275c7' ORDER BY created_at ASC");
  console.log("Napio Messages:", napioMessages.rows);

  await pool.end();
}

main().catch(console.error);

