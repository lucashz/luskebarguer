import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const r = await pool.query(`
    SELECT length(regexp_replace(phone, '[^0-9]', '', 'g')) as len, count(*) 
    FROM sales_leads 
    WHERE stage = 'discovered' AND phone IS NOT NULL
    GROUP BY 1
    ORDER BY 1
  `);
  console.log('Distribuição de tamanho de telefone dos leads em "discovered":');
  console.table(r.rows);
  await pool.end();
}

main().catch(console.error);
