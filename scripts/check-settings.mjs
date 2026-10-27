import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const res = await pool.query(`SELECT * FROM sales_automation_settings WHERE id = 'global'`);
  console.log('Settings:', res.rows[0]);
  await pool.end();
}

main().catch(console.error);
