import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const jobIds = [
    '8fd1a7b2-0720-4a59-b7ec-4c0fe8516082',
    'f98c9f30-db09-4119-a258-1c432085c687',
    '54d9e03a-5843-4e89-916e-f7f135c3973f'
  ];

  const res = await pool.query(`
    SELECT j.id, l.business_name, l.phone, l.stage, j.status, j.payload->'progress' as progress,
           (SELECT count(*)::int FROM sales_messages m WHERE m.lead_id = l.id) as msg_count
    FROM sales_automation_jobs j
    JOIN sales_leads l ON l.id = j.lead_id
    WHERE j.id = ANY($1::uuid[])
  `, [jobIds]);

  console.table(res.rows);
  await pool.end();
}

main().catch(console.error);
