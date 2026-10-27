import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const engaged = await pool.query(`
    SELECT id, business_name, phone, stage, last_contact_at, attempt_count, updated_at
    FROM sales_leads
    WHERE stage = 'engaged'
    ORDER BY updated_at DESC
    LIMIT 10
  `);
  console.log('Sample engaged leads:');
  console.table(engaged.rows);

  const msgs = await pool.query(`
    SELECT lead_id, direction, status, body, created_at
    FROM sales_messages
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.log('\nSample sales messages:');
  console.table(msgs.rows);

  await pool.end();
}

main().catch(console.error);
