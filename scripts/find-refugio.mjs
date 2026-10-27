import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const r = await pool.query("SELECT business_name, phone, normalized_phone, stage FROM sales_leads WHERE city ILIKE '%horizontina%'");
  console.table(r.rows);
  await pool.end();
}

main().catch(console.error);
