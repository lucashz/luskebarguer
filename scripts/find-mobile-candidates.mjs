import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const r = await pool.query(`
    SELECT id, business_name, city, phone, stage, segment
    FROM sales_leads
    WHERE phone ~ '^55[0-9]{2}9[0-9]{8}$'
      AND stage NOT IN ('lost', 'discarded', 'opted_out')
    ORDER BY created_at DESC
  `);
  console.log(`Total de leads com WhatsApp móvel válido (não perdidos/descartados): ${r.rowCount}`);
  console.table(r.rows);
  await pool.end();
}

main().catch(console.error);

