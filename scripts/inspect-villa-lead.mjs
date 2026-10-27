import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const res = await pool.query(`
    SELECT l.id, l.business_name, l.phone, l.city, l.stage, l.metadata
    FROM sales_leads l
    WHERE l.phone = '5548996257705' OR l.business_name ILIKE '%villa 1052%'
  `);
  console.table(res.rows.map(r => ({
    id: r.id,
    name: r.business_name,
    phone: r.phone,
    stage: r.stage,
    menu_slug: r.metadata?.menu_slug,
    menu_url: r.metadata?.menu_url
  })));
  await pool.end();
}

main().catch(console.error);
