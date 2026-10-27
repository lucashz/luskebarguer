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
      segment
    FROM sales_leads
    WHERE stage = 'discovered'
      AND phone IS NOT NULL
      AND length(regexp_replace(phone, '\\D', '', 'g')) >= 10
    ORDER BY created_at DESC
  `);

  console.log(`=== CANDIDATOS COM TELEFONE DISPONÍVEL: ${res.rowCount} ===`);
  const cellPhones = res.rows.filter(r => {
    const digits = r.phone.replace(/\D/g, '');
    const local = digits.replace(/^55/, '');
    return local.length === 11 && local[2] === '9';
  });
  console.log(`Desses, celulares válidos (11 dígitos, DDD + 9...): ${cellPhones.length}`);
  console.table(cellPhones.slice(0, 15));

  await pool.end();
}

main().catch(console.error);

