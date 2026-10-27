import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
const pool = getLocalPool();

async function main() {
  const pendingJobs = await pool.query(`
    SELECT j.id, j.lead_id, j.status, j.run_at, j.idempotency_key,
           l.business_name, l.phone, l.stage, l.last_contact_at, l.attempt_count
    FROM sales_automation_jobs j
    JOIN sales_leads l ON l.id = j.lead_id
    WHERE j.status = 'pending'
  `);
  console.log('Pending jobs in DB:');
  console.table(pendingJobs.rows);

  const msgs = await pool.query(`
    SELECT m.id, m.lead_id, m.direction, m.status, m.created_at, l.business_name
    FROM sales_messages m
    JOIN sales_leads l ON l.id = m.lead_id
    WHERE l.id IN (
      '0fdcc4a6-7698-44bc-9ecc-a6e850a47e02',
      '6da20384-c487-4390-af85-e5f7928b0e1d',
      'a34c229a-d711-484b-8418-6a5be79b12f9',
      '651ed46b-4e16-4ec3-9082-137413870cd4',
      '801c4f07-89bc-41df-926b-e623ba5b3697'
    )
    ORDER BY m.created_at ASC
  `);
  console.log('\nMensagens já enviadas para esses leads:');
  console.table(msgs.rows);

  await pool.end();
}

main().catch(console.error);
