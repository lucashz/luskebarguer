import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const r = await pool.query(`
    SELECT id, business_name, phone, city, state, segment
    FROM sales_leads
    WHERE stage = 'discovered'
      AND phone IS NOT NULL
      AND LENGTH(REGEXP_REPLACE(phone, '\\D', '', 'g')) >= 10
      AND REGEXP_REPLACE(phone, '\\D', '', 'g') ~ '([0-9]{2}9[0-9]{8})$'
    ORDER BY created_at ASC
    LIMIT 10
  `);
  console.log(`Mobile candidates found (${r.rowCount}):`);
  for (const row of r.rows) {
    console.log(` - ${row.business_name} (${row.segment}) | ${row.city}/${row.state} | ${row.phone}`);
  }
  await pool.end();
}

main().catch(console.error);

