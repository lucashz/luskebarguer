import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const msg = await pool.query("SELECT * FROM sales_messages WHERE id = '91a9d389-7853-4d79-aff0-9989fd4a54a2'");
  console.log('Message details:', msg.rows[0]);
  await pool.end();
}

main().catch(console.error);
