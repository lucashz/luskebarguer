import pg from 'pg';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

async function main() {
  const marmitarias = await pool.query(`
    SELECT id, business_name, city, state, segment, phone, metadata
    FROM sales_leads
    WHERE segment = 'marmitaria'
      AND (metadata->>'store_id' IS NULL OR metadata->>'menu_url' IS NULL)
      AND stage = 'discovered'
    LIMIT 15
  `);

  console.log(`Available unprovisioned marmitarias: ${marmitarias.rows.length}`);
  console.table(marmitarias.rows.map(r => ({ name: r.business_name.slice(0, 30), city: r.city, phone: r.phone })));
  await pool.end();
}

main().catch(console.error);

