import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const res = await pool.query(`
    SELECT
      id,
      business_name,
      phone,
      city,
      state,
      segment,
      created_at
    FROM sales_leads
    WHERE stage = 'discovered'
    ORDER BY created_at DESC
    LIMIT 30
  `);

  console.log(`=== AMOSTRA DE LEADS DISCOVERED (${res.rowCount} de 108) ===`);
  console.table(res.rows);

  const cityRes = await pool.query(`
    SELECT city, state, segment, count(*)::int as count
    FROM sales_leads
    WHERE stage = 'discovered'
    GROUP BY city, state, segment
    ORDER BY count DESC
  `);
  console.log('\n=== DISCOVERED POR CIDADE E SEGMENTO ===');
  console.table(cityRes.rows);

  await pool.end();
}

main().catch(console.error);

