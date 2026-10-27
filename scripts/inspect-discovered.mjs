import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const r = await pool.query(`
    SELECT city, segment, count(id) as total
    FROM sales_leads
    WHERE stage = 'discovered'
    GROUP BY city, segment
    ORDER BY total DESC
    LIMIT 20
  `);
  console.table(r.rows);

  const sample = await pool.query(`
    SELECT id, business_name, city, phone, segment
    FROM sales_leads
    WHERE stage = 'discovered' AND phone IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 15
  `);
  console.log('\nAmostra de leads descobertos com telefone:');
  console.table(sample.rows);

  await pool.end();
}

main().catch(console.error);

