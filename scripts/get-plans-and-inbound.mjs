import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const plans = await pool.query(`
    SELECT code, name, monthly_price
    FROM subscription_plans
    ORDER BY monthly_price ASC
  `);
  console.log('=== SUBSCRIPTION PLANS ===');
  console.table(plans.rows);

  const inbound = await pool.query(`
    SELECT m.id, to_char(m.sent_at at time zone 'America/Sao_Paulo', 'HH24:MI:SS') as time,
           l.business_name, l.phone, m.body
    FROM sales_messages m
    JOIN sales_leads l ON l.id = m.lead_id
    WHERE m.direction = 'inbound'
    ORDER BY m.sent_at DESC
    LIMIT 5
  `);
  console.log('\n=== LATEST INBOUND MESSAGES ===');
  console.table(inbound.rows);

  await pool.end();
}

main().catch(console.error);
