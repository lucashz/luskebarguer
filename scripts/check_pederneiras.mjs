import pg from 'pg';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

async function main() {
  const pederneiras = await pool.query("SELECT id, business_name, city, state, segment, phone, metadata FROM sales_leads WHERE city ILIKE '%Pederneiras%'");
  console.log(`Found ${pederneiras.rows.length} Pederneiras leads:`);
  console.log(pederneiras.rows.map(r => ({ id: r.id, name: r.business_name, segment: r.segment, phone: r.phone })));
  await pool.end();
}

main().catch(console.error);

