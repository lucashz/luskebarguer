import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const r = await pool.query(`
    SELECT stage, count(*) as count, count(phone) as with_phone
    FROM sales_leads
    GROUP BY stage
    ORDER BY count DESC
  `);
  console.table(r.rows);

  const phoneRes = await pool.query(`
    SELECT id, business_name, phone, stage, city, state, segment, metadata->>'menu_url' as menu_url
    FROM sales_leads
    WHERE phone IS NOT NULL
      AND LENGTH(phone) >= 10
    ORDER BY stage, business_name
  `);
  console.log(`Total com telefone: ${phoneRes.rowCount}`);
  console.table(phoneRes.rows.slice(0, 30));

  await pool.end();
}

main().catch(console.error);
