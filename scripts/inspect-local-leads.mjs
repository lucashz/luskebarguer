import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const res = await pool.query(`
    SELECT id, business_name, phone, stage, city, state, segment, 
           metadata->>'menu_slug' as slug,
           last_contact_at, attempt_count
    FROM sales_leads
    WHERE city ILIKE '%Horizontina%' OR city ILIKE '%Três de Maio%' OR city ILIKE '%Santa Rosa%'
    ORDER BY created_at DESC
  `);
  console.table(res.rows);
  await pool.end();
}

main().catch(console.error);

