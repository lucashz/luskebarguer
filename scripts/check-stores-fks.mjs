import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const fkRes = await pool.query(`
    SELECT
      tc.table_name, 
      kcu.column_name, 
      rc.delete_rule
    FROM information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.referential_constraints AS rc
      ON tc.constraint_name = rc.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE ccu.table_name = 'stores'
    ORDER BY tc.table_name;
  `);

  console.log('FKs referencing stores:');
  console.table(fkRes.rows);

  await pool.end();
}

main().catch(console.error);
