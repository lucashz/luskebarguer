import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const res = await pool.query(`
    SELECT *
    FROM sales_messages
    WHERE lead_id = '0c9823dc-84cd-4271-9459-1c213b199eaf'
    ORDER BY created_at ASC
  `);
  console.log('Messages for Refúgio Gourmet:');
  console.table(res.rows);
  await pool.end();
}

main().catch(console.error);

