import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const beerPoint = await pool.query(`
    SELECT s.id, s.name, s.slug, s.company_id, c.name as company_name,
           (SELECT count(*)::int FROM stores WHERE company_id = s.company_id) as other_stores_in_company,
           (SELECT count(*)::int FROM orders WHERE store_id = s.id) as orders_count
    FROM stores s
    JOIN companies c ON c.id = s.company_id
    WHERE s.slug IN ('beer-point-horizontina', 'luske-burguer')
  `);

  console.log('--- BEER POINT E LSK BURGUER ---');
  console.table(beerPoint.rows);

  await pool.end();
}

main().catch(console.error);
