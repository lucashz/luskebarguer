import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
const pool = getLocalPool();

async function main() {
  const msgs = await pool.query("SELECT * FROM sales_messages WHERE lead_id = '8785fbab-271b-4d78-b053-d6eb8d399529'");
  console.log('Marmitaria Menu messages:', msgs.rows);
  await pool.end();
}

main().catch(console.error);
