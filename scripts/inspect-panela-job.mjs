import { getLocalPool } from './src/lib/local-postgrest-adapter.js';

const pool = getLocalPool();

async function main() {
  const events = await pool.query(`
    SELECT event_type, stage, result, details, created_at
    FROM sales_automation_events
    WHERE lead_id = (SELECT id FROM sales_leads WHERE business_name = 'Restaurante Panela De Barro' LIMIT 1)
    ORDER BY created_at DESC
    LIMIT 5
  `);
  console.log('Events for Restaurante Panela De Barro:');
  console.log(JSON.stringify(events.rows, null, 2));

  await pool.end();
}

main().catch(console.error);

