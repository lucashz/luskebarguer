import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const r = await pool.query(`
    SELECT
      id,
      business_name,
      google_place_id,
      metadata->'evidence' as evidence,
      metadata->'photos' as photos
    FROM sales_leads
    WHERE business_name ILIKE '%Brothers%' OR business_name ILIKE '%Beer Point%'
  `);

  console.log(JSON.stringify(r.rows, null, 2));
  await pool.end();
}

main().catch(console.error);
